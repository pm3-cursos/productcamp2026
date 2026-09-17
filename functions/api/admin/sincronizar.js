// POST /api/admin/sincronizar — lê os pedidos no Worker de vendas e regrava
// o snapshot da indicação. Síncrono: leva poucos segundos e devolve o resumo.

import { erro, json } from '../../_lib/resposta.js';
import { mesmaOrigem } from '../../_lib/requisicao.js';
import { banco } from '../../_lib/dados.js';
import { vendasConfigurado } from '../../_lib/vendas.js';
import { sincronizarIndicacao } from '../../_lib/sincronizacao.js';

export async function onRequestPost({ request, env, data }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }
  if (!vendasConfigurado(env)) {
    return erro(
      'nao_configurado',
      'VENDAS_API_URL / VENDAS_API_TOKEN não estão configurados no Pages. Ver indicacao/LEIA-ME.md.',
      503
    );
  }

  try {
    const resumo = await sincronizarIndicacao(env, banco(env), data.admin);
    return json({ ok: true, resumo });
  } catch (e) {
    return erro('sincronizacao_falhou', String((e && e.message) || e), 502);
  }
}
