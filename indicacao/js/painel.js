// Painel do time PM3: tabela de indicadores, liberação manual do VIP e o
// botão que sincroniza com o Worker de vendas (lê os pedidos e regrava o
// snapshot da indicação — leva poucos segundos).

import {
  $,
  api,
  brl,
  brlCompacto,
  dataLonga,
  esc,
  ligarBotaoSair,
  mensagemDeErro,
  plural,
} from './comum.js';

ligarBotaoSair();

const estado = {
  // Cada carga do painel recebe um número: se uma resposta chega depois de
  // outra ter sido pedida (busca sendo digitada enquanto um detalhe carrega),
  // a resposta velha é descartada em vez de sobrescrever a tela.
  geracao: 0,
  filtro: 'todos',
  busca: '',
  expandidos: new Set(),
  comprasPorEmail: new Map(),
  kpis: {},
  // Paginação: página da tabela principal e, por indicador, do detalhe.
  pagina: 1,
  paginaDetalhe: new Map(),
  sincronizando: false,
};
const POR_PAGINA = 20;

// ---------------------------------------------------------------- paginação

/** Fatia a lista na página pedida (1-based), corrigindo página fora do alcance. */
function paginar(itens, pagina) {
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (atual - 1) * POR_PAGINA;
  return { fatia: itens.slice(inicio, inicio + POR_PAGINA), atual, paginas, total, inicio };
}

/** Controles Anterior / Próxima. `alvo` diz a qual tabela pertence. */
function renderPaginacao({ atual, paginas, total, inicio, fatia }, alvo) {
  if (total <= POR_PAGINA) return '';
  const fim = inicio + fatia.length;
  return `<nav class="paginacao" aria-label="Páginas da tabela">
    <button type="button" class="btn-secondary btn-compacto" data-pagina="${atual - 1}" data-alvo="${esc(alvo)}" ${atual <= 1 ? 'disabled' : ''}>&larr; Anterior</button>
    <span>${inicio + 1}–${fim} de ${total} · página ${atual} de ${paginas}</span>
    <button type="button" class="btn-secondary btn-compacto" data-pagina="${atual + 1}" data-alvo="${esc(alvo)}" ${atual >= paginas ? 'disabled' : ''}>Próxima &rarr;</button>
  </nav>`;
}

// ------------------------------------------------------------------ painel

function avisoPainel(texto) {
  const alvo = $('#aviso-painel');
  if (!texto) {
    alvo.classList.add('oculto');
    return;
  }
  alvo.textContent = texto;
  alvo.classList.remove('oculto');
}

function renderKpis(kpis) {
  estado.kpis = kpis;
  $('#kpi-ativos').textContent = kpis.indicadores_ativos;
  $('#kpi-compras').textContent = kpis.compras_confirmadas;
  $('#kpi-receita').textContent = brlCompacto(kpis.receita);
  $('#kpi-vip').textContent = kpis.vip_liberados;
  $('#kpi-teto').textContent = kpis.teto_vip;
  $('#kpi-vipbar').style.width = `${Math.min(100, (kpis.vip_liberados / kpis.teto_vip) * 100)}%`;
  $('#kpi-vagas').textContent = `${kpis.vagas_restantes} ${plural(
    kpis.vagas_restantes,
    'vaga restante',
    'vagas restantes'
  )} · ${kpis.qualificados} ${plural(kpis.qualificados, 'qualificado', 'qualificados')}`;
}

function linhaStatus(indicador) {
  if (indicador.qualificado) {
    const fora =
      indicador.posicao_fila_vip && !indicador.dentro_do_teto
        ? `<span class="fila-fora">${indicador.posicao_fila_vip}º a bater a meta — fora dos ${estado.kpis.teto_vip}</span>`
        : '';
    return `<span class="status-q">✓ Qualificou</span>${fora}`;
  }
  if (indicador.compras === 0) return '<span class="status-p">sem indicações</span>';
  return `<span class="status-p">${plural(indicador.faltam, 'falta', 'faltam')} ${
    indicador.faltam
  }</span>`;
}

function linhaVip(indicador) {
  if (!indicador.qualificado) {
    return `<button type="button" class="viptog" disabled aria-label="VIP disponível a partir de ${estado.kpis.meta} ingressos indicados">
      <span class="track"><i></i></span><span class="txt">após ${estado.kpis.meta} ingressos</span>
    </button>`;
  }
  const ligado = indicador.vip_liberado;
  const titulo = ligado
    ? `Liberado por ${indicador.liberado_por || 'equipe'}${
        indicador.liberado_em ? ` em ${dataLonga(indicador.liberado_em)}` : ''
      }`
    : 'Liberar upgrade VIP';
  return `<button type="button" class="viptog${ligado ? ' on' : ''}" data-vip="${esc(
    indicador.email
  )}" data-liberado="${ligado ? '1' : '0'}" title="${esc(titulo)}"
      aria-pressed="${ligado ? 'true' : 'false'}">
      <span class="track"><i></i></span>
      <span class="txt">${ligado ? 'Liberado' : 'Não liberado'}</span>
    </button>`;
}

