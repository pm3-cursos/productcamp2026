// Aviso ao n8n quando o time libera o upgrade VIP de um indicador.
// O n8n grava uma linha na planilha de pedidos com estes campos — a mesma
// planilha que alimenta a plataforma, por isso o Lote é a marca de cortesia
// que a leitura reconhece (ver LOTE_VIP_CORTESIA em config.js).

import { CATEGORIA_CORTESIA, LOTE_VIP_CORTESIA, MODALIDADE_VIP } from './config.js';
import { agoraBR } from './util.js';

const TIMEOUT_MS = 8000;

/** Monta o corpo exatamente com as colunas que o n8n espera. Puro. */
export function montarAvisoVip({ nome, email, quando }) {
  return {
    'Data do Pedido': quando || agoraBR(),
    Nome: nome || '',
    'E-mail': email,
    Lote: LOTE_VIP_CORTESIA,
    'Número de Ingressos': 1,
    'Valor por ingresso': 0,
    'Valor total do pedido': 0,
    Cupom: '',
    Categoria: CATEGORIA_CORTESIA,
    Formato: 'B2C',
    Modalidade: MODALIDADE_VIP,
  };
}

/**
 * Envia o aviso. Nunca lança: devolve `{status, detalhe}` para a liberação
 * do VIP ser registrada mesmo se o n8n estiver fora — o painel mostra o
 * aviso e o time reenvia ou preenche a planilha à mão.
 */
export async function avisarVipLiberado(env, corpo) {
  const url = env && env.N8N_VIP_WEBHOOK_URL;
  if (!url) return { status: 'nao_configurado', detalhe: 'N8N_VIP_WEBHOOK_URL ausente' };

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const cabecalhos = { 'Content-Type': 'application/json' };
    if (env.N8N_VIP_WEBHOOK_TOKEN) cabecalhos.Authorization = `Bearer ${env.N8N_VIP_WEBHOOK_TOKEN}`;
    const resposta = await fetch(url, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify(corpo),
      signal: controlador.signal,
    });
    if (!resposta.ok) return { status: 'falhou', detalhe: `HTTP ${resposta.status}` };
    return { status: 'ok', detalhe: `HTTP ${resposta.status}` };
  } catch (e) {
    const detalhe = e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e);
    return { status: 'falhou', detalhe };
  } finally {
    clearTimeout(timer);
  }
}
