// Teste de ponta a ponta da plataforma de indicação, contra um servidor local.
//
// Precisa de duas coisas antes:
//
//   1. npx wrangler pages dev . --d1 DB --compatibility-date=2025-09-01
//      com um .dev.vars contendo SESSION_SECRET, MAIL_PROVIDER=console e
//      MOSTRAR_LINK=1
//   2. npx wrangler d1 execute DB --local --file=indicacao/schema.sql
//
// Depois:  node tests/e2e.mjs
//
// O teste espera um banco vazio. Para rodar de novo, zere as tabelas:
//
//   npx wrangler d1 execute DB --local --command \
//     "DELETE FROM compras; DELETE FROM premios; DELETE FROM indicadores; \
//      DELETE FROM imports; DELETE FROM magic_links; DELETE FROM vip_log;"
//
// A sessão de admin é forjada localmente com o mesmo SESSION_SECRET do
// servidor — é assim que o teste entra no painel sem abrir um e-mail.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788';
const SEGREDO = process.env.SESSION_SECRET || 'um-segredo-local-de-32-caracteres-ou-mais';

const { criarSessao } = await import(path.join(raiz, 'functions/_lib/session.js'));

let ok = 0;
const erros = [];
function checa(nome, condicao, extra = '') {
  if (condicao) { ok++; console.log(`  ok  ${nome}`); }
  else { erros.push(nome + (extra ? ` — ${extra}` : '')); console.log(`  FALHOU  ${nome} ${extra}`); }
}

const env = { SESSION_SECRET: SEGREDO };
const cookieAdmin = `pc_ind_sessao=${encodeURIComponent(await criarSessao(env, { email: 'eventos@pm3.com.br', papel: 'admin' }))}`;

async function req(caminho, opcoes = {}) {
  const r = await fetch(BASE + caminho, { redirect: 'manual', ...opcoes });
  const texto = await r.text();
  let dados = null;
  try { dados = JSON.parse(texto); } catch { dados = texto; }
  return { status: r.status, dados, headers: r.headers };
}

function form(caminho, tipo, acao) {
  const fd = new FormData();
  fd.append('arquivo', new Blob([fs.readFileSync(caminho)]), caminho.split('/').pop());
  fd.append('tipo', tipo);
  fd.append('acao', acao);
  return fd;
}

const fixture = `${raiz}/tests/fixtures/sympla-participantes.xlsx`;

console.log('\n== 1. importar lista de indicadores (derivada do export) ==');
let r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'indicadores', 'prever') });
checa('prévia de indicadores responde 200', r.status === 200, JSON.stringify(r.dados).slice(0,200));
checa('VIP fica fora da lista de cupons', r.dados.resumo && r.dados.resumo.excluidos_vip === 1, JSON.stringify(r.dados.resumo));
const previstos = r.dados.resumo.indicadores_na_planilha;

r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'indicadores', 'aplicar') });
checa('aplicou indicadores', r.status === 200 && r.dados.aplicado === true, JSON.stringify(r.dados).slice(0,200));
checa('gravou todos os indicadores previstos', r.dados.resumo.novos === previstos, `${r.dados.resumo.novos} vs ${previstos}`);

console.log('\n== 2. prévia das compras (não deve gravar) ==');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'compras', 'prever') });
const prev = r.dados.resumo;
checa('prévia lê 9 linhas', prev.linhas_lidas === 9, JSON.stringify(prev));
checa('prévia conta 8 aprovadas', prev.aprovadas === 8, String(prev.aprovadas));
checa('prévia prevê 1 qualificado (Marina)', prev.qualificados_agora === 1, String(prev.qualificados_agora));
checa('prévia acha 1 autoindicação', prev.autoindicacoes === 1, String(prev.autoindicacoes));
checa('prévia acha 3 cupons órfãos', prev.cupons_orfaos === 3, String(prev.cupons_orfaos));
checa('prévia não altera VIP', prev.vip_alterados === 0);

let painel = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
checa('prévia não gravou compras', painel.dados.kpis.compras_confirmadas === 0, String(painel.dados.kpis.compras_confirmadas));

