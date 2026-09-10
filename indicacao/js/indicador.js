// Visão do indicador. Os três estados das telas aprovadas (inicial, em
// progresso e VIP conquistado) saem dos mesmos dados: o que muda é a
// contagem e o `vip_liberado` que o time PM3 marcou no painel.

import {
  $,
  api,
  copiar,
  dataCurta,
  esc,
  ligarBotaoSair,
  mensagemDeErro,
  plural,
} from './comum.js';

ligarBotaoSair();

function titulo(dados) {
  if (dados.vip_liberado) return 'Você garantiu seu upgrade VIP! 🎉';
  if (dados.qualificado) return 'Meta batida! Seu VIP está em análise 🎉';
  if (dados.compras_confirmadas === 0) return `Comece indicando ${dados.meta} pessoas`;
  const faltam = dados.faltam;
  return faltam === 1
    ? 'Falta 1 indicação pro seu VIP'
    : `Faltam ${faltam} indicações pro seu VIP`;
}

function renderBarra(dados) {
  const total = Math.max(dados.meta, dados.compras_confirmadas);
  const segmentos = [];
  for (let i = 1; i <= total; i++) {
    segmentos.push(`<span class="s${i <= dados.compras_confirmadas ? ' fill' : ''}"></span>`);
  }
  $('#barra-progresso').innerHTML = segmentos.join('');
  $('#barra-progresso').setAttribute(
    'aria-label',
    `${dados.compras_confirmadas} de ${dados.meta} compras confirmadas`
  );
}

function renderIndicacoes(dados) {
  const alvo = $('#lista-indicacoes');
  if (!dados.indicacoes.length) {
    alvo.innerHTML = `<div class="empty">
      <div class="big" aria-hidden="true">🫥</div>
      Suas indicações aparecem aqui assim que comprarem com o seu cupom. Bora chamar a galera!
    </div>`;
    return;
  }
  alvo.innerHTML = dados.indicacoes
    .map(
      (item) => `<div class="listrow">
        <div class="ini" aria-hidden="true">${esc(item.iniciais)}</div>
        <div class="nm">${esc(item.nome)}${
          item.data ? `<span class="quando">comprou em ${esc(dataCurta(item.data))}</span>` : ''
        }</div>
        <span class="badge b-ok">✓ Comprou</span>
      </div>`
    )
    .join('');
}

function renderRanking(dados) {
  const medalhas = { 1: 'g', 2: 's', 3: 'b' };
  const lideres = dados.ranking.lideres || [];
  const eu = dados.ranking.eu;
  const souLider = lideres.some((l) => l.sou_eu);

  const linhas = lideres.map((lider) => {
    const classePos = medalhas[lider.posicao] ? ` ${medalhas[lider.posicao]}` : '';
    return `<div class="rk${lider.sou_eu ? ' me' : ''}">
      <div class="pos${classePos}">${lider.posicao}</div>
      <div class="nm"><b>${esc(lider.primeiro_nome)}</b>
        <span class="code">· ${esc(lider.codigo_publico)}</span>
        ${lider.sou_eu ? '<span class="youtag">você</span>' : ''}
      </div>
      <div class="ct">${lider.compras}</div>
    </div>`;
  });

  if (!souLider) {
    if (lideres.length) linhas.push('<div class="rk-div" aria-hidden="true">· · ·</div>');
    linhas.push(`<div class="rk me">
      <div class="pos">${eu.posicao || '—'}</div>
      <div class="nm"><b>${esc(eu.primeiro_nome)}</b>
        <span class="code">· ${esc(eu.codigo_publico)}</span>
        <span class="youtag">você</span>
      </div>
      <div class="ct">${eu.compras}</div>
    </div>`);
  }

  $('#lista-ranking').innerHTML = linhas.join('');
}

function render(dados) {
  $('#topo-nome').textContent = dados.primeiro_nome || 'você';
  $('#topo-avatar').textContent = dados.iniciais || '··';
  document.title = `Minhas indicações (${dados.compras_confirmadas}/${dados.meta}) | Product Camp 2026`;

  $('#titulo-progresso').textContent = titulo(dados);
  $('#contador').textContent = `${dados.compras_confirmadas} de ${dados.meta}`;
  renderBarra(dados);

  $('#stat-confirmadas').textContent = dados.compras_confirmadas;
  $('#stat-faltam').textContent = dados.faltam;
  $('#stat-posicao').textContent = dados.posicao ? `#${dados.posicao}` : '—';

  const cupom = dados.cupom;
  $('#cupom').textContent = cupom;
  $('#wa-compartilhar').href = dados.whatsapp;
  $('#wa-convidar').href = dados.whatsapp;
  $('#botao-copiar').addEventListener('click', (evento) =>
    copiar(cupom, evento.currentTarget)
  );

  // Estado "VIP conquistado": o texto de instrução sai de cena e entram o
  // aviso de vaga garantida e a mensagem de que o cupom continua ativo.
  if (dados.vip_liberado) {
    $('#subtitulo').classList.add('oculto');
    $('#banner-vip').classList.remove('oculto');
    $('#nota-cupom-ativo').classList.remove('oculto');
  } else if (dados.qualificado) {
    $('#subtitulo').textContent = `Você já tem ${dados.compras_confirmadas} ${plural(
      dados.compras_confirmadas,
      'compra confirmada',
      'compras confirmadas'
    )} e bateu a meta. A equipe do Product Camp libera o upgrade e você recebe o aviso por aqui.`;
  }

  renderIndicacoes(dados);
  renderRanking(dados);

  $('#carregando').classList.add('oculto');
  $('#conteudo').classList.remove('oculto');
}

async function carregar() {
  const resultado = await api('/api/me');

  if (resultado.status === 401) {
    window.location.replace('/indicacao/?motivo=sessao');
    return;
  }
  if (!resultado.ok) {
    $('#carregando').classList.add('oculto');
    const aviso = $('#aviso-erro');
    aviso.textContent = mensagemDeErro(resultado, 'Não conseguimos carregar sua página agora.');
    aviso.classList.remove('oculto');
    return;
  }

  render(resultado.dados);
}

carregar();
