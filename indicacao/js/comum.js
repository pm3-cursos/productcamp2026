// Helpers compartilhados pelas telas da plataforma de indicação.

/** Escapa texto antes de interpolar em HTML. */
export function esc(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Atalho de seleção. */
export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

/**
 * Chamada à API. Devolve `{ ok, status, dados }` em vez de lançar, para as
 * telas poderem mostrar a mensagem que o servidor mandou.
 */
export async function api(url, opcoes = {}) {
  const config = {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(opcoes.headers || {}) },
    ...opcoes,
  };
  if (config.body && typeof config.body !== 'string' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
    config.headers['Content-Type'] = 'application/json';
  }

  let resposta;
  try {
    resposta = await fetch(url, config);
  } catch {
    return {
      ok: false,
      status: 0,
      dados: { erro: 'rede', mensagem: 'Sem conexão com o servidor. Tente de novo.' },
    };
  }

  let dados = {};
  try {
    dados = await resposta.json();
  } catch {
    dados = {};
  }
  return { ok: resposta.ok, status: resposta.status, dados };
}

/** Mensagem de erro amigável a partir da resposta da API. */
export function mensagemDeErro(resultado, padrao = 'Não foi possível concluir. Tente de novo.') {
  return (resultado && resultado.dados && resultado.dados.mensagem) || padrao;
}

/** "R$ 1.214,10" */
export function brl(valor) {
  const n = Number(valor) || 0;
  const partes = n.toFixed(2).split('.');
  return `R$ ${partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${partes[1]}`;
}

/**
 * Forma curta para os KPIs. Abrevia só quando a abreviação não engole
 * informação: "R$ 415k" é útil, "R$ 6k" para R$ 6.070 não é.
 */
export function brlCompacto(valor) {
  const n = Number(valor) || 0;
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(n) >= 100000) return `R$ ${Math.round(n / 1000)}k`;
  return `R$ ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** "2026-09-05 14:32" -> "05/09/26" */
export function dataCurta(valor) {
  if (!valor) return '';
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(valor);
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

/** "2026-09-05 14:32" -> "05/09/2026 às 14:32" */
export function dataLonga(valor) {
  if (!valor) return '';
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(valor);
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${dia} às ${m[4]}:${m[5]}` : dia;
}

/** Plural simples: `plural(1,'compra','compras')`. */
export function plural(n, singular, pluralForma) {
  return Number(n) === 1 ? singular : pluralForma;
}

/** Encerra a sessão e volta para a tela de acesso. */
export async function sair() {
  await api('/api/auth/sair', { method: 'POST' });
  window.location.href = '/indicacao/';
}

/** Liga o botão de sair (existe no topo das duas telas logadas). */
export function ligarBotaoSair() {
  const botao = $('[data-sair]');
  if (botao) botao.addEventListener('click', sair);
}

/** Copia texto e dá o retorno visual no próprio botão. */
export async function copiar(texto, botao, rotulo = 'Copiar') {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Navegadores sem permissão de clipboard: seleciona para copiar à mão.
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.classList.add('so-leitor');
    document.body.appendChild(campo);
    campo.select();
    try {
      document.execCommand('copy');
    } catch {
      /* sem clipboard: o usuário copia manualmente */
    }
    campo.remove();
  }
  if (botao) {
    const alvo = botao.querySelector('[data-rotulo]') || botao;
    alvo.textContent = 'Copiado ✓';
    setTimeout(() => {
      alvo.textContent = rotulo;
    }, 1600);
  }
}