console.log('\n== 3. aplicar compras ==');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'compras', 'aplicar') });
const ap = r.dados.resumo;
checa('aplicou compras', r.status === 200 && r.dados.aplicado === true, JSON.stringify(r.dados).slice(0,300));
checa('9 novas compras', ap.novas === 9, String(ap.novas));
checa('1 qualificou agora', ap.qualificados_agora === 1, String(ap.qualificados_agora));
checa('0 marcações de VIP alteradas', ap.vip_alterados === 0, String(ap.vip_alterados));

painel = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
checa('só a Marina pontua enquanto os outros cupons são órfãos', painel.dados.kpis.compras_confirmadas === 3, JSON.stringify(painel.dados.kpis));

console.log('\n== 4. completar a lista de cupons recalcula retroativamente ==');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(`${raiz}/tests/fixtures/lista-indicadores.csv`, 'indicadores', 'aplicar') });
checa('lista de cupons aplicada', r.status === 200 && r.dados.aplicado === true, JSON.stringify(r.dados).slice(0, 300));
checa('3 novos indicadores (rafael, ana, diego)', r.dados.resumo.novos === 3, String(r.dados.resumo.novos));
checa('import de cupons não altera VIP', r.dados.resumo.vip_alterados === 0, String(r.dados.resumo.vip_alterados));

painel = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
const kpis = painel.dados.kpis;
checa('KPI compras confirmadas = 5', kpis.compras_confirmadas === 5, JSON.stringify(kpis));
checa('KPI qualificados = 1', kpis.qualificados === 1, String(kpis.qualificados));
checa('KPI vip liberados = 0', kpis.vip_liberados === 0);
checa('KPI receita soma só o que conta', Math.abs(kpis.receita - 6070.5) < 0.01, String(kpis.receita));
const marina = painel.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
checa('Marina com 3 compras', marina && marina.compras === 3, JSON.stringify(marina));
checa('Marina qualificada e 1ª da fila', marina.qualificado && marina.posicao_fila_vip === 1 && marina.dentro_do_teto);
const ana = painel.dados.indicadores.find((i) => i.email === 'ana.souza@email.com');
checa('Ana com 1 compra, faltam 2', ana && ana.compras === 1 && ana.faltam === 2, JSON.stringify(ana));
const diego = painel.dados.indicadores.find((i) => i.email === 'diego.farias@email.com');
checa('Diego inativo aparece com 0 compras', diego && diego.ativo === false && diego.compras === 0, JSON.stringify(diego));
checa('nenhum indicador VIP na lista', !painel.dados.indicadores.some((i) => i.email === 'fabiana.rocha@email.com'));

console.log('\n== 4b. reimportar a mesma planilha (idempotência) ==');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'compras', 'aplicar') });
checa('reimport: 0 novas', r.dados.resumo.novas === 0, String(r.dados.resumo.novas));
checa('reimport: 9 atualizadas', r.dados.resumo.atualizadas === 9, String(r.dados.resumo.atualizadas));
checa('reimport: 0 qualificaram agora', r.dados.resumo.qualificados_agora === 0, String(r.dados.resumo.qualificados_agora));
checa('reimport: 0 ausentes', r.dados.resumo.ausentes === 0, String(r.dados.resumo.ausentes));
checa('reimport: 1 cupom órfão restante', r.dados.resumo.cupons_orfaos === 1, String(r.dados.resumo.cupons_orfaos));
const painel2 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
checa('contagens idênticas após reimport', painel2.dados.kpis.compras_confirmadas === 5, String(painel2.dados.kpis.compras_confirmadas));
const marina2 = painel2.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
checa('qualificou_em preservado', marina2.qualificou_em === marina.qualificou_em, `${marina2.qualificou_em} vs ${marina.qualificou_em}`);

