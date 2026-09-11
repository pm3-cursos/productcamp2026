// Portão da página do painel interno. Sem sessão de admin válida a URL não
// entrega a tela — nem para quem conhece o endereço.

import { ehAdmin, lerSessao } from '../../_lib/session.js';
import { ROTA_INDICADOR, ROTA_LOGIN } from '../../_lib/config.js';

export async function onRequest(context) {
  const sessao = await lerSessao(context.request, context.env);

  if (!sessao) {
    return Response.redirect(new URL(`${ROTA_LOGIN}?motivo=restrito`, context.request.url), 302);
  }
  if (sessao.papel !== 'admin' || !ehAdmin(sessao.email)) {
    return Response.redirect(new URL(ROTA_INDICADOR, context.request.url), 302);
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