function renderDetalhe(email) {
  const dados = estado.comprasPorEmail.get(email);
  if (!dados) return '<p class="carregando">Carregando compras…</p>';
  if (!dados.compras.length) {
    return '<p class="em">Nenhuma compra registrada com este cupom até agora.</p>';
  }
  const pagina = paginar(dados.compras, estado.paginaDetalhe.get(email) || 1);
  const linhas = pagina.fatia
    .map(
      (compra) => `<tr class="${compra.conta ? '' : 'nao-conta'}">
        <td>${esc(compra.comprador_nome || '—')}</td>
        <td>${esc(compra.comprador_email || '—')}</td>
        <td>${esc(compra.modalidade || '—')}</td>
        <td>${compra.quantidade}</td>
        <td>${brl(compra.valor)}</td>
        <td>${esc(dataLonga(compra.data_compra) || '—')}</td>
        <td>${compra.conta ? '✓ conta' : esc(compra.motivo || 'não conta')}</td>
      </tr>`
    )
    .join('');
  return `<div class="mini-wrap"><table class="mini">
      <thead><tr><th>Indicado</th><th>E-mail</th><th>Modalidade</th><th>Ingressos</th><th>Valor</th><th>Data</th><th>Conta?</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>${renderPaginacao(pagina, email)}`;
}

/** Iniciais do primeiro e do último nome, para o avatar da linha. */
function iniciaisDe(indicador) {
  const partes = String(indicador.nome_completo || indicador.primeiro_nome || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] || '' : '';
  return (primeira + ultima).toUpperCase();
}

function renderTabela(indicadores) {
  const corpo = $('#corpo-tabela');
  if (!indicadores.length) {
    corpo.innerHTML =
      '<tr><td colspan="7" class="carregando">Nenhum indicador encontrado com esse filtro.</td></tr>';
    $('#paginacao').innerHTML = '';
    return;
  }

  const pagina = paginar(indicadores, estado.pagina);
  estado.pagina = pagina.atual;
  $('#paginacao').innerHTML = renderPaginacao(pagina, 'tabela');

  corpo.innerHTML = pagina.fatia
    .map((indicador) => {
      const aberto = estado.expandidos.has(indicador.email);
      const detalhe = aberto
        ? `<tr class="detail">
             <td colspan="7"><div class="detail-inner">
               <h4>Compras indicadas por ${esc(indicador.nome_completo)}</h4>
               ${renderDetalhe(indicador.email)}
             </div></td>
           </tr>`
        : '';
      return `<tr>
          <td class="col-expandir"><button type="button" class="exp-btn" data-expandir="${esc(
            indicador.email
          )}" aria-expanded="${aberto}" aria-label="Ver compras de ${esc(
            indicador.nome_completo
          )}">${aberto ? '▾' : '▸'}</button></td>
          <td class="celula-nome"><div class="who"><span class="ini" aria-hidden="true">${esc(
            iniciaisDe(indicador)
          )}</span> ${esc(indicador.nome_completo)}</div></td>
          <td class="em" data-rotulo="Cupom" title="${esc(indicador.email)}">${esc(
            indicador.email
          )}</td>
          <td data-rotulo="Ingressos"><b>${indicador.compras}</b></td>
          <td data-rotulo="Status">${linhaStatus(indicador)}</td>
          <td data-rotulo="VIP liberado">${linhaVip(indicador)}</td>
          <td class="receita" data-rotulo="Receita">${brl(indicador.receita)}</td>
        </tr>${detalhe}`;
    })
    .join('');
}

// ------------------------------------------------------------ sincronização

function renderSync(dados) {
  const alvo = $('#sync-status');
  const botao = $('#sincronizar');
  const ultima = dados.ultima_sincronizacao;

  botao.disabled = estado.sincronizando || !dados.sync_configurado;
  botao.textContent = estado.sincronizando ? 'Atualizando…' : 'Atualizar dados';
  botao.title = dados.sync_configurado
    ? 'Lê os pedidos no Worker de vendas agora e atualiza o painel'
    : 'Fonte de pedidos não configurada (VENDAS_API_URL / VENDAS_API_TOKEN).';

  const partes = [];
  if (ultima) {
    const r = ultima.resumo || {};
    partes.push(
      `Última sincronização: <b>${esc(dataLonga(ultima.criado_em))}</b> (${esc(
        ultima.origem === 'worker' ? 'automática' : ultima.origem
      )}) · ${ultima.linhas_lidas} pedidos lidos · ${ultima.compras} do evento · ${
        ultima.indicadores
      } indicadores · ${ultima.qualificados} qualificados${
        r.fonte_sincronizado_em ? ` · planilha lida em ${esc(dataLonga(r.fonte_sincronizado_em))}` : ''
      }`
    );
    if (ultima.cupons_orfaos) {
      partes.push(
        `<span class="sync-alerta">${ultima.cupons_orfaos} ${plural(
          ultima.cupons_orfaos,
          'cupom de e-mail sem indicador',
          'cupons de e-mail sem indicador'
        )}${
          r.cupons_orfaos_lista && r.cupons_orfaos_lista.length
            ? ': ' + esc(r.cupons_orfaos_lista.map((o) => o.cupom).slice(0, 5).join(', '))
            : ''
        }</span>`
      );
    }
  } else {
    partes.push('Nenhuma sincronização registrada ainda.');
  }
  alvo.innerHTML = partes.join('<br>');
}