console.log('\n== 5. liberar VIP manualmente ==');
r = await req('/api/admin/vip', { method: 'POST', headers: { Cookie: cookieAdmin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana.souza@email.com', liberado: true }) });
checa('VIP negado para quem não qualificou', r.status === 409 && r.dados.erro === 'nao_qualificado', JSON.stringify(r.dados));

r = await req('/api/admin/vip', { method: 'POST', headers: { Cookie: cookieAdmin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'marina.castro@email.com', liberado: true }) });
checa('VIP liberado para quem qualificou', r.status === 200 && r.dados.vip_liberado === true, JSON.stringify(r.dados));
checa('registra quem liberou', r.dados.liberado_por === 'eventos@pm3.com.br', String(r.dados.liberado_por));

console.log('\n== 6. import não mexe na marcação manual ==');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'compras', 'aplicar') });
checa('reimport após liberação: 0 VIP alterados', r.dados.resumo.vip_alterados === 0, String(r.dados.resumo.vip_alterados));
const painel3 = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
const marina3 = painel3.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
checa('VIP de Marina continua liberado', marina3.vip_liberado === true);
checa('liberado_por preservado', marina3.liberado_por === 'eventos@pm3.com.br');

console.log('\n== 7. login por link mágico do indicador ==');
r = await req('/api/auth/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'MARINA.CASTRO@email.com' }) });
checa('link solicitado', r.status === 200 && r.dados.papel === 'indicador', JSON.stringify(r.dados));
const link = r.dados.link_dev;
checa('link de dev devolvido', Boolean(link), String(link));
const token = new URL(link).searchParams.get('t');

r = await req('/api/auth/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'quem.nao.existe@email.com' }) });
checa('e-mail fora da lista recebe acesso não liberado', r.status === 403 && r.dados.erro === 'nao_liberado', JSON.stringify(r.dados));

r = await req('/api/auth/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
checa('token válido cria sessão', r.status === 200 && r.dados.destino === '/indicacao/minha-pagina/', JSON.stringify(r.dados));
const cookieIndicador = (r.headers.get('set-cookie') || '').split(';')[0];
checa('cookie HttpOnly+Secure', /HttpOnly/.test(r.headers.get('set-cookie')) && /Secure/.test(r.headers.get('set-cookie')));

const r2 = await req('/api/auth/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
checa('token é de uso único', r2.status === 401 && r2.dados.erro === 'usado', JSON.stringify(r2.dados));

console.log('\n== 8. visão do indicador ==');
r = await req('/api/me', { headers: { Cookie: cookieIndicador } });
const me = r.dados;
checa('/api/me responde', r.status === 200, JSON.stringify(me).slice(0, 200));
checa('cupom é o e-mail', me.cupom === 'marina.castro@email.com');
checa('3 de 3 compras', me.compras_confirmadas === 3 && me.faltam === 0 && me.qualificado);
checa('vip_liberado refletido', me.vip_liberado === true);
checa('3 indicações na lista', me.indicacoes.length === 3, JSON.stringify(me.indicacoes));
checa('nomes abreviados na lista', me.indicacoes.every((i) => /\w+ \w\.$/.test(i.nome)), JSON.stringify(me.indicacoes.map(i=>i.nome)));
checa('mensagem de WhatsApp com o cupom', decodeURIComponent(me.whatsapp).includes('Use meu cupom marina.castro@email.com no checkout e ganhe 10% off'));
const jsonMe = JSON.stringify(me);
const outrosEmails = ['pedro.lima@email.com','julia.reis@email.com','caio.nunes@email.com','leticia.alves@email.com','ana.souza@email.com'];
checa('ranking/dados não expõem e-mail de terceiros', !outrosEmails.some((e) => jsonMe.includes(e)), jsonMe.slice(0,400));
checa('ranking traz só primeiro nome e código', me.ranking.lideres.every((l) => l.primeiro_nome && l.codigo_publico && !('email' in l)));

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
r = await req('/api/admin/vip', { method: 'POST', headers: { Cookie: cookieAdmin, 'Content-Type': 'application/json', Origin: 'https://site-malicioso.com' }, body: JSON.stringify({ email: 'marina.castro@email.com', liberado: false }) });
checa('origem externa é bloqueada', r.status === 403 && r.dados.erro === 'origem_invalida', JSON.stringify(r.dados));
const forjado = 'pc_ind_sessao=' + encodeURIComponent(Buffer.from(JSON.stringify({ e: 'eventos@pm3.com.br', p: 'admin', x: 9999999999 })).toString('base64url') + '.assinaturafalsa');
r = await req('/api/admin/painel', { headers: { Cookie: forjado } });
checa('cookie forjado não abre o painel', r.status === 403, String(r.status));

console.log('\n== 11. exportar CSV ==');
r = await req('/api/admin/exportar?tipo=indicadores', { headers: { Cookie: cookieAdmin } });
checa('CSV de indicadores', r.status === 200 && String(r.dados).includes('marina.castro@email.com') && String(r.dados).includes('Posição no ranking'), String(r.dados).slice(0, 120));
r = await req('/api/admin/exportar?tipo=compras', { headers: { Cookie: cookieAdmin } });
checa('CSV de compras', r.status === 200 && String(r.dados).includes('A7C-90211'), String(r.dados).slice(0, 120));
r = await req('/api/admin/exportar?tipo=indicadores', { headers: { Cookie: cookieIndicador } });
checa('indicador não exporta', r.status === 403);

console.log('\n== 12. planilha com colunas erradas ==');
const arquivoRuim = path.join(raiz, 'tests/fixtures/.tmp-colunas-erradas.csv');
fs.writeFileSync(arquivoRuim, 'Nome;Email\nAna;ana@x.com\n');
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(arquivoRuim, 'compras', 'prever') });
checa('reclama das colunas obrigatórias', r.status === 422 && r.dados.mensagem.includes('Nº ingresso'), JSON.stringify(r.dados));
fs.rmSync(arquivoRuim, { force: true });

console.log('\n== 13. detalhe de compras no painel ==');
r = await req('/api/admin/compras?email=marina.castro@email.com', { headers: { Cookie: cookieAdmin } });
checa('lista as 5 compras do cupom', r.status === 200 && r.dados.compras.length === 5, JSON.stringify(r.dados).slice(0,200));
checa('marca a autoindicação como não contando', r.dados.compras.some((c) => !c.conta && c.motivo === 'compra do próprio indicador'));
checa('marca a pendente como não contando', r.dados.compras.some((c) => !c.conta && c.motivo === 'pagamento não aprovado'));

console.log('\n== 14. compra cancelada sai da foto e deixa de contar ==');
const semCaio = `${raiz}/tests/fixtures/sympla-participantes-sem-caio.xlsx`;
r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(semCaio, 'compras', 'aplicar') });
checa('detecta 1 compra aprovada ausente da planilha', r.dados.resumo.ausentes === 1, JSON.stringify(r.dados.resumo));
let painelC = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
let marinaC = painelC.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
checa('Marina volta a 2 compras', marinaC.compras === 2, String(marinaC.compras));
checa('histórico de qualificação preservado', marinaC.qualificou_em === marina.qualificou_em);
checa('VIP já liberado não é revogado pelo import', marinaC.vip_liberado === true);
checa('KPI cai para 4 compras confirmadas', painelC.dados.kpis.compras_confirmadas === 4, String(painelC.dados.kpis.compras_confirmadas));

