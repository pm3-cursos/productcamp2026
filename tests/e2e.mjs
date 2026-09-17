// Teste de ponta a ponta da plataforma de indicação, contra um servidor local.
//
// Precisa de duas coisas antes:
//
//   1. um .dev.vars (ignorado pelo git) com:
//        SESSION_SECRET=um-segredo-local-de-32-caracteres-ou-mais
//        MAIL_PROVIDER=console
//        MOSTRAR_LINK=1
//        N8N_VIP_WEBHOOK_URL=http://127.0.0.1:8799/vip   (para testar o aviso ao n8n)
//        VENDAS_API_URL=http://127.0.0.1:8798             (Worker de vendas falso, que este teste sobe)
//        VENDAS_API_TOKEN=token-vendas-local
//        SYNC_CALLBACK_TOKEN=token-callback-local
//
//   2. o schema no D1 local:
//        npx wrangler d1 execute DB --local --config tests/wrangler.e2e.toml \
//          --persist-to .wrangler/state --file=indicacao/schema.sql
//
//   3. o servidor local, apontando para o mesmo banco:
//        npx wrangler pages dev . --d1 DB=local-e2e --persist-to .wrangler/state \
//          --compatibility-date=2026-06-23 --ip 127.0.0.1 --port 8788
//
//      A data é a mesma de produção. Se o Wrangler em cache recusar a data,
//      use npx wrangler@latest.
//
// Depois:  node tests/e2e.mjs
//
// O teste sobe um Worker de vendas falso que serve a fixture
// tests/fixtures/planilha-pedidos.csv como GET /pedidos, dispara a
// sincronização pela API (botão do painel e callback) e confere o resultado.
// Ele espera um banco sem VIP liberado. Para rodar de novo, zere as tabelas:
//
//   npx wrangler d1 execute DB --local --config tests/wrangler.e2e.toml \
//     --persist-to .wrangler/state --command \
//     "DELETE FROM compras; DELETE FROM premios; DELETE FROM indicadores; \
//      DELETE FROM sincronizacoes; DELETE FROM magic_links; DELETE FROM vip_log;"
//
// Por que o tests/wrangler.e2e.toml: o `d1 execute --local` não aceita o banco
// só por flag. E ele não pode virar um wrangler.toml na raiz — ver o arquivo.
//
// A sessão de admin é forjada localmente com o mesmo SESSION_SECRET do
// servidor — é assim que o teste entra no painel sem abrir um e-mail.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788';
const SEGREDO = process.env.SESSION_SECRET || 'um-segredo-local-de-32-caracteres-ou-mais';
const PORTA_N8N = 8799;
const PORTA_VENDAS = 8798;
const TOKEN_VENDAS = process.env.VENDAS_API_TOKEN || 'token-vendas-local';
const TOKEN_CALLBACK = process.env.SYNC_CALLBACK_TOKEN || 'token-callback-local';

const { criarSessao } = await import(pathToFileURL(path.join(raiz, 'functions/_lib/session.js')).href);
const { parseDelimitado } = await import(pathToFileURL(path.join(raiz, 'tests/csv.mjs')).href);

let ok = 0;
const erros = [];
function checa(nome, condicao, extra = '') {
  if (condicao) { ok++; console.log(`  ok  ${nome}`); }
  else { erros.push(nome + (extra ? ` — ${extra}` : '')); console.log(`  FALHOU  ${nome} ${extra}`); }
}

const env = { SESSION_SECRET: SEGREDO };
const cookieAdmin = `pc_ind_sessao=${encodeURIComponent(await criarSessao(env, { email: 'eventos@pm3.com.br', papel: 'admin' }))}`;

// Retenta em ECONNRESET: quando o sync grava no SQLite local que o `pages dev`
// tem aberto, o workerd às vezes derruba a primeira conexão seguinte. Só
// acontece no ambiente local — em produção o sync escreve pela API do D1.
async function req(caminho, opcoes = {}, tentativa = 1) {
  let r;
  try {
    r = await fetch(BASE + caminho, { redirect: 'manual', ...opcoes });
  } catch (e) {
    if (tentativa >= 4) throw e;
    await new Promise((resolve) => setTimeout(resolve, 700 * tentativa));
    return req(caminho, opcoes, tentativa + 1);
  }
  const texto = await r.text();
  let dados = null;
  try { dados = JSON.parse(texto); } catch { dados = texto; }
  return { status: r.status, dados, headers: r.headers };
}

