// POST /api/admin/sincronizar — dispara o workflow do GitHub que lê a
// planilha e regrava o snapshot no D1. É assíncrono: a resposta confirma o
// disparo, e o painel acompanha pela data da última sincronização.
//
// O token (GITHUB_SYNC_TOKEN) é um fine-grained PAT com permissão apenas de
// Actions: read/write neste repositório. Se vazar, o pior que alguém faz é
// disparar sincronizações — ele não lê a planilha nem escreve no banco.

import { erro, json } from '../../_lib/resposta.js';
import { mesmaOrigem } from '../../_lib/requisicao.js';
import { banco, registrarDisparo, ultimoDisparo } from '../../_lib/dados.js';
import {
  GITHUB_REF,
  GITHUB_REPO,
  GITHUB_WORKFLOW,
  INTERVALO_SYNC_MIN,
} from '../../_lib/config.js';

export async function onRequestPost({ request, env, data }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }
  if (!env.GITHUB_SYNC_TOKEN) {
    return erro(
      'nao_configurado',
      'GITHUB_SYNC_TOKEN não está configurado no Pages. A sincronização automática continua rodando a cada 6 h.',
      503
    );
  }

  const db = banco(env);
  const anterior = await ultimoDisparo(db);
  if (anterior) {
    const decorrido = Date.now() - Date.parse(anterior.criado_em);
    const minimo = INTERVALO_SYNC_MIN * 60 * 1000;
    if (decorrido < minimo) {
      const faltam = Math.ceil((minimo - decorrido) / 60000);
      return erro(
        'aguarde',
        `Uma sincronização foi pedida há pouco por ${anterior.origem}. Tente de novo em ${faltam} min.`,
        429
      );
    }
  }

  const repo = env.GITHUB_REPO || GITHUB_REPO;
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_SYNC_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pcamp-indicacao',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: env.GITHUB_REF || GITHUB_REF, inputs: { origem: data.admin } }),
  });

  if (resposta.status !== 204) {
    const texto = await resposta.text().catch(() => '');
    return erro(
      'github_falhou',
      `O GitHub não aceitou o disparo (HTTP ${resposta.status}). ${texto.slice(0, 200)}`,
      502
    );
  }

  await registrarDisparo(db, data.admin);
  return json({ ok: true, origem: data.admin, intervalo_min: INTERVALO_SYNC_MIN });
}