r = await req('/api/admin/importar', { method: 'POST', headers: { Cookie: cookieAdmin }, body: form(fixture, 'compras', 'aplicar') });
checa('reimportar a foto completa devolve a compra', r.dados.resumo.ausentes === 0, JSON.stringify(r.dados.resumo));
painelC = await req('/api/admin/painel', { headers: { Cookie: cookieAdmin } });
marinaC = painelC.dados.indicadores.find((i) => i.email === 'marina.castro@email.com');
checa('Marina volta a 3 compras', marinaC.compras === 3, String(marinaC.compras));
checa('não duplicou nada', painelC.dados.kpis.compras_confirmadas === 5, String(painelC.dados.kpis.compras_confirmadas));

console.log('\n== 15. limite de pedidos de link ==');
let ultimo = 0;
for (let i = 0; i < 7; i++) {
  const t = await req('/api/auth/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana.souza@email.com' }) });
  ultimo = t.status;
}
checa('bloqueia depois de vários pedidos seguidos', ultimo === 429, String(ultimo));

console.log('\n== 16. sessão encerrada ==');
r = await req('/api/auth/sair', { method: 'POST', headers: { Cookie: cookieIndicador } });
checa('sair apaga o cookie', r.status === 200 && /Max-Age=0/.test(r.headers.get('set-cookie') || ''), r.headers.get('set-cookie'));

console.log(`\n${ok} verificações ok, ${erros.length} falha(s).`);
if (erros.length) { for (const e of erros) console.error(' ✗ ' + e); process.exit(1); }
