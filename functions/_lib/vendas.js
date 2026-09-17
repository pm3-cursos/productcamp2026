// Cliente do Worker `pm3-eventos-vendas-sync`, que espelha a planilha de
// vendas no D1 `pm3-eventos` (conta Admins@cursospm3). Como o site vive em
// outra conta da Cloudflare, não há binding: a leitura é por HTTP, com um
// token só de leitura (VENDAS_API_TOKEN) guardado nos secrets do Pages.
//
// O que chega é a tabela `pedidos` bruta (todos os eventos, cancelados
// marcados). Aqui ela vira a matriz "planilha" que `planilha.js` já sabe ler
// — assim as regras de indicação e os testes não mudam de fonte.

import { EVENTO_PLANILHA } from './config.js';

const TIMEOUT_MS = 20000;

/** Cabeçalho na ordem que `planilha.js` reconhece. */
export const CABECALHO = [
  'Data do Pedido',
  'Nome',
  'Sobrenome',
  'E-mail',
  'Lote',
  'Número de Ingressos',
  'Valor por ingresso',
  'Valor total do pedido',
  'Cupom',
  'Categoria',
  'Formato',
  'Modalidade',
  'Evento',
];

/** Uma linha de `pedidos` (JSON do Worker) -> linha da matriz. Puro. */
export function pedidoParaLinha(p) {
  const texto = (v) => (v == null ? '' : String(v));
  return [
    texto(p.data_pedido),
    texto(p.nome),
    texto(p.sobrenome),
    texto(p.email),
    texto(p.lote),
    Number(p.cancelado) === 1 ? 'CANCELADO' : texto(p.numero_ingressos),
    texto(p.valor_unitario),
    texto(p.valor_total),
    texto(p.cupom),
    texto(p.categoria),
    texto(p.formato),
    texto(p.modalidade),
    texto(p.evento),
  ];
}

/** Lista de pedidos -> matriz com cabeçalho. Puro. */
export function pedidosParaMatriz(pedidos) {
  return [CABECALHO, ...(pedidos || []).map(pedidoParaLinha)];
}

export function vendasConfigurado(env) {
  return Boolean(env && env.VENDAS_API_URL && env.VENDAS_API_TOKEN);
}

/**
 * Busca os pedidos do evento no Worker. Lança com mensagem legível quando
 * não está configurado ou o Worker não responde.
 *
 * @returns {Promise<{pedidos: object[], sync_id: number|null, sincronizado_em: string|null}>}
 */
export async function buscarPedidos(env, { evento = EVENTO_PLANILHA } = {}) {
  if (!vendasConfigurado(env)) {
    throw new Error('VENDAS_API_URL / VENDAS_API_TOKEN não configurados no Pages (ver indicacao/LEIA-ME.md).');
  }
  const base = String(env.VENDAS_API_URL).replace(/\/+$/, '');
  const url = `${base}/pedidos?evento=${encodeURIComponent(evento)}`;

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${env.VENDAS_API_TOKEN}`, Accept: 'application/json' },
      signal: controlador.signal,
    });
  } catch (e) {
    throw new Error(`Worker de vendas não respondeu (${e && e.name === 'AbortError' ? 'timeout' : e.message}).`);
  } finally {
    clearTimeout(timer);
  }
  if (!resposta.ok) {
    throw new Error(`Worker de vendas respondeu HTTP ${resposta.status}.`);
  }
  const dados = await resposta.json();
  if (!dados || !Array.isArray(dados.pedidos)) {
    throw new Error('Resposta do Worker de vendas sem a lista de pedidos.');
  }
  return { pedidos: dados.pedidos, sync_id: dados.sync_id ?? null, sincronizado_em: dados.sincronizado_em ?? null };
}
