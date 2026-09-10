// Testes da plataforma de indicação. Sem dependências: `node tests/run.mjs`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = (nome) => import(path.join(raiz, 'functions/_lib', nome));

const { chaveTexto, normalizarEmail, pagamentoAprovado, parseValorBR, parseDataSympla, nomeAbreviado, iniciais, primeiroNome, formatarBRL, formatarBRLCompacto } = await lib('util.js');
const { parseDelimitado, detectarSeparador, gerarCSV } = await lib('csv.js');
const { lerXlsx } = await lib('xlsx.js');
const { mapearColunas, lerCompras, lerIndicadores, derivarIndicadores } = await lib('planilha.js');
const { calcularContagens, resolverQualificacao, montarFilaVip, montarRanking, dentroDoTeto } = await lib('reconciliacao.js');
const { criarSessao, lerSessao, ehAdmin, cookieSessao } = await lib('session.js');
const { META_COMPRAS, TETO_VIP, ADMINS, mensagemWhatsApp, TEXTO_VIP_BANNER, TEXTO_VIP_CUPOM_ATIVO } = await lib('config.js');

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

await teste('pagamentoAprovado só aceita aprovado', () => {
  assert.equal(pagamentoAprovado('Aprovado'), true);
  assert.equal(pagamentoAprovado('APROVADO'), true);
  assert.equal(pagamentoAprovado(' aprovado '), true);
  assert.equal(pagamentoAprovado('Não aprovado'), false);
  assert.equal(pagamentoAprovado('Pendente'), false);
  assert.equal(pagamentoAprovado('Recusado'), false);
  assert.equal(pagamentoAprovado(''), false);
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
await teste('CSV respeita aspas, separador e linhas vazias', () => {
  const linhas = parseDelimitado('Nome;Sobrenome\nAna;"Souza; Jr"\r\n\nBob;Lima\n');
  assert.deepEqual(linhas, [['Nome', 'Sobrenome'], ['Ana', 'Souza; Jr'], ['Bob', 'Lima']]);
  assert.equal(detectarSeparador('a,b,c'), ',');
  assert.equal(detectarSeparador('a;b;c'), ';');
  assert.deepEqual(parseDelimitado('a,b\n"li\nnha","as""pas"'), [['a', 'b'], ['li\nnha', 'as"pas']]);
});

await teste('CSV ignora BOM no cabeçalho', () => {
  const linhas = parseDelimitado('﻿Nº ingresso,Cupom de Desconto\nABC,ana@x.com\n');
  assert.equal(linhas[0][0], 'Nº ingresso');
});

await teste('gerarCSV escapa e usa ponto e vírgula', () => {
  assert.equal(gerarCSV(['a', 'b'], [['x', 'y;z']]), '﻿a;b\r\nx;"y;z"\r\n');
});

// ---------------------------------------------------------------- xlsx
const bufferXlsx = fs.readFileSync(path.join(raiz, 'tests/fixtures/sympla-participantes.xlsx'));
const linhasXlsx = await lerXlsx(
  bufferXlsx.buffer.slice(bufferXlsx.byteOffset, bufferXlsx.byteOffset + bufferXlsx.byteLength)
);

await teste('XLSX lê o cabeçalho da Sympla', () => {
  assert.equal(linhasXlsx[0][0], 'Nº ingresso');
  assert.equal(linhasXlsx[0][9], 'Cupom de Desconto');
  assert.equal(linhasXlsx.length, 10);
});

await teste('XLSX mantém colunas alinhadas quando há célula vazia', () => {
  // A linha da Fabiana (VIP) tem o cupom em branco: se o leitor colapsar a
  // célula vazia, o "Não" do check-in vira cupom.
  const fabiana = linhasXlsx.find((l) => l[2] === 'Fabiana');
  assert.equal(fabiana.length, 11);
  assert.equal(fabiana[9], '');
  assert.equal(fabiana[10], 'Não');
});

await teste('XLSX converte serial de data em data legível', () => {
  const pedro = linhasXlsx.find((l) => l[2] === 'Pedro');
  assert.equal(pedro[8], '02/09/2026 14:32');
});

// ---------------------------------------------------------------- colunas
await teste('mapearColunas casa os nomes da Sympla', () => {
  const { indices, faltando } = mapearColunas(linhasXlsx[0]);
  assert.deepEqual(faltando, []);
  assert.equal(indices.id_compra, 0);
  assert.equal(indices.cupom_email, 9);
  assert.equal(indices.estado_pagamento, 7);
  assert.equal(indices.valor, 6);
});

await teste('mapearColunas reclama das colunas obrigatórias que faltam', () => {
  const { faltando } = mapearColunas(['Nome', 'Email']);
  assert.deepEqual(faltando, ['Nº ingresso', 'Cupom de Desconto', 'Estado de pagamento']);
});

// ---------------------------------------------------------------- compras
const { compras, linhasLidas } = lerCompras(linhasXlsx);

await teste('lerCompras normaliza e-mail, valor e aprovação', () => {
  assert.equal(linhasLidas, 9);
  assert.equal(compras.length, 9);
  const pedro = compras.find((c) => c.id_compra === 'UGUZ-77-YTR8');
  assert.equal(pedro.comprador_email, 'pedro.lima@email.com');
  assert.equal(pedro.cupom_email, 'marina.castro@email.com');
  assert.equal(pedro.valor, 1214.1);
  assert.equal(pedro.aprovado, 1);
  assert.equal(pedro.comprador_nome, 'Pedro Lima');
  const julia = compras.find((c) => c.id_compra === 'UGUZ-78-YTR9');
  assert.equal(julia.cupom_email, 'marina.castro@email.com', 'cupom com espaço e caixa alta');
  const bruno = compras.find((c) => c.id_compra === 'UGUZ-80-AAA1');
  assert.equal(bruno.aprovado, 0, 'Pendente não é aprovado');
});

await teste('lerCompras deduplica o mesmo Nº ingresso no arquivo', () => {
  const cabecalho = ['Nº ingresso', 'Cupom de Desconto', 'Estado de pagamento', 'Valor'];
  const r = lerCompras([
    cabecalho,
    ['ING-1', 'ana@x.com', 'Aprovado', '100,00'],
    ['ING-1', 'ana@x.com', 'Aprovado', '150,00'],
    ['ING-2', 'ana@x.com', 'Aprovado', '100,00'],
  ]);
  assert.equal(r.compras.length, 2);
  assert.equal(r.duplicadasNoArquivo, 1);
  assert.equal(r.compras.find((c) => c.id_compra === 'ING-1').valor, 150, 'última linha vence');
});

await teste('lerCompras ignora linha sem Nº ingresso', () => {
  const r = lerCompras([
    ['Nº ingresso', 'Cupom de Desconto', 'Estado de pagamento'],
    ['', 'ana@x.com', 'Aprovado'],
    ['ING-9', 'ana@x.com', 'Aprovado'],
  ]);
  assert.equal(r.compras.length, 1);
  assert.equal(r.semIdentificador, 1);
});

// ---------------------------------------------------------------- regras
const indicadores = [
  { email: 'marina.castro@email.com', codigo_publico: 'UGUZ-77-YTR8', primeiro_nome: 'Marina', ativo: 1 },
  { email: 'rafael.antunes@email.com', codigo_publico: 'UGUN-T1-THSM', primeiro_nome: 'Rafael', ativo: 1 },
  { email: 'ana.souza@email.com', codigo_publico: 'UGUP-0R-FKUX', primeiro_nome: 'Ana', ativo: 1 },
  { email: 'diego.farias@email.com', codigo_publico: 'UGUZ-0F-YS3K', primeiro_nome: 'Diego', ativo: 0 },
];

await teste('só compra aprovada conta, e a do próprio indicador não conta', () => {
  const { porIndicador, diagnostico } = calcularContagens({ compras, indicadores });
  const marina = porIndicador.get('marina.castro@email.com');
  // 3 aprovadas de terceiros + 1 pendente (não conta) + 1 dela mesma (não conta)
  assert.equal(marina.total, 3);
  assert.equal(marina.qualificado, true);
  assert.equal(Math.round(marina.receita * 100) / 100, 3642.3);
  assert.equal(diagnostico.autoindicacoes, 1);
  assert.equal(diagnostico.naoAprovadas, 1);
});

await teste('cupom que não casa com indicador vira órfão', () => {
  const { cuponsOrfaos, diagnostico } = calcularContagens({ compras, indicadores });
  assert.equal(cuponsOrfaos.get('nao.existe@email.com'), 1);
  assert.equal(diagnostico.linhasComCupomOrfao, 1);
  assert.equal(diagnostico.cuponsOrfaosDistintos, 1);
});

await teste('indicador inativo não recebe compras nem entra na contagem', () => {
  const { porIndicador } = calcularContagens({
    compras: [
      { id_compra: 'X1', aprovado: 1, cupom_email: 'diego.farias@email.com', comprador_email: 'z@x.com', valor: 100 },
    ],
    indicadores,
  });
  assert.equal(porIndicador.has('diego.farias@email.com'), false);
});

await teste('compra sem cupom é apenas contabilizada no diagnóstico', () => {
  const { diagnostico } = calcularContagens({ compras, indicadores });
  assert.equal(diagnostico.semCupom, 1);
});

await teste('compra ausente da última planilha deixa de contar', () => {
  const base = [
    { id_compra: 'A', aprovado: 1, cupom_email: 'ana.souza@email.com', comprador_email: 'a@x.com', valor: 100 },
    { id_compra: 'B', aprovado: 1, cupom_email: 'ana.souza@email.com', comprador_email: 'b@x.com', valor: 100, ausente: 1 },
  ];
  const { porIndicador, diagnostico } = calcularContagens({ compras: base, indicadores });
  assert.equal(porIndicador.get('ana.souza@email.com').total, 1);
  assert.equal(diagnostico.ausentes, 1);
});

await teste('reimportar a mesma planilha não muda nada (idempotência)', () => {
  const primeira = calcularContagens({ compras, indicadores });
  const segunda = calcularContagens({ compras: compras.slice().reverse(), indicadores });
  for (const email of primeira.porIndicador.keys()) {
    assert.equal(
      primeira.porIndicador.get(email).total,
      segunda.porIndicador.get(email).total,
      email
    );
  }
});

await teste('meta é 3 compras confirmadas', () => {
  assert.equal(META_COMPRAS, 3);
  const { porIndicador } = calcularContagens({ compras, indicadores });
  assert.equal(porIndicador.get('ana.souza@email.com').total, 1);
  assert.equal(porIndicador.get('ana.souza@email.com').qualificado, false);
});

await teste('qualificou_em é gravado uma vez e nunca reescrito', () => {
  const primeiro = resolverQualificacao(null, 3, '2026-09-10T10:00:00Z');
  assert.equal(primeiro.qualificouAgora, true);
  assert.equal(primeiro.qualificou_em, '2026-09-10T10:00:00Z');

  const depois = resolverQualificacao('2026-09-10T10:00:00Z', 7, '2026-09-20T10:00:00Z');
  assert.equal(depois.qualificou_em, '2026-09-10T10:00:00Z');
  assert.equal(depois.qualificouAgora, false);

  const abaixo = resolverQualificacao(null, 2, '2026-09-10T10:00:00Z');
  assert.equal(abaixo.qualificou_em, null);

  const cancelou = resolverQualificacao('2026-09-10T10:00:00Z', 1, '2026-09-25T10:00:00Z');
  assert.equal(cancelou.qualificou_em, '2026-09-10T10:00:00Z', 'histórico preservado');
});

await teste('fila do VIP segue a ordem de chegada à meta e respeita o teto de 50', () => {
  const premios = [
    { email: 'c@x.com', qualificou_em: '2026-09-03T00:00:00Z', compras_confirmadas: 3 },
    { email: 'a@x.com', qualificou_em: '2026-09-01T00:00:00Z', compras_confirmadas: 5 },
    { email: 'b@x.com', qualificou_em: '2026-09-02T00:00:00Z', compras_confirmadas: 4 },
    { email: 'z@x.com', qualificou_em: null, compras_confirmadas: 1 },
  ];
  const fila = montarFilaVip(premios);
  assert.equal(fila.get('a@x.com'), 1);
  assert.equal(fila.get('b@x.com'), 2);
  assert.equal(fila.get('c@x.com'), 3);
  assert.equal(fila.has('z@x.com'), false);
  assert.equal(dentroDoTeto(50), true);
  assert.equal(dentroDoTeto(51), false);
  assert.equal(dentroDoTeto(undefined), false);
  assert.equal(TETO_VIP, 50);
});

await teste('ranking ordena por compras e empata na mesma posição', () => {
  const ranking = montarRanking([
    { email: 'a@x.com', compras_confirmadas: 9 },
    { email: 'b@x.com', compras_confirmadas: 7 },
    { email: 'c@x.com', compras_confirmadas: 7 },
    { email: 'd@x.com', compras_confirmadas: 2 },
  ]);
  assert.deepEqual(ranking.map((r) => r.email), ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  assert.deepEqual(ranking.map((r) => r.posicao), [1, 2, 2, 4]);
});

// ---------------------------------------------------------------- indicadores
await teste('derivarIndicadores exclui VIP e fixa um código por e-mail', () => {
  const linhas = [
    ['Nº ingresso', 'Nome', 'Sobrenome', 'Email', 'Tipo de ingresso', 'Estado de pagamento', 'Cupom de Desconto'],
    ['ING-1', 'Ana', 'Souza', 'ana@x.com', 'Passaporte', 'Aprovado', ''],
    ['ING-2', 'Ana', 'Souza', 'ana@x.com', 'Passaporte', 'Aprovado', ''],
    ['ING-3', 'Vera', 'Vip', 'vera@x.com', 'Ingresso VIP', 'Aprovado', ''],
    ['ING-4', 'Bo', 'Lima', 'bo@x.com', 'Passaporte', 'Pendente', ''],
  ];
  const { indicadores: derivados, excluidosVip } = derivarIndicadores(linhas);
  assert.equal(derivados.length, 1);
  assert.equal(derivados[0].email, 'ana@x.com');
  assert.equal(derivados[0].codigo_publico, 'ING-1', 'primeiro Nº ingresso do e-mail');
  assert.equal(derivados[0].primeiro_nome, 'Ana');
  assert.equal(excluidosVip, 1);
});

await teste('lerIndicadores aceita lista de cupons pronta', () => {
  const { indicadores: lidos } = lerIndicadores([
    ['E-mail', 'Código público', 'Primeiro nome', 'Ativo'],
    [' Marina.Castro@email.com ', 'UGUZ-77-YTR8', 'Marina Castro', '1'],
    ['rafael@x.com', 'UGUN-T1-THSM', 'Rafael', 'não'],
  ]);
  assert.equal(lidos.length, 2);
  assert.equal(lidos[0].email, 'marina.castro@email.com');
  assert.equal(lidos[0].primeiro_nome, 'Marina');
  assert.equal(lidos[1].ativo, 0);
});

await teste('lerIndicadores reconhece um export da Sympla e deriva a lista', () => {
  const { indicadores: lidos } = lerIndicadores(linhasXlsx);
  assert.ok(lidos.length > 0);
  assert.ok(lidos.every((i) => i.email && i.codigo_publico));
  assert.equal(lidos.some((i) => i.email === 'fabiana.rocha@email.com'), false, 'VIP fora');
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
