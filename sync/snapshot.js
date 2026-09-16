// Monta o snapshot: planilha -> compras/indicadores/contagens -> SQL.
// Puro (sem rede, sem disco), para ser testado em `node tests/run.mjs`.
//
// Estratégia de escrita: upsert de tudo com o `sync_id` da rodada e, no fim,
// apagar o que ficou com sync_id antigo. Assim nenhum leitor vê a tabela
// vazia no meio do caminho, e uma rodada que falhe pela metade deixa o
// snapshot anterior inteiro (a próxima corrige).
//
// `premios.vip_liberado`, `liberado_por` e `liberado_em` nunca aparecem aqui.

import { lerPlanilha } from '../functions/_lib/planilha.js';
import { calcularContagens } from '../functions/_lib/reconciliacao.js';
import { META_COMPRAS } from '../functions/_lib/config.js';

const LOTE = 40;

/** Literal SQL seguro (D1 não aceita parâmetros via arquivo). */
export function sql(valor) {
  if (valor == null) return 'NULL';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '0';
  if (typeof valor === 'boolean') return valor ? '1' : '0';
  return `'${String(valor).replace(/'/g, "''")}'`;
}

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

function emLotes(itens, montarValores, cabecalho) {
  const statements = [];
  for (let i = 0; i < itens.length; i += LOTE) {
    const valores = itens.slice(i, i + LOTE).map(montarValores).join(',\n');
    statements.push(`${cabecalho}\n${valores};`);
  }
  return statements;
}

/**
 * Gera as instruções SQL do snapshot, na ordem certa.
 * @param {object} snapshot saída de `montarSnapshot`
 * @param {number} syncId inteiro único da rodada (timestamp em ms)
 * @param {string} origem 'cron' | e-mail de quem disparou | 'local'
 * @returns {string[]}
 */
export function gerarSQL(snapshot, syncId, origem) {
  const { compras, indicadores, contagens, resumo } = snapshot;
  const agora = sql(resumo.agora);
  const statements = [];

  statements.push(
    ...emLotes(
      indicadores,
      (i) =>
        `(${sql(i.email)}, ${sql(i.primeiro_nome)}, ${sql(i.nome_completo)}, 1, ${syncId}, ${agora}, ${agora})`,
      `INSERT INTO indicadores (email, primeiro_nome, nome_completo, ativo, sync_id, criado_em, atualizado_em)
VALUES`
    ).map(
      (s) =>
        s.replace(
          /;$/,
          `\nON CONFLICT(email) DO UPDATE SET primeiro_nome = excluded.primeiro_nome, nome_completo = excluded.nome_completo, ativo = 1, sync_id = excluded.sync_id, atualizado_em = excluded.atualizado_em;`
        )
    )
  );
  statements.push(`DELETE FROM indicadores WHERE sync_id <> ${syncId};`);

  statements.push(
    ...emLotes(
      compras,
      (c) =>
        `(${sql(c.id_compra)}, ${sql(c.linha)}, ${sql(c.comprador_nome)}, ${sql(c.comprador_email)}, ${sql(c.cupom)}, ${sql(c.cupom_email)}, ${sql(c.lote)}, ${sql(c.categoria)}, ${sql(c.formato)}, ${sql(c.modalidade)}, ${sql(c.quantidade)}, ${sql(c.valor_unitario)}, ${sql(c.valor)}, ${sql(c.data_compra)}, ${sql(c.conta)}, ${sql(c.motivo)}, ${syncId}, ${agora})`,
      `INSERT OR REPLACE INTO compras (id_compra, linha, comprador_nome, comprador_email, cupom, cupom_email, lote, categoria, formato, modalidade, quantidade, valor_unitario, valor, data_compra, conta, motivo, sync_id, atualizado_em)
VALUES`
    )
  );
  statements.push(`DELETE FROM compras WHERE sync_id <> ${syncId};`);

  statements.push(
    ...emLotes(
      contagens,
      (p) => `(${sql(p.email)}, ${sql(p.compras_confirmadas)}, ${sql(p.receita)}, ${sql(p.qualificou_em)})`,
      `INSERT INTO premios (email, compras_confirmadas, receita, qualificou_em)
VALUES`
    ).map(
      (s) =>
        s.replace(
          /;$/,
          `\nON CONFLICT(email) DO UPDATE SET compras_confirmadas = excluded.compras_confirmadas, receita = excluded.receita, qualificou_em = excluded.qualificou_em;`
        )
    )
  );
  // Quem saiu da lista de indicadores some das contagens — a não ser que
  // tenha VIP liberado: esse registro é histórico do time e fica.
  statements.push(
    `DELETE FROM premios WHERE vip_liberado = 0 AND email NOT IN (SELECT email FROM indicadores);`
  );
  statements.push(
    `UPDATE premios SET compras_confirmadas = 0, receita = 0, qualificou_em = NULL WHERE email NOT IN (SELECT email FROM indicadores);`
  );

  statements.push(
    `INSERT INTO sincronizacoes (tipo, sync_id, origem, criado_em, linhas_lidas, compras, indicadores, qualificados, cupons_orfaos, autoindicacoes, canceladas, resumo)
VALUES ('planilha', ${syncId}, ${sql(origem)}, ${agora}, ${resumo.linhas_lidas}, ${resumo.compras}, ${resumo.indicadores}, ${resumo.qualificados}, ${resumo.cupons_orfaos}, ${resumo.autoindicacoes}, ${resumo.canceladas}, ${sql(JSON.stringify(resumo))});`
  );

  return statements;
}
