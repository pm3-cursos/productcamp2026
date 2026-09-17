// POST /api/sync/callback — o Worker de vendas chama aqui ao fim de cada
// upsert em `pedidos` (CALLBACK_URL/CALLBACK_TOKEN lá; SYNC_CALLBACK_TOKEN
// aqui). A plataforma rederiva as tabelas dela na hora, sem esperar o botão.

import { erro, json } from '../../_lib/resposta.js';
import { banco } from '../../_lib/dados.js';
import { vendasConfigurado } from '../../_lib/vendas.js';
import { sincronizarIndicacao } from '../../_lib/sincronizacao.js';

export async function onRequestPost({ request, env }) {
  const token = env.SYNC_CALLBACK_TOKEN;
  const auth = request.headers.get('Authorization') || '';
  if (!token || auth !== `Bearer ${token}`) {
    return erro('nao_autorizado', 'Token do callback inválido.', 401);
  }
  if (!vendasConfigurado(env)) {
    return erro('nao_configurado', 'VENDAS_API_URL / VENDAS_API_TOKEN ausentes.', 503);
  }
  try {
    const resumo = await sincronizarIndicacao(env, banco(env), 'worker');
    return json({ ok: true, resumo });
  } catch (e) {
    return erro('sincronizacao_falhou', String((e && e.message) || e), 502);
  }
}

/** Só POST: qualquer outro método não deve cair no fallback estático do site. */
export function onRequestGet() {
  return erro("metodo_invalido", "Use POST.", 405);
}
