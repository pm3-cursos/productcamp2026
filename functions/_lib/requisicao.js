// Helpers de leitura de requisição.

/** IP do visitante, como o Cloudflare entrega. */
export function ipCliente(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  );
}

/** User-Agent do visitante, para os registros de auditoria. */
export function userAgent(request) {
  return request.headers.get('User-Agent') || '';
}

/**
 * Confere se a requisição veio da própria origem. Proteção simples de CSRF
 * para os endpoints que mudam estado — o cookie é SameSite=Lax, isto é a
 * segunda tranca.
 */
export function mesmaOrigem(request) {
  const origem = request.headers.get('Origin');
  if (!origem) {
    // Sem Origin (alguns clientes) exigimos ao menos um Sec-Fetch-Site local.
    const site = request.headers.get('Sec-Fetch-Site');
    return site === null || site === 'same-origin' || site === 'none';
  }
  try {
    return new URL(origem).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Lê o corpo JSON com limite de tamanho e sem estourar em corpo inválido. */
export async function corpoJson(request, limiteBytes = 16 * 1024) {
  const texto = await request.text();
  if (texto.length > limiteBytes) throw new Error('Corpo muito grande.');
  if (!texto) return {};
  try {
    const dados = JSON.parse(texto);
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}
