// Portão do painel interno. Só passa quem tem sessão válida com papel admin,
// e o e-mail é reconferido contra a allowlist do código a cada requisição.

import { erro } from '../../_lib/resposta.js';
import { ehAdmin, lerSessao } from '../../_lib/session.js';

export async function onRequest(context) {
  const sessao = await lerSessao(context.request, context.env);
  if (!sessao || sessao.papel !== 'admin' || !ehAdmin(sessao.email)) {
    return erro('nao_autorizado', 'Área restrita ao time PM3.', 403);
  }
  context.data.admin = sessao.email;
  return context.next();
}