const jsonPost = (caminho, corpo, cookie, extra = {}) =>
  req(caminho, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(corpo) });

// Worker de vendas falso: serve a fixture atual como a tabela `pedidos`
// (mesmo JSON que o pm3-eventos-vendas-sync devolve em GET /pedidos).
let fixtureAtual = null;
function carregarFixture(caminho) {
  const linhas = parseDelimitado(fs.readFileSync(path.join(raiz, caminho), 'utf8'));
  const cab = linhas[0].map((c) => c.trim().toLowerCase());
  const col = (linha, nome) => { const i = cab.indexOf(nome.toLowerCase()); return i === -1 ? '' : (linha[i] || '').trim(); };
  const num = (v) => { const t = String(v).replace(/[^\d,.-]/g, ''); if (!t) return null; const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t); return Number.isFinite(n) ? n : null; };
  const data = (v) => { const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : v || null; };
  fixtureAtual = linhas.slice(1).map((l, i) => {
    const qtd = col(l, 'Número de Ingressos');
    const cancelado = /^cancelado$/i.test(qtd) ? 1 : 0;
    return {
      id: `fx${i}`, linha: i + 2, evento: col(l, 'Evento'), data_pedido: data(col(l, 'Data do Pedido')),
      nome: col(l, 'Nome'), sobrenome: col(l, 'Sobrenome') || null, email: col(l, 'E-mail').toLowerCase() || null,
      telefone: null, lote: col(l, 'Lote') || null, numero_ingressos: cancelado ? null : Number.parseInt(qtd || '1', 10),
      cancelado, valor_unitario: num(col(l, 'Valor por ingresso')), valor_total: num(col(l, 'Valor total do pedido')),
      cupom: col(l, 'Cupom') || null, categoria: col(l, 'Categoria') || null, formato: col(l, 'Formato') || null,
      modalidade: col(l, 'Modalidade') || null, sync_id: 1, atualizado_em: '2026-09-16T00:00:00Z',
    };
  });
}
const vendas = http.createServer((pedido, resposta) => {
  const url = new URL(pedido.url, 'http://x');
  if ((pedido.headers.authorization || '') !== `Bearer ${TOKEN_VENDAS}`) { resposta.writeHead(401); resposta.end('{"erro":"nao_autorizado"}'); return; }
  if (url.pathname !== '/pedidos') { resposta.writeHead(404); resposta.end('{}'); return; }
  const evento = url.searchParams.get('evento');
  const pedidos = fixtureAtual.filter((p) => !evento || p.evento === evento);
  resposta.writeHead(200, { 'Content-Type': 'application/json' });
  resposta.end(JSON.stringify({ sync_id: 1, sincronizado_em: '2026-09-16T00:00:00Z', total: pedidos.length, pedidos }));
});
await new Promise((resolve) => vendas.listen(PORTA_VENDAS, '127.0.0.1', resolve));

/** Aponta o Worker falso para a fixture e dispara a sincronização pela API do painel. */
async function sincronizar(fixture, origem) {
  carregarFixture(fixture);
  const r = await jsonPost('/api/admin/sincronizar', {}, cookieAdmin);
  if (r.status !== 200) console.log('sincronizar falhou:', r.status, JSON.stringify(r.dados).slice(0, 300));
  return r.status === 200 && r.dados.ok === true;
}

// n8n falso: guarda o último corpo recebido.
const recebidos = [];
const n8n = http.createServer((pedido, resposta) => {
  let corpo = '';
  pedido.on('data', (c) => { corpo += c; });
  pedido.on('end', () => {
    recebidos.push({ url: pedido.url, corpo: JSON.parse(corpo || '{}') });
    resposta.writeHead(200, { 'Content-Type': 'application/json' });
    resposta.end('{"ok":true}');
  });
});
await new Promise((resolve) => n8n.listen(PORTA_N8N, '127.0.0.1', resolve));

