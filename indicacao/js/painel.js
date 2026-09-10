// Painel do time PM3: tabela de indicadores, liberação manual do VIP e
// importação da planilha da Sympla (prévia de conciliação e confirmação).

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
  tipoImport: 'compras',
  arquivo: null,
};

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
  if (indicador.compras === 0) return '<span class="status-p">sem compras</span>';
  return `<span class="status-p">${plural(indicador.faltam, 'falta', 'faltam')} ${
    indicador.faltam
  }</span>`;
}

function linhaVip(indicador) {
  if (!indicador.qualificado) {
    return `<button type="button" class="viptog" disabled aria-label="VIP disponível a partir de ${estado.kpis.meta} compras">
      <span class="track"><i></i></span><span class="txt">após ${estado.kpis.meta} compras</span>
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
  const linhas = dados.compras
    .map(
      (compra) => `<tr class="${compra.conta ? '' : 'nao-conta'}">
        <td>${esc(compra.comprador_nome || '—')}</td>
        <td>${esc(compra.comprador_email || '—')}</td>
        <td>${esc(compra.numero_pedido || '—')}</td>
        <td>${esc(compra.tipo_ingresso || '—')}</td>
        <td>${brl(compra.valor)}</td>
        <td>${esc(dataLonga(compra.data_compra) || '—')}</td>
        <td>${compra.conta ? '✓ conta' : esc(compra.motivo || 'não conta')}</td>
      </tr>`
    )
    .join('');
  return `<div class="mini-wrap"><table class="mini">
      <thead><tr><th>Indicado</th><th>E-mail</th><th>Nº pedido</th><th>Ingresso</th><th>Valor</th><th>Data</th><th>Conta?</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
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
      '<tr><td colspan="8" class="carregando">Nenhum indicador encontrado com esse filtro.</td></tr>';
    return;
  }

  corpo.innerHTML = indicadores
    .map((indicador) => {
      const aberto = estado.expandidos.has(indicador.email);
      const detalhe = aberto
        ? `<tr class="detail">
             <td colspan="8"><div class="detail-inner">
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
          <td data-rotulo="Código"><span class="b-code">${esc(indicador.codigo_publico)}</span></td>
          <td class="em" data-rotulo="Cupom" title="${esc(indicador.email)}">${esc(
            indicador.email
          )}</td>
          <td data-rotulo="Compras"><b>${indicador.compras}</b></td>
          <td data-rotulo="Status">${linhaStatus(indicador)}</td>
          <td data-rotulo="VIP liberado">${linhaVip(indicador)}</td>
          <td class="receita" data-rotulo="Receita">${brl(indicador.receita)}</td>
        </tr>${detalhe}`;
    })
    .join('');
}

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

  const ultimo = resultado.dados.ultimo_import;
  const mostrando = `Mostrando ${resultado.dados.indicadores.length} de ${resultado.dados.total} ${plural(
    resultado.dados.total,
    'indicador',
    'indicadores'
  )}.`;
  const importe = ultimo
    ? ` Último import: ${esc(dataLonga(ultimo.criado_em))} por ${esc(ultimo.admin_email)}.`
    : ' Nenhuma planilha importada ainda.';
  $('#nota-painel').innerHTML = `${$('#nota-painel').dataset.base || ''}${mostrando}${importe}`;
}

// Guarda o texto fixo da nota para recompor com os números a cada carga.
$('#nota-painel').dataset.base = $('#nota-painel').innerHTML.trim() + ' ';

// -------------------------------------------------------------- interações

$('#corpo-tabela').addEventListener('click', async (evento) => {
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
  clearTimeout(debounce);
  debounce = setTimeout(carregarPainel, 250);
});

$('#filtros').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-filtro]');
  if (!botao) return;
  estado.filtro = botao.dataset.filtro;
  for (const outro of $('#filtros').querySelectorAll('button')) {
    outro.classList.toggle('on', outro === botao);
  }
  carregarPainel();
});

$('#exportar').addEventListener('click', () => {
  window.location.href = '/api/admin/exportar?tipo=indicadores';
});

// ------------------------------------------------------------- importação

function mostrarVista(qual) {
  $('#vista-painel').classList.toggle('oculto', qual !== 'painel');
  $('#vista-import').classList.toggle('oculto', qual !== 'import');
  $('#topo-titulo').textContent = qual === 'import' ? 'Importar planilha' : 'Painel de Indicação';
  window.scrollTo(0, 0);
}

function avisoImport(texto) {
  const alvo = $('#aviso-import');
  if (!texto) {
    alvo.classList.add('oculto');
    return;
  }
  alvo.textContent = texto;
  alvo.classList.remove('oculto');
}

