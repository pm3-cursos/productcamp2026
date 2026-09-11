// Primitivas de criptografia sobre a WebCrypto (disponível no Workers e no Node 18+).

const enc = new TextEncoder();

function bytesParaBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlParaBytes(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const preenchido = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(preenchido);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export { bytesParaBase64Url, base64UrlParaBytes };

/** Token aleatório de 32 bytes em base64url (256 bits de entropia). */
export function tokenAleatorio() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesParaBase64Url(bytes);
}

/** SHA-256 em hexadecimal. Usado para guardar só o hash do link mágico. */
export async function sha256Hex(texto) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(texto));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function chaveHmac(segredo) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Assina `payload` e devolve `payload.assinatura` (ambos base64url). */
export async function assinar(payload, segredo) {
  const chave = await chaveHmac(segredo);
  const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(payload));
  return `${payload}.${bytesParaBase64Url(new Uint8Array(assinatura))}`;
}

/**
 * Verifica um valor `payload.assinatura`. Devolve o payload ou null.
 * A comparação é feita pela própria WebCrypto (tempo constante).
 */
export async function verificar(assinado, segredo) {
  if (typeof assinado !== 'string') return null;
  const corte = assinado.lastIndexOf('.');
  if (corte <= 0) return null;
  const payload = assinado.slice(0, corte);
  const assinatura = assinado.slice(corte + 1);
  let bytes;
  try {
    bytes = base64UrlParaBytes(assinatura);
  } catch {
    return null;
  }
  const chave = await chaveHmac(segredo);
  const ok = await crypto.subtle.verify('HMAC', chave, bytes, enc.encode(payload));
  return ok ? payload : null;
}
