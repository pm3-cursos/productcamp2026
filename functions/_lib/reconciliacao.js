// Regras de negócio da conciliação. Tudo puro: recebe compras + indicadores
// e devolve as contagens. É a única implementação das regras — o Worker
// carrega os dados do D1, chama estas funções e grava o resultado.

import { META_COMPRAS, TETO_VIP } from './config.js';

/**
 * Uma compra conta para o indicador quando:
 *   1. o pagamento está aprovado;
 *   2. ela veio na última planilha (não foi cancelada/removida);
 *   3. o cupom casa com um indicador ativo;
 *   4. o comprador não é o próprio indicador.
 *
 * @param {object[]} compras
 * @param {object[]} indicadores
 */
export function calcularContagens({ compras, indicadores }) {
  const ativos = new Map();
  for (const indicador of indicadores || []) {
    if (indicador && indicador.email && Number(indicador.ativo) !== 0) {
      ativos.set(indicador.email, indicador);
    }
  }

  const porIndicador = new Map();
  for (const email of ativos.keys()) {
    porIndicador.set(email, { email, compras: [], total: 0, receita: 0 });
  }

  const cuponsOrfaos = new Map();
  let autoindicacoes = 0;
  let semCupom = 0;
  let naoAprovadas = 0;
  let ausentes = 0;

  for (const compra of compras || []) {
    if (Number(compra.ausente) === 1) {
      ausentes++;
      continue;
    }
    if (Number(compra.aprovado) !== 1) {
      naoAprovadas++;
      continue;
    }
    if (!compra.cupom_email) {
      semCupom++;
      continue;
    }
    if (!ativos.has(compra.cupom_email)) {
      cuponsOrfaos.set(compra.cupom_email, (cuponsOrfaos.get(compra.cupom_email) || 0) + 1);
      continue;
    }
    if (compra.comprador_email && compra.comprador_email === compra.cupom_email) {
      autoindicacoes++;
      continue;
    }

    const alvo = porIndicador.get(compra.cupom_email);
    alvo.compras.push(compra);
    alvo.total++;
    alvo.receita += Number(compra.valor) || 0;
  }

  for (const registro of porIndicador.values()) {
    registro.compras.sort((a, b) =>
      String(a.data_compra || '').localeCompare(String(b.data_compra || ''))
    );
    registro.qualificado = registro.total >= META_COMPRAS;
  }

  return {
    porIndicador,
    cuponsOrfaos,
    diagnostico: {
      autoindicacoes,
      semCupom,
      naoAprovadas,
      ausentes,
      cuponsOrfaosDistintos: cuponsOrfaos.size,
      linhasComCupomOrfao: [...cuponsOrfaos.values()].reduce((a, b) => a + b, 0),
    },
  };
}

/**
 * Decide o `qualificou_em` de um indicador.
 * Grava o momento apenas na primeira vez que ele bate a meta. Um cancelamento
 * que derrube a contagem não apaga o histórico (o teto de 50 é por ordem de
 * chegada), e `vip_liberado` nunca é tocado aqui.
 *
 * @param {string|null} qualificouEmAtual
 * @param {number} total
 * @param {string} agora ISO
 * @returns {{qualificou_em: string|null, qualificouAgora: boolean}}
 */
export function resolverQualificacao(qualificouEmAtual, total, agora) {
  if (qualificouEmAtual) return { qualificou_em: qualificouEmAtual, qualificouAgora: false };
  if (total >= META_COMPRAS) return { qualificou_em: agora, qualificouAgora: true };
  return { qualificou_em: null, qualificouAgora: false };
}

/**
 * Fila do prêmio: ordem de chegada à meta, que define quem está dentro dos 50.
 * Empate no timestamp cai para mais compras e depois e-mail, para dar uma
 * ordem estável entre importações.
 *
 * @param {object[]} premios registros com email, qualificou_em, compras_confirmadas
 * @returns {Map<string, number>} email -> posição na fila (1-based)
 */
export function montarFilaVip(premios) {
  const qualificados = (premios || [])
    .filter((p) => p.qualificou_em)
    .sort(
      (a, b) =>
        String(a.qualificou_em).localeCompare(String(b.qualificou_em)) ||
        (b.compras_confirmadas || 0) - (a.compras_confirmadas || 0) ||
        String(a.email).localeCompare(String(b.email))
    );

  const fila = new Map();
  qualificados.forEach((p, i) => fila.set(p.email, i + 1));
  return fila;
}

/** Está dentro do teto de 50? */
export function dentroDoTeto(posicaoFila) {
  return Boolean(posicaoFila) && posicaoFila <= TETO_VIP;
}

/**
 * Ranking por compras confirmadas. Empate resolvido por quem qualificou antes
 * e depois por e-mail, para a posição não dançar entre dois carregamentos.
 *
 * @param {object[]} premios
 * @returns {object[]} mesma lista, ordenada, com `posicao` preenchida
 */
export function montarRanking(premios) {
  const ordenado = (premios || [])
    .slice()
    .sort(
      (a, b) =>
        (b.compras_confirmadas || 0) - (a.compras_confirmadas || 0) ||
        String(a.qualificou_em || '9999').localeCompare(String(b.qualificou_em || '9999')) ||
        String(a.email).localeCompare(String(b.email))
    );

  // Posição com empate: mesma contagem, mesma posição (ranking desportivo).
  let posicao = 0;
  let anterior = null;
  ordenado.forEach((registro, i) => {
    const total = registro.compras_confirmadas || 0;
    if (total !== anterior) {
      posicao = i + 1;
      anterior = total;
    }
    registro.posicao = posicao;
  });

  return ordenado;
}