$('#sincronizar').addEventListener('click', async () => {
  estado.sincronizando = true;
  const botao = $('#sincronizar');
  botao.disabled = true;
  botao.textContent = 'Atualizando…';
  avisoPainel('');

  const resultado = await api('/api/admin/sincronizar', { method: 'POST', body: {} });
  estado.sincronizando = false;
  if (!resultado.ok) {
    avisoPainel(mensagemDeErro(resultado, 'Não conseguimos sincronizar agora.'));
  } else {
    estado.comprasPorEmail.clear();
  }
  await carregarPainel();
});

// ------------------------------------------------------------------ carga

async function carregarPainel() {
  const geracao = ++estado.geracao;
  const parametros = new URLSearchParams();
  if (estado.busca) parametros.set('q', estado.busca);
  if (estado.filtro !== 'todos') parametros.set('filtro', estado.filtro);

  const resultado = await api(`/api/admin/painel?${parametros}`);
  if (geracao !== estado.geracao) return; // já tem uma carga mais nova

  if (resultado.status === 403) {
    window.location.replace('/indicacao/?motivo=restrito');
    return;
  }
  if (!resultado.ok) {
    avisoPainel(mensagemDeErro(resultado, 'Não conseguimos carregar o painel agora.'));
    return;
  }

  avisoPainel('');
  renderKpis(resultado.dados.kpis);
  renderTabela(resultado.dados.indicadores);
  renderSync(resultado.dados);

  const mostrando = `Mostrando ${resultado.dados.indicadores.length} de ${resultado.dados.total} ${plural(
    resultado.dados.total,
    'indicador',
    'indicadores'
  )}. `;
  $('#nota-painel').innerHTML = `${mostrando}${$('#nota-painel').dataset.base || ''}`;
}

// Guarda o texto fixo da nota para recompor com os números a cada carga.
$('#nota-painel').dataset.base = $('#nota-painel').innerHTML.trim();

// -------------------------------------------------------------- interações

$('#paginacao').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-pagina]');
  if (!botao) return;
  estado.pagina = Number(botao.dataset.pagina);
  carregarPainel();
});

$('#corpo-tabela').addEventListener('click', async (evento) => {
  const paginaDetalhe = evento.target.closest('[data-pagina]');
  if (paginaDetalhe) {
    estado.paginaDetalhe.set(paginaDetalhe.dataset.alvo, Number(paginaDetalhe.dataset.pagina));
    await carregarPainel();
    return;
  }

  const expandir = evento.target.closest('[data-expandir]');
  if (expandir) {
    const email = expandir.dataset.expandir;
    if (estado.expandidos.has(email)) {
      estado.expandidos.delete(email);
      await carregarPainel();
      return;
    }
    estado.expandidos.add(email);
    await carregarPainel();
    if (!estado.comprasPorEmail.has(email)) {
      const resultado = await api(`/api/admin/compras?email=${encodeURIComponent(email)}`);
      if (resultado.ok) estado.comprasPorEmail.set(email, resultado.dados);
      await carregarPainel();
    }
    return;
  }

  const toggle = evento.target.closest('[data-vip]');
  if (!toggle) return;

  const email = toggle.dataset.vip;
  const liberar = toggle.dataset.liberado !== '1';
  await alternarVip(email, liberar, false);
});

async function alternarVip(email, liberar, confirmado) {
  const corpo = { email, liberado: liberar };
  if (confirmado) corpo.confirmar_acima_do_teto = true;

  const resultado = await api('/api/admin/vip', { method: 'POST', body: corpo });

  if (resultado.status === 409 && resultado.dados.confirmacao_necessaria) {
    if (window.confirm(resultado.dados.mensagem)) {
      await alternarVip(email, liberar, true);
    }
    return;
  }
  if (!resultado.ok) {
    avisoPainel(mensagemDeErro(resultado, 'Não conseguimos mudar a liberação do VIP.'));
    return;
  }

  estado.comprasPorEmail.delete(email);
  await carregarPainel();
}

let debounce;
$('#busca').addEventListener('input', (evento) => {
  estado.busca = evento.target.value;
  estado.pagina = 1;
  clearTimeout(debounce);
  debounce = setTimeout(carregarPainel, 250);
});

$('#filtros').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-filtro]');
  if (!botao) return;
  estado.filtro = botao.dataset.filtro;
  estado.pagina = 1;
  for (const outro of $('#filtros').querySelectorAll('button')) {
    outro.classList.toggle('on', outro === botao);
  }
  carregarPainel();
});

$('#exportar').addEventListener('click', () => {
  window.location.href = '/api/admin/exportar?tipo=indicadores';
});

// ------------------------------------------------------------------ início

api('/api/auth/sessao').then((resultado) => {
  if (resultado.ok && resultado.dados.autenticado) {
    $('#topo-email').textContent = resultado.dados.email;
  }
});

carregarPainel();
