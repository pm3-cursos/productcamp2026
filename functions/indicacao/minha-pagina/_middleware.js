// Portão da página do indicador: exige sessão válida.

import { lerSessao } from '../../_lib/session.js';
import { ROTA_ADMIN, ROTA_LOGIN } from '../../_lib/config.js';

export async function onRequest(context) {
  const sessao = await lerSessao(context.request, context.env);

  if (!sessao) {
    return Response.redirect(new URL(`${ROTA_LOGIN}?motivo=sessao`, context.request.url), 302);
  }
  if (sessao.papel === 'admin') {
    return Response.redirect(new URL(ROTA_ADMIN, context.request.url), 302);
  }

  const resposta = await context.next();
  const headers = new Headers(resposta.headers);
  headers.set('Cache-Control', 'no-store, private');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers,
  });
}
