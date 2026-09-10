// POST /api/auth/sair — encerra a sessão.

import { erro, json } from '../../_lib/resposta.js';
import { cookieLimpar } from '../../_lib/session.js';
import { mesmaOrigem } from '../../_lib/requisicao.js';

export async function onRequestPost({ request }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieLimpar() });
}
