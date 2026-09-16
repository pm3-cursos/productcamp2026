// Leitura da planilha no Google Sheets com uma conta de serviço.
// Node puro (crypto nativo), sem SDK: assina um JWT RS256, troca por um
// access token e chama `spreadsheets.values.get`.
//
// A planilha precisa estar compartilhada com o `client_email` da conta de
// serviço (como Leitor). Nada aqui é público: quem não tem a chave privada
// não abre nada, mesmo sabendo o ID da planilha.

import { createSign } from 'node:crypto';

const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const base64url = (entrada) =>
  Buffer.from(entrada).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Access token de curta duração (1 h) para a conta de serviço. */
export async function obterToken(contaServico) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(
    JSON.stringify({
      iss: contaServico.client_email,
      scope: ESCOPO,
      aud: contaServico.token_uri || 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    })
  );
  const assinador = createSign('RSA-SHA256');
  assinador.update(`${cabecalho}.${corpo}`);
  const assinatura = base64url(assinador.sign(contaServico.private_key));
  const jwt = `${cabecalho}.${corpo}.${assinatura}`;

  const resposta = await fetch(contaServico.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Google não emitiu o token (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  const dados = await resposta.json();
  return dados.access_token;
}

/** Título da primeira aba, para quando SHEET_TAB não for informado. */
export async function primeiraAba({ contaServico, sheetId }) {
  const token = await obterToken(contaServico);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`;
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) {
    throw new Error(`Sheets API respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
  }
  const dados = await resposta.json();
  const titulo = dados.sheets && dados.sheets[0] && dados.sheets[0].properties.title;
  if (!titulo) throw new Error('A planilha não tem abas.');
  return titulo;
}

/**
 * Lê a aba inteira como matriz de strings (valores formatados, como a
 * planilha mostra — datas "05/09/2026 14:32", valores "R$ 1.214,10").
 * A primeira linha é o cabeçalho.
 *
 * @returns {Promise<string[][]>}
 */
export async function lerAba({ contaServico, sheetId, aba }) {
  const token = await obterToken(contaServico);
  const intervalo = encodeURIComponent(`'${String(aba).replace(/'/g, "''")}'`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${intervalo}` +
    '?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&majorDimension=ROWS';

  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) {
    throw new Error(`Sheets API respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
  }
  const dados = await resposta.json();
  const linhas = dados.values || [];
  // A API omite células vazias no fim da linha; alinha ao cabeçalho.
  const largura = linhas.length ? linhas[0].length : 0;
  return linhas.map((linha) => {
    const completa = linha.slice(0, largura);
    while (completa.length < largura) completa.push('');
    return completa.map((v) => (v == null ? '' : String(v)));
  });
}
