// Testes da plataforma de indicação. Sem dependências: `node tests/run.mjs`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// pathToFileURL: no Windows, import() de caminho absoluto sem file:// falha.
const modulo = (relativo) => import(pathToFileURL(path.join(raiz, relativo)).href);
const lib = (nome) => modulo(path.join('functions/_lib', nome));

const { chaveTexto, normalizarEmail, parseQuantidade, cupomEhEmail, parseValorBR, parseDataSympla, nomeAbreviado, iniciais, primeiroNome, formatarBRL, formatarBRLCompacto, agoraBR } = await lib('util.js');
const { gerarCSV } = await lib('csv.js');
const { mapearColunas, lerCompras, derivarIndicadores, lerPlanilha, idDaLinha } = await lib('planilha.js');
const { calcularContagens, dataDeQualificacao, montarFilaVip, montarRanking, dentroDoTeto } = await lib('reconciliacao.js');
const { criarSessao, lerSessao, ehAdmin, cookieSessao } = await lib('session.js');
const { META_COMPRAS, TETO_VIP, ADMINS, mensagemWhatsApp, TEXTO_VIP_BANNER, TEXTO_VIP_CUPOM_ATIVO, LOTE_VIP_CORTESIA } = await lib('config.js');
const { montarAvisoVip } = await lib('webhook.js');
const { parseDelimitado, detectarSeparador } = await modulo('sync/csv.js');
const { montarSnapshot, gerarSQL, sql } = await modulo('sync/snapshot.js');

let passou = 0;
const falhas = [];

async function teste(nome, fn) {
  try {
    await fn();
    passou++;
  } catch (e) {
    falhas.push({ nome, e });
  }
}

// ---------------------------------------------------------------- util
await teste('normalizarEmail tira espaços e caixa', () => {
  assert.equal(normalizarEmail(' Ana.Souza@Email.com '), 'ana.souza@email.com');
  assert.equal(normalizarEmail('MARINA CASTRO@email.com'), 'marinacastro@email.com');
  assert.equal(normalizarEmail(null), '');
});

await teste('parseQuantidade lê CANCELADO, número e vazio', () => {
  assert.deepEqual(parseQuantidade('CANCELADO'), { cancelado: true, quantidade: 0 });
  assert.deepEqual(parseQuantidade(' cancelado '), { cancelado: true, quantidade: 0 });
  assert.deepEqual(parseQuantidade('3'), { cancelado: false, quantidade: 3 });
  assert.deepEqual(parseQuantidade(2), { cancelado: false, quantidade: 2 });
  assert.deepEqual(parseQuantidade(''), { cancelado: false, quantidade: 1 });
  assert.deepEqual(parseQuantidade('0'), { cancelado: false, quantidade: 1 });
});

await teste('cupomEhEmail só aceita cupom em formato de e-mail', () => {
  assert.equal(cupomEhEmail('ana.souza@email.com'), true);
  assert.equal(cupomEhEmail(' Ana.Souza@Email.com '), true);
  assert.equal(cupomEhEmail('PCAMP10'), false);
  assert.equal(cupomEhEmail(''), false);
  assert.equal(cupomEhEmail('@'), false);
});

