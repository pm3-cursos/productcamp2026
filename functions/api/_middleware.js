// Middleware das rotas /api: cabeçalhos de segurança, resposta sem cache e
// captura de exceção para não devolver stack trace ao cliente.

import { falha } from '../_lib/resposta.js';

export async function onRequest(context) {
  try {
    const resposta = await context.next();
    const headers = new Headers(resposta.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(resposta.body, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers,
    });
  } catch (e) {
    return falha(e, `api ${new URL(context.request.url).pathname}`);
  }
}
