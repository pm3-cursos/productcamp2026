// Sessão assinada em cookie HttpOnly. Sem estado no banco: o cookie carrega
// e-mail, papel e expiração, e a assinatura HMAC garante que não foi mexido.

import { assinar, verificar, bytesParaBase64Url, base64UrlParaBytes } from './crypto.js';
import { ADMINS, COOKIE_SESSAO, SESSAO_TTL_H } from './config.js';
import { normalizarEmail } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** O e-mail é admin? Comparação sempre normalizada. */
export function ehAdmin(email) {
  return ADMINS.includes(normalizarEmail(email));
}

function segredo(env) {
  const valor = env && env.SESSION_SECRET;
  if (!valor || String(valor).length < 24) {
    throw new Error(
      'SESSION_SECRET ausente ou curto demais. Configure um segredo de 32+ caracteres nas variáveis do Pages.'
    );
  }
  return String(valor);
}

/** Monta o valor assinado do cookie de sessão. */
export async function criarSessao(env, { email, papel }) {
  const dados = {
    e: normalizarEmail(email),
    p: papel,
    x: Math.floor(Date.now() / 1000) + SESSAO_TTL_H * 3600,
  };
  const payload = bytesParaBase64Url(enc.encode(JSON.stringify(dados)));
  return assinar(payload, segredo(env));
}

/** Lê e valida a sessão do request. Devolve `{email, papel}` ou null. */
export async function lerSessao(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const encontrado = cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(COOKIE_SESSAO + '='));
  if (!encontrado) return null;

  const valor = decodeURIComponent(encontrado.slice(COOKIE_SESSAO.length + 1));
  let payload;
  try {
    payload = await verificar(valor, segredo(env));
  } catch {
    return null;
  }
  if (!payload) return null;

  let dados;
  try {
    dados = JSON.parse(dec.decode(base64UrlParaBytes(payload)));
  } catch {
    return null;
  }
  if (!dados || !dados.e || !dados.p) return null;
  if (!dados.x || dados.x * 1000 < Date.now()) return null;

  // Papel de admin é sempre reconferido contra a allowlist do código, para que
  // remover alguém da lista invalide sessões já emitidas na hora.
  if (dados.p === 'admin' && !ehAdmin(dados.e)) return null;

  return { email: dados.e, papel: dados.p };
}

/** Cabeçalho Set-Cookie da sessão. */
export function cookieSessao(valor) {
  const maxAge = SESSAO_TTL_H * 3600;
  return `${COOKIE_SESSAO}=${encodeURIComponent(valor)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** Cabeçalho Set-Cookie que apaga a sessão. */
export function cookieLimpar() {
  return `${COOKIE_SESSAO}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