await teste('agoraBR escreve dd/mm/aaaa hh:mm', () => {
  assert.match(agoraBR(), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
});

await teste('parseValorBR entende os formatos da Sympla', () => {
  assert.equal(parseValorBR('R$ 1.214,10'), 1214.1);
  assert.equal(parseValorBR('1.214,10'), 1214.1);
  assert.equal(parseValorBR('1214.10'), 1214.1);
  assert.equal(parseValorBR('1.214'), 1214);
  assert.equal(parseValorBR('12.345,67'), 12345.67);
  assert.equal(parseValorBR(1849), 1849);
  assert.equal(parseValorBR(''), 0);
  assert.equal(parseValorBR(null), 0);
  assert.equal(parseValorBR('grátis'), 0);
});

await teste('parseDataSympla normaliza data br e iso', () => {
  assert.equal(parseDataSympla('05/09/2026 14:32'), '2026-09-05 14:32');
  assert.equal(parseDataSympla('5/9/26'), '2026-09-05');
  assert.equal(parseDataSympla('2026-09-05T14:32:00'), '2026-09-05 14:32');
  assert.equal(parseDataSympla(''), null);
});

await teste('nomes exibidos são abreviados', () => {
  assert.equal(nomeAbreviado('Marcela Andrade'), 'Marcela A.');
  assert.equal(nomeAbreviado('luana pires de sá'), 'Luana S.');
  assert.equal(nomeAbreviado('Thiago'), 'Thiago');
  assert.equal(iniciais('Ana Souza'), 'AS');
  assert.equal(primeiroNome('ana souza'), 'Ana');
});

await teste('formatação de moeda', () => {
  assert.equal(formatarBRL(1214.1), 'R$ 1.214,10');
  assert.equal(formatarBRL(0), 'R$ 0,00');
  assert.equal(formatarBRLCompacto(415000), 'R$ 415k');
});

// ---------------------------------------------------------------- csv
await teste('CSV (fixture) respeita aspas, separador e linhas vazias', () => {
  const linhas = parseDelimitado('a;b\n"x;y";"diz ""oi"""\n\n1;2\n');
  assert.deepEqual(linhas, [['a', 'b'], ['x;y', 'diz "oi"'], ['1', '2']]);
  assert.equal(detectarSeparador('a,b,c\n'), ',');
  assert.equal(detectarSeparador('a;b;c\n'), ';');
});

await teste('gerarCSV escapa e usa ponto e vírgula', () => {
  const csv = gerarCSV(['a', 'b'], [['x;y', 'diz "oi"'], [1, null]]);
  assert.equal(csv, '﻿a;b\r\n"x;y";"diz ""oi"""\r\n1;\r\n');
});

// ---------------------------------------------------------------- planilha
const fixture = parseDelimitado(fs.readFileSync(path.join(raiz, 'tests/fixtures/planilha-pedidos.csv'), 'utf8'));
const CAB = fixture[0];

await teste('mapearColunas casa os nomes da planilha de pedidos', () => {
  const { indices, faltando } = mapearColunas(CAB);
  assert.deepEqual(faltando, []);
  assert.equal(CAB[indices.email], 'E-mail');
  assert.equal(CAB[indices.cupom], 'Cupom');
  assert.equal(CAB[indices.quantidade], 'Número de Ingressos');
  assert.equal(CAB[indices.valor], 'Valor total do pedido');
  assert.equal(CAB[indices.valor_unitario], 'Valor por ingresso');
  assert.equal(CAB[indices.data_compra], 'Data do Pedido');
  assert.equal(CAB[indices.modalidade], 'Modalidade');
  assert.equal(CAB[indices.evento], 'Evento');
});

await teste('mapearColunas reclama das colunas obrigatórias que faltam', () => {
  const { faltando } = mapearColunas(['Nome', 'Sobrenome', 'Telefone']);
  assert.deepEqual(faltando, ['E-mail', 'Cupom', 'Modalidade', 'Evento', 'Número de Ingressos']);
});

await teste('lerCompras filtra evento e canceladas e normaliza os campos', () => {
  const lido = lerCompras(fixture);
  assert.equal(lido.linhasLidas, 15);
  assert.equal(lido.outrosEventos, 1, 'Gabi é do Pcamp 2025');
  assert.equal(lido.canceladas, 1, 'Diego está CANCELADO');
  assert.equal(lido.compras.length, 13);
  const bruno = lido.compras.find((c) => c.comprador_email === 'bruno.lima@email.com');
  assert.equal(bruno.cupom, 'Marina.Castro@Email.com', 'cupom bruto preservado');
  assert.equal(bruno.cupom_email, 'marina.castro@email.com', 'cupom normalizado');
  assert.equal(bruno.quantidade, 2);
  assert.equal(bruno.valor, 2600);
  assert.equal(bruno.valor_unitario, 1300);
  assert.equal(bruno.data_compra, '2026-08-05 15:00');
  assert.equal(bruno.comprador_nome, 'Bruno Lima');
  assert.equal(bruno.comprador_primeiro_nome, 'Bruno');
  const elisa = lido.compras.find((c) => c.comprador_email === 'elisa.prado@email.com');
  assert.equal(elisa.cupom, 'PCAMP10');
  assert.equal(elisa.cupom_email, '', 'cupom que não é e-mail não vira indicação');
});

await teste('idDaLinha é estável e distingue linhas iguais em posições diferentes', () => {
  assert.equal(idDaLinha(2, ['a', 'b']), idDaLinha(2, ['a', 'b']));
  assert.notEqual(idDaLinha(2, ['a', 'b']), idDaLinha(3, ['a', 'b']));
  assert.match(idDaLinha(1, ['x']), /^[0-9a-f]{16}$/);
});

await teste('indicador = Passaporte sem VIP; VIP de cortesia não exclui', () => {
  const { compras } = lerCompras(fixture);
  const { indicadores, excluidosVip, excluidosB2B } = derivarIndicadores(compras);
  const emails = indicadores.map((i) => i.email).sort();
  assert.deepEqual(emails, [
    'ana.souza@email.com',
    'carla.dias@email.com',
    'elisa.prado@email.com',
    'fabio.rocha@email.com',
    'hugo.teles@email.com',
    'marina.castro@email.com',
    'rafael.antunes@email.com',
  ]);
  assert.equal(excluidosVip, 1, 'Caio tem Passaporte e VIP de verdade');
  assert.equal(excluidosB2B, 1, 'Bruno só tem Passaporte B2B');
  assert.ok(!emails.includes('bruno.lima@email.com'), 'B2B não indica');
  assert.ok(!emails.includes('igor.vaz@email.com'), 'Pocket não indica');
  assert.ok(emails.includes('marina.castro@email.com'), 'VIP cortesia mantém a Marina');
  const marina = indicadores.find((i) => i.email === 'marina.castro@email.com');
  assert.equal(marina.primeiro_nome, 'Marina');
  assert.equal(marina.nome_completo, 'Marina Castro');
});

await teste('lote de cortesia é o texto exato combinado com o n8n', () => {
  assert.equal(LOTE_VIP_CORTESIA, 'VIP liberado por indicação - Cortesia');
});

// ---------------------------------------------------------------- reconciliação
const planilha = lerPlanilha(fixture);
const contagens = calcularContagens({ compras: planilha.compras, indicadores: planilha.indicadores });

await teste('conta Número de Ingressos, ignora auto-indicação e cupom órfão', () => {
  const marina = contagens.porIndicador.get('marina.castro@email.com');
  assert.equal(marina.total, 3, 'Ana (1) + Bruno (2)');
  assert.equal(marina.receita, 3900);
  assert.equal(marina.qualificado, true);
  assert.equal(marina.qualificou_em, '2026-08-05 15:00', 'data da compra que fechou a meta');
  assert.equal(contagens.porIndicador.get('rafael.antunes@email.com').total, 1, 'Carla; Diego cancelado e Gabi de outro evento');
  assert.equal(contagens.diagnostico.autoindicacoes, 1, 'Marina com o próprio cupom');
  assert.equal(contagens.diagnostico.cuponsOrfaosDistintos, 2, 'caio (VIP) e ninguem');
  assert.equal(contagens.cuponsOrfaos.get('caio.ferreira@email.com'), 1);
});

await teste('meta é 3 ingressos indicados', () => {
  assert.equal(META_COMPRAS, 3);
  assert.equal(dataDeQualificacao([{ quantidade: 1, data_compra: 'a' }, { quantidade: 1, data_compra: 'b' }]), null);
  assert.equal(dataDeQualificacao([{ quantidade: 2, data_compra: 'a' }, { quantidade: 1, data_compra: 'b' }]), 'b');
  assert.equal(dataDeQualificacao([{ quantidade: 3, data_compra: 'a' }]), 'a');
});

await teste('indicador inativo não recebe compras nem entra na contagem', () => {
  const inativos = planilha.indicadores.map((i) => (i.email === 'marina.castro@email.com' ? { ...i, ativo: 0 } : i));
  const r = calcularContagens({ compras: planilha.compras, indicadores: inativos });
  assert.equal(r.porIndicador.has('marina.castro@email.com'), false);
  assert.equal(r.cuponsOrfaos.get('marina.castro@email.com'), 3, 'Ana, Bruno e a própria Marina viram órfãs');
});

await teste('sincronizar a mesma planilha duas vezes dá o mesmo resultado (idempotência)', () => {
  const a = montarSnapshot(fixture, { agora: 'T' });
  const b = montarSnapshot(fixture, { agora: 'T' });
  assert.deepEqual(a.contagens, b.contagens);
  assert.deepEqual(a.compras.map((c) => c.id_compra), b.compras.map((c) => c.id_compra));
});

await teste('fila do VIP segue a ordem de chegada à meta e respeita o teto de 50', () => {
  assert.equal(TETO_VIP, 50);
  const premios = [];
  for (let i = 0; i < 55; i++) {
    premios.push({ email: 'p' + i + '@x.com', compras_confirmadas: 3, qualificou_em: '2026-09-' + String(1 + (i % 28)).padStart(2, '0') + ' ' + String(i).padStart(2, '0') + ':00' });
  }
  premios.push({ email: 'zero@x.com', compras_confirmadas: 1, qualificou_em: null });
  const fila = montarFilaVip(premios);
  assert.equal(fila.get('p0@x.com'), 1);
  assert.equal(fila.has('zero@x.com'), false);
  assert.equal(dentroDoTeto(50), true);
  assert.equal(dentroDoTeto(51), false);
  assert.equal(dentroDoTeto(null), false);
  assert.equal([...fila.values()].filter((p) => p <= 50).length, 50);
});

await teste('ranking ordena por ingressos e empata na mesma posição', () => {
  const r = montarRanking([
    { email: 'a@x', compras_confirmadas: 1 },
    { email: 'b@x', compras_confirmadas: 5 },
    { email: 'c@x', compras_confirmadas: 5 },
    { email: 'd@x', compras_confirmadas: 0 },
  ]);
  assert.deepEqual(r.map((x) => [x.email, x.posicao]), [['b@x', 1], ['c@x', 1], ['a@x', 3], ['d@x', 4]]);
});

// ---------------------------------------------------------------- snapshot / SQL
await teste('montarSnapshot marca conta/motivo compra a compra', () => {
  const snap = montarSnapshot(fixture, { agora: 'T' });
  assert.deepEqual(snap.faltando, []);
  const por = (email) => snap.compras.filter((c) => c.comprador_email === email);
  assert.equal(por('ana.souza@email.com')[0].conta, 1);
  assert.equal(por('elisa.prado@email.com')[0].motivo, 'cupom não é um e-mail');
  assert.equal(por('fabio.rocha@email.com')[0].motivo, 'cupom sem indicador');
  assert.equal(por('marina.castro@email.com').find((c) => c.cupom_email).motivo, 'compra do próprio indicador');
  assert.equal(snap.resumo.indicadores, 7);
  assert.equal(snap.resumo.qualificados, 1);
  assert.equal(snap.resumo.ingressos_indicados, 4);
});

await teste('gerarSQL nunca toca em vip_liberado e apaga só o que ficou velho', () => {
  const snap = montarSnapshot(fixture, { agora: 'T' });
  const statements = gerarSQL(snap, 123, 'teste');
  const tudo = statements.join('\n');
  assert.ok(!/INSERT INTO premios \([^)]*vip_liberado/.test(tudo), 'não pode inserir vip_liberado');
  assert.ok(!/SET[^;]*vip_liberado\s*=/.test(tudo), 'não pode atualizar vip_liberado');
  assert.ok(!/liberado_por|liberado_em/.test(tudo));
  assert.ok(tudo.includes('DELETE FROM compras WHERE sync_id <> 123;'));
  assert.ok(tudo.includes('DELETE FROM indicadores WHERE sync_id <> 123;'));
  assert.ok(tudo.includes('DELETE FROM premios WHERE vip_liberado = 0 AND email NOT IN'));
  assert.ok(tudo.includes("('planilha', 123, 'teste'"));
  assert.ok(!tudo.includes('DELETE FROM compras;'), 'nunca esvazia a tabela');
});

await teste('literal SQL escapa aspas e trata nulos', () => {
  assert.equal(sql("d'agua"), "'d''agua'");
  assert.equal(sql(null), 'NULL');
  assert.equal(sql(1.5), '1.5');
  assert.equal(sql(true), '1');
});

await teste('faltando coluna, o snapshot não gera nada', () => {
  const snap = montarSnapshot([['Nome', 'Telefone'], ['a', 'b']]);
  assert.deepEqual(snap.faltando, ['E-mail', 'Cupom', 'Modalidade', 'Evento', 'Número de Ingressos']);
  assert.equal(snap.compras.length, 0);
});

// ---------------------------------------------------------------- webhook
await teste('aviso ao n8n tem exatamente as colunas da planilha', () => {
  const corpo = montarAvisoVip({ nome: 'Marina Castro', email: 'marina.castro@email.com', quando: '16/09/2026 10:00' });
  assert.deepEqual(corpo, {
    'Data do Pedido': '16/09/2026 10:00',
    Nome: 'Marina Castro',
    'E-mail': 'marina.castro@email.com',
    Lote: 'VIP liberado por indicação - Cortesia',
    'Número de Ingressos': 1,
    'Valor por ingresso': 0,
    'Valor total do pedido': 0,
    Cupom: '',
    Categoria: 'Cortesia',
    Formato: 'B2C',
    Modalidade: 'VIP',
  });
});

await teste('a linha que o n8n grava é lida de volta como cortesia e mantém o indicador', () => {
  const corpo = montarAvisoVip({ nome: 'Rafael Antunes', email: 'rafael.antunes@email.com', quando: '16/09/2026 10:00' });
  const linha = CAB.map((coluna) => {
    if (coluna in corpo) return String(corpo[coluna]);
    if (coluna === 'Evento') return 'Pcamp 2026';
    return '';
  });
  const { indicadores } = lerPlanilha([...fixture, linha]);
  assert.ok(indicadores.some((i) => i.email === 'rafael.antunes@email.com'), 'Rafael continua indicador');
});

// ---------------------------------------------------------------- acesso
await teste('allowlist de admin tem exatamente os três e-mails do time', () => {
  assert.deepEqual(ADMINS, [
    'jaqueline.santos@pm3.com.br',
    'luiza.pagani@pm3.com.br',
    'larissa.chinaglia@pm3.com.br',
  ]);
  assert.equal(ehAdmin('JAQUELINE.SANTOS@pm3.com.br'), true);
  assert.equal(ehAdmin('ana.souza@email.com'), false);
  assert.equal(ehAdmin('jaqueline.santos@pm3.com.br.evil.com'), false);
  assert.equal(ehAdmin(''), false);
});

const env = { SESSION_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres' };
const requestCom = (valor) =>
  new Request('https://x/', { headers: { Cookie: `pc_ind_sessao=${encodeURIComponent(valor)}` } });

await teste('sessão assinada volta a ser lida', async () => {
  const valor = await criarSessao(env, { email: 'Ana.Souza@Email.com', papel: 'indicador' });
  const sessao = await lerSessao(requestCom(valor), env);
  assert.deepEqual(sessao, { email: 'ana.souza@email.com', papel: 'indicador' });
});

await teste('sessão adulterada é rejeitada', async () => {
  const valor = await criarSessao(env, { email: 'ana@x.com', papel: 'indicador' });
  const mexido = valor.slice(0, -3) + 'aaa';
  assert.equal(await lerSessao(requestCom(mexido), env), null);
  assert.equal(await lerSessao(requestCom(valor), { SESSION_SECRET: 'outro-segredo-com-32-caracteres!!' }), null);
  assert.equal(await lerSessao(new Request('https://x/'), env), null);
});

await teste('cookie forjado por quem sabe o e-mail do admin não vira sessão', async () => {
  const payload = Buffer.from(
    JSON.stringify({ e: 'jaqueline.santos@pm3.com.br', p: 'admin', x: 9999999999 })
  ).toString('base64url');
  assert.equal(await lerSessao(requestCom(`${payload}.assinaturafalsa`), env), null);
  assert.equal(await lerSessao(requestCom(payload), env), null);
});

await teste('papel admin é reconferido contra a allowlist ao ler a sessão', async () => {
  const valor = await criarSessao(env, { email: 'ana.souza@email.com', papel: 'admin' });
  assert.equal(await lerSessao(requestCom(valor), env), null, 'assinatura válida, mas não é admin');
});

await teste('sessão expirada é rejeitada', async () => {
  const original = Date.now;
  Date.now = () => original() - 48 * 3600 * 1000;
  const antiga = await criarSessao(env, { email: 'ana@x.com', papel: 'indicador' });
  Date.now = original;
  assert.equal(await lerSessao(requestCom(antiga), env), null);
});

await teste('cookie de sessão é HttpOnly, Secure e SameSite', () => {
  const cabecalho = cookieSessao('abc');
  assert.match(cabecalho, /HttpOnly/);
  assert.match(cabecalho, /Secure/);
  assert.match(cabecalho, /SameSite=Lax/);
  assert.match(cabecalho, /Path=\//);
});

await teste('SESSION_SECRET ausente não gera sessão insegura', async () => {
  await assert.rejects(() => criarSessao({}, { email: 'a@x.com', papel: 'indicador' }));
  await assert.rejects(() => criarSessao({ SESSION_SECRET: 'curto' }, { email: 'a@x.com', papel: 'indicador' }));
});

// ---------------------------------------------------------------- textos
await teste('mensagem de WhatsApp usa o texto fixo com o cupom', () => {
  const msg = mensagemWhatsApp('ana.souza@email.com');
  assert.equal(
    msg,
    'Quero você comigo no Product Camp 2026! Use meu cupom ana.souza@email.com no checkout e ganhe 10% off: https://www.sympla.com.br/evento/product-camp-2026-sao-paulo/3220593'
  );
});

// ------------------------------------------------- textos fixos nas telas
// Critério de aceite: o estado "VIP conquistado" exibe exatamente os textos
// combinados. Eles ficam escritos no HTML (renderizam sem esperar JS), então o
// teste compara o HTML com as constantes de config.js — se alguém reescrever
// um dos dois, o teste acusa.
const htmlIndicador = fs.readFileSync(
  path.join(raiz, 'indicacao/minha-pagina/index.html'),
  'utf8'
);
const semEspacos = (texto) => texto.replace(/\s+/g, ' ').trim();

await teste('a tela do indicador traz o aviso de VIP palavra por palavra', () => {
  assert.ok(
    semEspacos(htmlIndicador).includes(semEspacos(TEXTO_VIP_BANNER.replace('Upgrade garantido!', '<b>Upgrade garantido!</b>'))),
    'o texto do banner de VIP mudou'
  );
});

await teste('a tela do indicador traz a mensagem de cupom ativo palavra por palavra', () => {
  assert.ok(
    semEspacos(htmlIndicador).includes(semEspacos(TEXTO_VIP_CUPOM_ATIVO)),
    'o texto complementar do VIP mudou'
  );
});

await teste('as regras do programa aparecem na tela do indicador', () => {
  const html = semEspacos(htmlIndicador);
  for (const trecho of [
    'pessoas que ainda não compraram ingresso',
    'virar compra',
    '3 indicações suas comprarem',
    '50 primeiros',
    'Quem já tem ingresso VIP não participa como indicador',
  ]) {
    assert.ok(html.includes(trecho), `regra ausente na tela: ${trecho}`);
  }
});

// ---------------------------------------------------------------- relatório
console.log(`\n${passou} teste(s) passaram.`);
if (falhas.length) {
  console.error(`${falhas.length} falha(s):\n`);
  for (const f of falhas) {
    console.error(`✗ ${f.nome}`);
    console.error(`  ${f.e && f.e.message ? f.e.message.split('\n').join('\n  ') : f.e}\n`);
  }
  process.exit(1);
}
console.log('Tudo verde.');