function limparResultado() {
  $('#resultado').classList.add('oculto');
  $('#resultado-cards').innerHTML = '';
  $('#resultado-detalhes').innerHTML = '';
  $('#resultado-previa').innerHTML = '';
  $('#resultado-previa').classList.add('oculto');
  $('#resultado-orfaos').innerHTML = '';
  $('#resultado-orfaos').classList.add('oculto');
}

$('#abrir-import').addEventListener('click', () => {
  avisoImport('');
  limparResultado();
  estado.arquivo = null;
  $('#arquivo-nome').classList.add('oculto');
  mostrarVista('import');
});
$('#voltar-painel').addEventListener('click', () => mostrarVista('painel'));
$('#cancelar').addEventListener('click', () => {
  limparResultado();
  estado.arquivo = null;
  $('#arquivo-nome').classList.add('oculto');
});

$('#tipo-import').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-tipo]');
  if (!botao) return;
  estado.tipoImport = botao.dataset.tipo;
  for (const outro of $('#tipo-import').querySelectorAll('button')) {
    outro.classList.toggle('on', outro === botao);
  }
  const compras = estado.tipoImport === 'compras';
  $('#drop-titulo').textContent = compras
    ? 'Arraste o export da Sympla aqui'
    : 'Arraste a lista de indicadores aqui';
  $('#drop-sub').textContent = compras
    ? 'Formatos aceitos: .csv ou .xlsx · o mesmo relatório de participantes de sempre'
    : 'Formatos aceitos: .csv ou .xlsx · com as colunas E-mail, Código público e Primeiro nome — ou o próprio export da Sympla, de onde a lista é derivada';
  limparResultado();
  avisoImport('');
});

$('#selecionar').addEventListener('click', () => $('#arquivo').click());
$('#arquivo').addEventListener('change', (evento) => {
  const arquivo = evento.target.files && evento.target.files[0];
  if (arquivo) receberArquivo(arquivo);
});

const areaDrop = $('#area-drop');
for (const nome of ['dragenter', 'dragover']) {
  areaDrop.addEventListener(nome, (evento) => {
    evento.preventDefault();
    areaDrop.classList.add('hover');
  });
}
for (const nome of ['dragleave', 'drop']) {
  areaDrop.addEventListener(nome, (evento) => {
    evento.preventDefault();
    areaDrop.classList.remove('hover');
  });
}
areaDrop.addEventListener('drop', (evento) => {
  const arquivo = evento.dataTransfer && evento.dataTransfer.files[0];
  if (arquivo) receberArquivo(arquivo);
});

async function receberArquivo(arquivo) {
  estado.arquivo = arquivo;
  $('#arquivo-nome').textContent = `${arquivo.name} · ${(arquivo.size / 1024).toFixed(0)} KB`;
  $('#arquivo-nome').classList.remove('oculto');
  await enviarImport('prever');
}

function card(valor, rotulo, cor = '') {
  return `<div class="res-card"><div class="n ${cor}">${esc(valor)}</div><div class="l">${esc(
    rotulo
  )}</div></div>`;
}

