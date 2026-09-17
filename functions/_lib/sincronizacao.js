// Uma rodada completa: pedidos do Worker de vendas -> regras -> snapshot no
// D1 da indicação. Usada pelo botão do painel e pelo callback do Worker.

import { buscarPedidos, pedidosParaMatriz } from './vendas.js';
import { gravarSnapshot, montarSnapshot } from './snapshot.js';
import { EVENTO_PLANILHA } from './config.js';

/**
 * @param {object} env
 * @param {D1Database} db
 * @param {string} origem quem pediu (e-mail do admin | 'worker')
 * @returns {Promise<object>} resumo da rodada
 */
export async function sincronizarIndicacao(env, db, origem) {
  const fonte = await buscarPedidos(env, { evento: EVENTO_PLANILHA });
  const snapshot = montarSnapshot(pedidosParaMatriz(fonte.pedidos));
  if (snapshot.faltando.length) {
    throw new Error(`Pedidos sem as colunas ${snapshot.faltando.join(', ')}.`);
  }
  const extra = { fonte_sync_id: fonte.sync_id, fonte_sincronizado_em: fonte.sincronizado_em, pedidos_recebidos: fonte.pedidos.length };
  const { sync_id } = await gravarSnapshot(db, snapshot, { origem, extra });
  return { sync_id, origem, ...snapshot.resumo, ...extra };
}