try {
  const fixture = 'tests/fixtures/planilha-pedidos.csv';

  console.log('\n== 1. sincronizar a planilha (fixture) no D1 local ==');
  checa('sincronização pela API terminou sem erro', await sincronizar(fixture, 'teste-e2e'));

  let painel = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  checa('painel responde', painel.status === 200, JSON.stringify(painel.dados).slice(0, 200));
  const kpis = painel.dados.kpis;
  checa('7 indicadores (Passaporte não-B2B, sem VIP)', painel.dados.total === 7, String(painel.dados.total));
  checa('Bruno (Passaporte B2B) não é indicador', !painel.dados.indicadores.some((i) => i.email === 'bruno.lima@email.com'));
  checa('KPI ingressos indicados = 4', kpis.compras_confirmadas === 4, JSON.stringify(kpis));
  checa('KPI qualificados = 1', kpis.qualificados === 1, String(kpis.qualificados));
  checa('KPI vip liberados = 0', kpis.vip_liberados === 0);
  checa('KPI receita soma só o que conta', Math.abs(kpis.receita - 5200) < 0.01, String(kpis.receita));
  const sync = painel.dados.ultima_sincronizacao;
  checa('registro da sincronização com origem', sync && sync.origem === 'eventos@pm3.com.br' && sync.linhas_lidas === 14, JSON.stringify(sync).slice(0, 200));
  checa('resumo lista os cupons órfãos', sync.resumo && sync.resumo.cupons_orfaos_lista.length === 2, JSON.stringify(sync.resumo && sync.resumo.cupons_orfaos_lista));
  checa('fonte de pedidos configurada', painel.dados.sync_configurado === true);
  checa('resumo guarda a referência da fonte', sync.resumo && sync.resumo.fonte_sync_id === 1 && sync.resumo.pedidos_recebidos === 14, JSON.stringify(sync.resumo).slice(0, 200));

  const marina = painel.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
  checa('Marina com 3 ingressos indicados', marina && marina.compras === 3, JSON.stringify(marina));
  checa('Marina qualificada e 1ª da fila', marina.qualificado && marina.posicao_fila_vip === 1 && marina.dentro_do_teto);
  checa('qualificou_em é a data da compra que fechou a meta', marina.qualificou_em === '2026-08-05', String(marina.qualificou_em));
  const rafael = painel.dados.indicadores.find((i) => i.email === 'rafael.antunes@email.com');
  checa('Rafael com 1, faltam 2 (cancelada e outro evento fora)', rafael && rafael.compras === 1 && rafael.faltam === 2, JSON.stringify(rafael));
  checa('Caio (Passaporte + VIP) não é indicador', !painel.dados.indicadores.some((i) => i.email === 'caio.ferreira@email.com'));
  checa('Igor (Pocket) não é indicador', !painel.dados.indicadores.some((i) => i.email === 'igor.vaz@email.com'));
  checa('nenhum código público na resposta', !JSON.stringify(painel.dados).includes('codigo_publico'));

  console.log('\n== 2. sincronizar de novo não muda nada (idempotência) ==');
  checa('segunda sincronização ok', await sincronizar(fixture, 'teste-e2e-2'));
  const painel2 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  checa('contagens idênticas', painel2.dados.kpis.compras_confirmadas === 4 && painel2.dados.total === 7, JSON.stringify(painel2.dados.kpis));
  checa('última sincronização é a nova', painel2.dados.ultima_sincronizacao.sync_id !== sync.sync_id);

  console.log('\n== 3. liberar VIP manualmente + aviso ao n8n ==');
  let r = await jsonPost('/api/admin/vip', { email: 'rafael.antunes@email.com', liberado: true }, cookieAdmin);
  checa('VIP negado para quem não qualificou', r.status === 409 && r.dados.erro === 'nao_qualificado', JSON.stringify(r.dados));

  r = await jsonPost('/api/admin/vip', { email: 'marina.castro@email.com', liberado: true }, cookieAdmin);
  checa('VIP liberado para quem qualificou', r.status === 200 && r.dados.vip_liberado === true, JSON.stringify(r.dados));
  checa('registra quem liberou', r.dados.liberado_por === 'eventos@pm3.com.br', String(r.dados.liberado_por));
  if (r.dados.webhook && r.dados.webhook.status === 'nao_configurado') {
    console.log('  (aviso ao n8n não testado: defina N8N_VIP_WEBHOOK_URL=http://127.0.0.1:8799/vip no .dev.vars)');
  } else {
    checa('aviso ao n8n entregue', r.dados.webhook && r.dados.webhook.status === 'ok', JSON.stringify(r.dados.webhook));
    const aviso = recebidos[recebidos.length - 1];
    checa('n8n recebeu o corpo com as colunas da planilha', aviso && aviso.corpo['E-mail'] === 'marina.castro@email.com' && aviso.corpo.Lote === 'VIP liberado por indicação - Cortesia' && aviso.corpo.Modalidade === 'VIP' && aviso.corpo['Número de Ingressos'] === 1, JSON.stringify(aviso));
    checa('Data do Pedido no formato da planilha', aviso && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(aviso.corpo['Data do Pedido']), aviso && aviso.corpo['Data do Pedido']);
  }

  console.log('\n== 4. a sincronização não mexe na marcação manual ==');
  checa('terceira sincronização ok', await sincronizar(fixture, 'teste-e2e-3'));
  const painel3 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  const marina3 = painel3.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
  checa('VIP de Marina continua liberado', marina3.vip_liberado === true);
  checa('liberado_por preservado', marina3.liberado_por === 'eventos@pm3.com.br');
  checa('KPI vip liberados = 1', painel3.dados.kpis.vip_liberados === 1);

  console.log('\n== 5. cortesia gravada pelo n8n mantém a indicadora ==');
  const comCortesia = path.join(raiz, 'tests/fixtures/.tmp-com-cortesia.csv');
  const linhas = fs.readFileSync(path.join(raiz, fixture), 'utf8').trimEnd().split(/\r?\n/);
  linhas.push('20/08/2026 10:00;Rafael;Antunes;rafael.antunes@email.com;;VIP liberado por indicação - Cortesia;1;0;0;;Cortesia;B2C;VIP;;;;;;20/08/2026;Pcamp 2026;2026');
  fs.writeFileSync(comCortesia, linhas.join('\n') + '\n');
  checa('sincronização com a cortesia ok', await sincronizar('tests/fixtures/.tmp-com-cortesia.csv', 'teste-e2e-4'));
  const painel4 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  checa('Rafael continua indicador com a cortesia VIP', painel4.dados.indicadores.some((i) => i.email === 'rafael.antunes@email.com'));
  fs.rmSync(comCortesia, { force: true });

  console.log('\n== 6. pedido cancelado deixa de contar ==');
  const semBruno = path.join(raiz, 'tests/fixtures/.tmp-sem-bruno.csv');
  fs.writeFileSync(semBruno, fs.readFileSync(path.join(raiz, fixture), 'utf8').replace('Lote 2;2;R$ 1.300,00;R$ 2.600,00;Marina.Castro@Email.com ', 'Lote 2;CANCELADO;R$ 1.300,00;R$ 2.600,00;Marina.Castro@Email.com '));
  checa('sincronização com cancelamento ok', await sincronizar('tests/fixtures/.tmp-sem-bruno.csv', 'teste-e2e-5'));
  const painel5 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  const marina5 = painel5.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
  checa('Marina cai para 1 ingresso', marina5.compras === 1, String(marina5.compras));
  checa('VIP já liberado não é revogado', marina5.vip_liberado === true);
  checa('KPI cai para 2', painel5.dados.kpis.compras_confirmadas === 2, String(painel5.dados.kpis.compras_confirmadas));
  fs.rmSync(semBruno, { force: true });
  checa('planilha completa de volta', await sincronizar(fixture, 'teste-e2e-6'));
  const painel6 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  checa('Marina volta a 3, sem duplicar', painel6.dados.kpis.compras_confirmadas === 4, String(painel6.dados.kpis.compras_confirmadas));

  console.log('\n== 7. login por link mágico do indicador ==');
  r = await jsonPost('/api/auth/solicitar', { email: 'MARINA.CASTRO@email.com' }, '');
  checa('sem aceite do regulamento não emite link', r.status === 400 && r.dados.erro === 'aceite_obrigatorio', JSON.stringify(r.dados));
  r = await jsonPost('/api/auth/solicitar', { email: 'MARINA.CASTRO@email.com', aceite_regulamento: 'sim' }, '');
  checa('aceite precisa ser booleano true', r.status === 400 && r.dados.erro === 'aceite_obrigatorio', JSON.stringify(r.dados));

  r = await jsonPost('/api/auth/solicitar', { email: 'MARINA.CASTRO@email.com', aceite_regulamento: true }, '');
  checa('link solicitado', r.status === 200 && r.dados.papel === 'indicador', JSON.stringify(r.dados));
  const link = r.dados.link_dev;
  checa('link de dev devolvido', Boolean(link), String(link));
  const token = new URL(link).searchParams.get('t');

  r = await jsonPost('/api/auth/solicitar', { email: 'caio.ferreira@email.com', aceite_regulamento: true }, '');
  checa('quem tem VIP não acessa como indicador', r.status === 403 && r.dados.erro === 'nao_liberado', JSON.stringify(r.dados));
  r = await jsonPost('/api/auth/solicitar', { email: 'quem.nao.existe@email.com', aceite_regulamento: true }, '');
  checa('e-mail fora da planilha recebe acesso não liberado', r.status === 403 && r.dados.erro === 'nao_liberado', JSON.stringify(r.dados));

  r = await jsonPost('/api/auth/verificar', { token }, '');
  checa('token válido cria sessão', r.status === 200 && r.dados.destino === '/indicacao/minha-pagina/', JSON.stringify(r.dados));
  const cookieIndicador = (r.headers.get('set-cookie') || '').split(';')[0];
  checa('cookie HttpOnly+Secure', /HttpOnly/.test(r.headers.get('set-cookie')) && /Secure/.test(r.headers.get('set-cookie')));
  const r2 = await jsonPost('/api/auth/verificar', { token }, '');
  checa('token é de uso único', r2.status === 401 && r2.dados.erro === 'usado', JSON.stringify(r2.dados));

  console.log('\n== 8. visão do indicador ==');
  r = await req('/api/me', { headers: { Cookie: cookieIndicador } });
  const me = r.dados;
  checa('/api/me responde', r.status === 200, JSON.stringify(me).slice(0, 200));
  checa('cupom é o e-mail', me.cupom === 'marina.castro@email.com');
  checa('3 de 3 ingressos', me.compras_confirmadas === 3 && me.faltam === 0 && me.qualificado);
  checa('vip_liberado refletido', me.vip_liberado === true);
  checa('2 indicações na lista (Ana e Bruno)', me.indicacoes.length === 2, JSON.stringify(me.indicacoes));
  checa('indicação de Bruno traz 2 ingressos', me.indicacoes.some((i) => i.quantidade === 2), JSON.stringify(me.indicacoes));
  checa('nomes abreviados na lista', me.indicacoes.every((i) => /\w+ \w\.$/.test(i.nome)), JSON.stringify(me.indicacoes.map((i) => i.nome)));
  checa('mensagem de WhatsApp com o cupom', decodeURIComponent(me.whatsapp).includes('Use meu cupom marina.castro@email.com no checkout e ganhe 10% off'));
  const jsonMe = JSON.stringify(me);
  const outrosEmails = ['ana.souza@email.com', 'bruno.lima@email.com', 'rafael.antunes@email.com', 'carla.dias@email.com'];
  checa('ranking/dados não expõem e-mail de terceiros', !outrosEmails.some((e) => jsonMe.includes(e)), jsonMe.slice(0, 400));
  checa('ranking traz só o primeiro nome', me.ranking.lideres.every((l) => l.primeiro_nome && !('email' in l) && !('codigo_publico' in l)));
  checa('ranking marca a própria pessoa', me.ranking.lideres.some((l) => l.sou_eu && l.primeiro_nome === 'Marina'), JSON.stringify(me.ranking));

  console.log('\n== 9. isolamento de papéis ==');
  r = await req('/api/admin/painel', { headers: { Cookie: cookieIndicador } });
  checa('indicador não acessa API do painel', r.status === 403, String(r.status));
  r = await req('/indicacao/pm3/', { headers: { Cookie: cookieIndicador } });
  checa('indicador é redirecionado para fora do painel', r.status === 302 && r.headers.get('location').includes('/indicacao/minha-pagina/'), `${r.status} ${r.headers.get('location')}`);
  r = await req('/api/me', { headers: { Cookie: cookieAdmin } });
  checa('admin não usa a visão do indicador', r.status === 403, String(r.status));
  r = await req('/indicacao/minha-pagina/', { headers: { Cookie: cookieAdmin } });
  checa('admin redirecionado para o painel', r.status === 302 && r.headers.get('location').includes('/indicacao/pm3/'), `${r.status} ${r.headers.get('location')}`);
  r = await req('/indicacao/pm3/', { headers: { Cookie: cookieAdmin } });
  checa('admin abre o painel', r.status === 200);

  console.log('\n== 10. CSRF e forja de cookie ==');
  r = await jsonPost('/api/admin/vip', { email: 'marina.castro@email.com', liberado: false }, cookieAdmin, { Origin: 'https://site-malicioso.com' });
  checa('origem externa é bloqueada', r.status === 403 && r.dados.erro === 'origem_invalida', JSON.stringify(r.dados));
  r = await jsonPost('/api/admin/sincronizar', {}, cookieAdmin, { Origin: 'https://site-malicioso.com' });
  checa('disparo de sync bloqueado por origem', r.status === 403, String(r.status));
  const forjado = 'pc_ind_sessao=' + encodeURIComponent(Buffer.from(JSON.stringify({ e: 'eventos@pm3.com.br', p: 'admin', x: 9999999999 })).toString('base64url') + '.assinaturafalsa');
  r = await req('/api/admin/painel', { headers: { Cookie: forjado } });
  checa('cookie forjado não abre o painel', r.status === 403, String(r.status));
  r = await jsonPost('/api/admin/sincronizar', {}, cookieIndicador);
  checa('indicador não dispara sincronização', r.status === 403, String(r.status));

  console.log('\n== 11. callback do Worker de vendas ==');
  carregarFixture(fixture);
  r = await jsonPost('/api/sync/callback', { sync_id: 2 }, '');
  checa('callback sem token é recusado', r.status === 401, String(r.status));
  r = await jsonPost('/api/sync/callback', { sync_id: 2 }, '', { Authorization: 'Bearer token-errado' });
  checa('callback com token errado é recusado', r.status === 401, String(r.status));
  r = await jsonPost('/api/sync/callback', { sync_id: 2 }, '', { Authorization: `Bearer ${TOKEN_CALLBACK}` });
  checa('callback com token sincroniza', r.status === 200 && r.dados.ok === true && r.dados.resumo.origem === 'worker', JSON.stringify(r.dados).slice(0, 200));
  const painelCb = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
  checa('painel mostra a sincronização do worker como automática', painelCb.dados.ultima_sincronizacao.origem === 'worker');

  console.log('\n== 12. exportar CSV ==');
  r = await req('/api/admin/exportar?tipo=indicadores', { headers: { Cookie: cookieAdmin } });
  checa('CSV de indicadores', r.status === 200 && String(r.dados).includes('marina.castro@email.com') && String(r.dados).includes('Posição no ranking'), String(r.dados).slice(0, 120));
  r = await req('/api/admin/exportar?tipo=compras', { headers: { Cookie: cookieAdmin } });
  checa('CSV de compras', r.status === 200 && String(r.dados).includes('Marina.Castro@Email.com') && String(r.dados).includes('cupom sem indicador'), String(r.dados).slice(0, 120));
  r = await req('/api/admin/exportar?tipo=indicadores', { headers: { Cookie: cookieIndicador } });
  checa('indicador não exporta', r.status === 403);

  console.log('\n== 13. detalhe de compras no painel ==');
  r = await req('/api/admin/compras?email=marina.castro@email.com', { headers: { Cookie: cookieAdmin } });
  checa('lista as 3 compras com o cupom da Marina', r.status === 200 && r.dados.compras.length === 3, JSON.stringify(r.dados).slice(0, 200));
  checa('marca a autoindicação como não contando', r.dados.compras.some((c) => !c.conta && c.motivo === 'compra do próprio indicador'));
  checa('as outras duas contam', r.dados.compras.filter((c) => c.conta).length === 2);

  console.log('\n== 14. limite de pedidos de link ==');
  let ultimo = 0;
  for (let i = 0; i < 7; i++) {
    const t = await jsonPost('/api/auth/solicitar', { email: 'ana.souza@email.com', aceite_regulamento: true }, '');
    ultimo = t.status;
  }
  checa('bloqueia depois de vários pedidos seguidos', ultimo === 429, String(ultimo));

  console.log('\n== 15. sessão encerrada ==');
  r = await req('/api/auth/sair', { method: 'POST', headers: { Cookie: cookieIndicador } });
  checa('sair apaga o cookie', r.status === 200 && /Max-Age=0/.test(r.headers.get('set-cookie') || ''), r.headers.get('set-cookie'));
} finally {
  n8n.close();
  vendas.close();
}

console.log(`\n${ok} verificações ok, ${erros.length} falha(s).`);
if (erros.length) { for (const e of erros) console.error(' ✗ ' + e); process.exit(1); }
