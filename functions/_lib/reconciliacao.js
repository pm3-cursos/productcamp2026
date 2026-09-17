// Regras de negócio da conciliação. Tudo puro: recebe compras + indicadores
// e devolve as contagens. É a única implementação das regras — o script de
// sincronização roda isto em Node e grava o resultado no D1; as Functions só
// leem o que foi gravado.

import { META_COMPRAS, TETO_VIP } from './config.js';

/**
 * Uma compra conta para o indicador quando:
 *   1. o cupom é um e-mail que casa com um indicador ativo;
 *   2. o comprador não é o próprio indicador.
 * (Linhas canceladas e de outros eventos já ficaram de fora na leitura.)
 * Cada compra vale `quantidade` ingressos.
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
    porIndicador.set(email, { email, compras: [], total: 0, receita: 0, qualificou_em: null });
  }

  const cuponsOrfaos = new Map();
  let autoindicacoes = 0;
  let semCupom = 0;

  for (const compra of compras || []) {
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
    alvo.total += Number(compra.quantidade) || 1;
    alvo.receita += Number(compra.valor) || 0;
  }

  for (const registro of porIndicador.values()) {
    registro.compras.sort(compararPorData);
    registro.qualificado = registro.total >= META_COMPRAS;
    registro.qualificou_em = dataDeQualificacao(registro.compras);
    registro.receita = Math.round(registro.receita * 100) / 100;
  }

  return {
    porIndicador,
    cuponsOrfaos,
    diagnostico: {
      autoindicacoes,
      semCupom,
      cuponsOrfaosDistintos: cuponsOrfaos.size,
      linhasComCupomOrfao: [...cuponsOrfaos.values()].reduce((a, b) => a + b, 0),
    },
  };
}

function compararPorData(a, b) {
  return (
    String(a.data_compra || '9999').localeCompare(String(b.data_compra || '9999')) ||
    String(a.id_compra || '').localeCompare(String(b.id_compra || ''))
  );
}

/**
 * Momento em que o indicador bateu a meta: a data da compra que fez a soma
 * de ingressos chegar a META_COMPRAS. Derivada dos dados, então é a mesma em
 * qualquer sincronização — é ela que ordena a fila dos 50 prêmios.
 *
 * @param {object[]} comprasOrdenadas já em ordem de data
 * @returns {string|null}
 */
export function dataDeQualificacao(comprasOrdenadas) {
  let soma = 0;
  for (const compra of comprasOrdenadas || []) {
    soma += Number(compra.quantidade) || 1;
    if (soma >= META_COMPRAS) return compra.data_compra || null;
  }
  return null;
}

/**
 * Fila do prêmio: ordem de chegada à meta, que define quem está dentro dos 50.
 * Empate no timestamp cai para mais compras e depois e-mail, para dar uma
 * ordem estável entre sincronizações.
 *
 * @param {object[]} premios registros com email, qualificou_em, compras_confirmadas
 * @returns {Map<string, number>} email -> posição na fila (1-based)
 */
export function montarFilaVip(premios) {
  const qualificados = (premios || [])
    .filter((p) => p.qualificou_em || (p.compras_confirmadas || 0) >= META_COMPRAS)
    .sort(
      (a, b) =>
        String(a.qualificou_em || '9999').localeCompare(String(b.qualificou_em || '9999')) ||
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
