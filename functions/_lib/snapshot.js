// Snapshot da indicação: pedidos (matriz "planilha") -> compras, indicadores
// e contagens -> gravação no D1 `pcamp-indicacao`.
//
// `montarSnapshot` é puro (testado em tests/run.mjs). `gravarSnapshot` escreve
// pelo binding: upsert de tudo com o `sync_id` da rodada e, no fim, remoção
// do que ficou com sync_id antigo — nenhum leitor vê a tabela vazia, e uma
// rodada que falhe pela metade deixa o snapshot anterior inteiro.
//
// `premios.vip_liberado`, `liberado_por` e `liberado_em` nunca aparecem aqui.

import { lerPlanilha } from './planilha.js';
import { calcularContagens } from './reconciliacao.js';
import { META_COMPRAS } from './config.js';
import { agoraISO } from './util.js';

const LOTE = 50;

/**
 * Aplica as regras e decide, compra a compra, se ela conta e por quê.
 * @param {string[][]} linhas
 * @returns {{compras, indicadores, contagens, resumo, faltando}}
 */
export function montarSnapshot(linhas, { agora = new Date().toISOString() } = {}) {
  const lido = lerPlanilha(linhas);
  if (lido.faltando.length) {
    return { faltando: lido.faltando, compras: [], indicadores: [], contagens: [], resumo: null };
  }

  const { porIndicador, cuponsOrfaos, diagnostico } = calcularContagens({
    compras: lido.compras,
    indicadores: lido.indicadores,
  });

  const emailsAtivos = new Set(lido.indicadores.map((i) => i.email));
  const compras = lido.compras.map((c) => {
    let conta = 0;
    let motivo = null;
    if (!c.cupom_email) motivo = c.cupom ? 'cupom não é um e-mail' : 'sem cupom';
    else if (!emailsAtivos.has(c.cupom_email)) motivo = 'cupom sem indicador';
    else if (c.comprador_email === c.cupom_email) motivo = 'compra do próprio indicador';
    else conta = 1;
    return { ...c, conta, motivo };
  });

  const contagens = [...porIndicador.values()].map((r) => ({
    email: r.email,
    compras_confirmadas: r.total,
    receita: r.receita,
    qualificou_em: r.qualificou_em,
  }));

  const resumo = {
    agora,
    linhas_lidas: lido.linhasLidas,
    outros_eventos: lido.outrosEventos,
    canceladas: lido.canceladas,
    sem_email: lido.semEmail,
    compras: compras.length,
    compras_que_contam: compras.filter((c) => c.conta).length,
    ingressos_indicados: contagens.reduce((t, c) => t + c.compras_confirmadas, 0),
    indicadores: lido.indicadores.length,
    excluidos_vip: lido.excluidosVip,
    excluidos_b2b: lido.excluidosB2B,
    qualificados: contagens.filter((c) => c.compras_confirmadas >= META_COMPRAS).length,
    cupons_orfaos: diagnostico.cuponsOrfaosDistintos,
    linhas_com_cupom_orfao: diagnostico.linhasComCupomOrfao,
    autoindicacoes: diagnostico.autoindicacoes,
    sem_cupom: diagnostico.semCupom,
    cupons_orfaos_lista: [...cuponsOrfaos.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([cupom, n]) => ({ cupom, linhas: n })),
  };

  return { faltando: [], compras, indicadores: lido.indicadores, contagens, resumo };
}

async function emLotes(db, statements) {
  for (let i = 0; i < statements.length; i += LOTE) {
    await db.batch(statements.slice(i, i + LOTE));
  }
}

/**
 * Grava o snapshot no D1 e registra a rodada em `sincronizacoes`.
 * @param {D1Database} db
 * @param {object} snapshot saída de `montarSnapshot`
 * @param {{origem: string, syncId?: number, extra?: object}} opcoes
 * @returns {Promise<{sync_id: number}>}
 */
export async function gravarSnapshot(db, snapshot, { origem, syncId = Date.now(), extra = {} }) {
  const { compras, indicadores, contagens, resumo } = snapshot;
  const agora = agoraISO();

  await emLotes(
    db,
    indicadores.map((i) =>
      db
        .prepare(
          `INSERT INTO indicadores (email, primeiro_nome, nome_completo, ativo, sync_id, criado_em, atualizado_em)
           VALUES (?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET primeiro_nome = excluded.primeiro_nome,
             nome_completo = excluded.nome_completo, ativo = 1, sync_id = excluded.sync_id,
             atualizado_em = excluded.atualizado_em`
        )
        .bind(i.email, i.primeiro_nome, i.nome_completo || '', syncId, agora, agora)
    )
  );
  await db.prepare('DELETE FROM indicadores WHERE sync_id <> ?').bind(syncId).run();

  await emLotes(
    db,
    compras.map((c) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO compras (id_compra, linha, comprador_nome, comprador_email, cupom, cupom_email,
             lote, categoria, formato, modalidade, quantidade, valor_unitario, valor, data_compra, conta, motivo,
             sync_id, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          c.id_compra, c.linha, c.comprador_nome, c.comprador_email, c.cupom || '', c.cupom_email || '',
          c.lote || '', c.categoria || '', c.formato || '', c.modalidade || '', c.quantidade,
          c.valor_unitario || 0, c.valor || 0, c.data_compra, c.conta, c.motivo, syncId, agora
        )
    )
  );
  await db.prepare('DELETE FROM compras WHERE sync_id <> ?').bind(syncId).run();

  await emLotes(
    db,
    contagens.map((p) =>
      db
        .prepare(
          `INSERT INTO premios (email, compras_confirmadas, receita, qualificou_em)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET compras_confirmadas = excluded.compras_confirmadas,
             receita = excluded.receita, qualificou_em = excluded.qualificou_em`
        )
        .bind(p.email, p.compras_confirmadas, p.receita, p.qualificou_em)
    )
  );
  // Quem saiu da lista some das contagens — a não ser que tenha VIP liberado:
  // esse registro é histórico do time e fica (zerado).
  await db.batch([
    db.prepare('DELETE FROM premios WHERE vip_liberado = 0 AND email NOT IN (SELECT email FROM indicadores)'),
    db.prepare('UPDATE premios SET compras_confirmadas = 0, receita = 0, qualificou_em = NULL WHERE email NOT IN (SELECT email FROM indicadores)'),
    db
      .prepare(
        `INSERT INTO sincronizacoes (tipo, sync_id, origem, criado_em, linhas_lidas, compras, indicadores,
           qualificados, cupons_orfaos, autoindicacoes, canceladas, resumo)
         VALUES ('planilha', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        syncId, origem, agora, resumo.linhas_lidas, resumo.compras, resumo.indicadores, resumo.qualificados,
        resumo.cupons_orfaos, resumo.autoindicacoes, resumo.canceladas, JSON.stringify({ ...resumo, ...extra })
      ),
  ]);

  return { sync_id: syncId };
}