function renderResumo(resumo, aplicado) {
  // Os quatro números de cabeça são os das telas aprovadas. O resto da
  // conciliação vem numa linha de detalhes, para o resumo não virar um mural.
  const maisNovas = (n) => (Number(n) > 0 ? `+${n}` : String(n));
  const cards = [];
  const detalhes = [];

  if (resumo.tipo === 'compras') {
    cards.push(card(resumo.compras_na_planilha, 'compras lidas na planilha'));
    cards.push(card(maisNovas(resumo.novas), 'novas desde o último import', 'c'));
    cards.push(card(resumo.qualificados_agora, 'indicadores qualificaram agora', 'c'));
    cards.push(card(resumo.vip_alterados, 'marcações de VIP alteradas', 'p'));

    detalhes.push([resumo.aprovadas, 'com pagamento aprovado']);
    detalhes.push([resumo.atualizadas, 'já existiam e foram atualizadas']);
    detalhes.push([resumo.ausentes, 'aprovadas que saíram da planilha']);
    detalhes.push([resumo.linhas_com_cupom_orfao, 'linhas com cupom sem indicador']);
    detalhes.push([resumo.autoindicacoes, 'compras do próprio indicador (não contam)']);
    if (resumo.sem_cupom) detalhes.push([resumo.sem_cupom, 'compras sem cupom']);
    if (resumo.duplicadas_no_arquivo) {
      detalhes.push([resumo.duplicadas_no_arquivo, 'Nº ingresso repetido no arquivo']);
    }
    if (resumo.sem_identificador) {
      detalhes.push([resumo.sem_identificador, 'linhas sem Nº ingresso (ignoradas)']);
    }
  } else {
    cards.push(card(resumo.indicadores_na_planilha, 'indicadores na planilha'));
    cards.push(card(maisNovas(resumo.novos), 'novos na lista de cupons', 'c'));
    cards.push(card(resumo.atualizados, 'já existiam e foram atualizados'));
    cards.push(card(resumo.excluidos_vip, 'e-mails com ingresso VIP, fora da lista', 'p'));

    if (resumo.qualificados_agora !== undefined) {
      detalhes.push([resumo.qualificados_agora, 'indicadores qualificaram agora']);
    }
    if (resumo.cupons_orfaos !== undefined) {
      detalhes.push([resumo.cupons_orfaos, 'cupons ainda sem indicador']);
    }
    if (resumo.vip_alterados !== undefined) {
      detalhes.push([resumo.vip_alterados, 'marcações de VIP alteradas']);
    }
  }

  $('#resultado-cards').innerHTML = cards.join('');
  $('#resultado-detalhes').innerHTML = detalhes
    .map(([valor, rotulo]) => `<span><b>${esc(valor)}</b> ${esc(rotulo)}</span>`)
    .join('');

  const previa = resumo.previa || [];
  if (previa.length) {
    const linhas =
      resumo.tipo === 'compras'
        ? previa
            .map(
              (item) => `<tr>
                <td>${esc(item.comprador)}</td>
                <td class="em">${esc(item.cupom)}</td>
                <td>${esc(item.indicador || '(cupom sem indicador)')}</td>
                <td>${brl(item.valor)}</td>
                <td><span class="tag-new">nova</span></td>
              </tr>`
            )
            .join('')
        : previa
            .map(
              (item) => `<tr>
                <td>${esc(item.primeiro_nome)}</td>
                <td class="em">${esc(item.email)}</td>
                <td><span class="b-code">${esc(item.codigo_publico)}</span></td>
                <td><span class="tag-new">novo</span></td>
              </tr>`
            )
            .join('');
    const cabecalho =
      resumo.tipo === 'compras'
        ? '<tr><th>Comprador</th><th>Cupom usado (e-mail)</th><th>Indicador</th><th>Valor</th><th></th></tr>'
        : '<tr><th>Nome</th><th>Cupom (e-mail)</th><th>Código</th><th></th></tr>';
    $('#resultado-previa').innerHTML = `
      <div class="card-h"><h3>Prévia da conciliação</h3><span class="sm">${
        resumo.tipo === 'compras' ? 'novas compras atribuídas' : 'novos indicadores'
      }</span></div>
      <table><thead>${cabecalho}</thead><tbody>${linhas}</tbody></table>`;
    $('#resultado-previa').classList.remove('oculto');
  }

  const orfaos = resumo.cupons_orfaos_lista || [];
  if (orfaos.length) {
    $('#resultado-orfaos').innerHTML = `
      <div class="card-h"><h3>Cupons sem indicador</h3><span class="sm">revisar com a organização</span></div>
      <table><thead><tr><th>Cupom na planilha</th><th>Linhas</th></tr></thead><tbody>${orfaos
        .map(
          (item) =>
            `<tr><td class="em">${esc(item.cupom)}</td><td>${item.linhas}</td></tr>`
        )
        .join('')}</tbody></table>`;
    $('#resultado-orfaos').classList.remove('oculto');
  }

  $('#confirmar').textContent = aplicado
    ? 'Voltar ao painel'
    : 'Confirmar e atualizar painel';
  $('#resultado').classList.remove('oculto');
}

async function enviarImport(acao) {
  if (!estado.arquivo) {
    avisoImport('Escolha o arquivo da planilha primeiro.');
    return;
  }
  avisoImport('');

  const formulario = new FormData();
  formulario.append('arquivo', estado.arquivo);
  formulario.append('tipo', estado.tipoImport);
  formulario.append('acao', acao);

  $('#confirmar').disabled = true;
  $('#selecionar').disabled = true;

  const resultado = await api('/api/admin/importar', { method: 'POST', body: formulario });

  $('#confirmar').disabled = false;
  $('#selecionar').disabled = false;

  if (resultado.status === 403) {
    window.location.replace('/indicacao/?motivo=restrito');
    return;
  }
  if (!resultado.ok) {
    limparResultado();
    avisoImport(mensagemDeErro(resultado, 'Não conseguimos ler esta planilha.'));
    return;
  }

  renderResumo(resultado.dados.resumo, resultado.dados.aplicado);
  if (resultado.dados.aplicado) {
    estado.comprasPorEmail.clear();
    await carregarPainel();
  }
}

$('#confirmar').addEventListener('click', async () => {
  if ($('#confirmar').textContent.startsWith('Voltar')) {
    limparResultado();
    estado.arquivo = null;
    $('#arquivo-nome').classList.add('oculto');
    mostrarVista('painel');
    return;
  }
  await enviarImport('aplicar');
});

// ------------------------------------------------------------------ início

api('/api/auth/sessao').then((resultado) => {
  if (resultado.ok && resultado.dados.autenticado) {
    $('#topo-email').textContent = resultado.dados.email;
  }
});

carregarPainel();
