/**
 * PCamp 2026 — Countdown de virada de lote (versão generalizada)
 * ----------------------------------------------------------------
 * Diferença da v1: em vez de receber UMA data fixa, esse script tem o
 * calendário completo de lotes embutido (LOTES abaixo). A cada
 * carregamento de página ele descobre sozinho qual lote está ativo
 * HOJE e mostra o countdown até o fim dele. Quando um lote vira,
 * na próxima carga de página o widget já aponta pro lote seguinte
 * automaticamente — não precisa mexer no HTML/deploy a cada virada.
 *
 * Janela de exibição: o widget só aparece nos últimos N dias antes do
 * fim do lote ativo (ver VISIBLE_WINDOW_DAYS abaixo, padrão = 7). Fora
 * dessa janela, mesmo com um lote ativo, o widget não é renderizado —
 * gera mais urgência/FOMO em vez de ficar "diluído" o mês inteiro.
 *
 * Uso (só precisa dessa linha, no ponto onde o widget deve aparecer):
 *
 *   <script
 *     src="/assets/js/pcamp-countdown-lotes.js"
 *     data-cta-text="Garantir ingresso"
 *     data-cta-url="https://go.pm3.com.br/ingressos-pcamp26"></script>
 *
 * IMPORTANTE: este script se autoposiciona via document.currentScript,
 * então NÃO deve ser carregado com defer/async (nesses modos
 * currentScript é null e o widget se insere no lugar errado).
 *
 * Pra atualizar datas no futuro (ex: calendário mudar), edite só o
 * array LOTES abaixo — não precisa tocar no resto do código.
 *
 * Comportamento:
 *  - Descobre o lote cujo intervalo [start, end] contém o momento atual.
 *  - Se não houver lote ativo (ex: entre Last Minute e o evento, ou
 *    evento já passou), o widget não renderiza — sem "00:00:00" travado.
 *  - Se estiver com a página aberta no exato instante da virada, o
 *    widget se remove sozinho (não faz auto-switch em tempo real pro
 *    próximo lote sem reload, de propósito — evita mostrar preço novo
 *    antes da virada realmente valer no checkout).
 *  - Sem dependências externas.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------
  // ÚNICO PONTO QUE PRECISA SER EDITADO QUANDO O CALENDÁRIO MUDAR
  // ---------------------------------------------------------------
  var LOTES = [
    { id: "pre-venda",   label: "Pré-venda",   start: "2025-12-10T00:00:00-03:00", end: "2025-12-30T23:59:59-03:00" },
    { id: "early-bird",  label: "Early Bird",  start: "2026-06-01T00:00:00-03:00", end: "2026-06-16T23:59:59-03:00" },
    { id: "lote-1",      label: "Lote 1",      start: "2026-06-17T00:00:00-03:00", end: "2026-07-17T23:59:59-03:00" },
    { id: "lote-2",      label: "Lote 2",      start: "2026-07-18T00:00:00-03:00", end: "2026-08-18T23:59:59-03:00" },
    { id: "lote-3",      label: "Lote 3",      start: "2026-08-19T00:00:00-03:00", end: "2026-09-18T23:59:59-03:00" },
    { id: "lote-4",      label: "Lote 4",      start: "2026-09-19T00:00:00-03:00", end: "2026-10-15T23:59:59-03:00" },
    { id: "lote-5",      label: "Lote 5",      start: "2026-10-16T00:00:00-03:00", end: "2026-11-03T23:59:59-03:00" },
    { id: "last-minute", label: "Last Minute", start: "2026-11-04T00:00:00-03:00", end: "2026-11-24T23:59:59-03:00" }
  ];

  // Quantos dias antes do fim do lote o widget passa a aparecer.
  var VISIBLE_WINDOW_DAYS = 7;
  // ---------------------------------------------------------------

  var CONTAINER_ID = "pcamp-countdown-lotes";
  var STYLE_ID = "pcamp-countdown-lotes-style";

  function getCurrentScript() {
    return document.currentScript || (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();
  }

  function findActiveLote(now) {
    for (var i = 0; i < LOTES.length; i++) {
      var start = new Date(LOTES[i].start);
      var end = new Date(LOTES[i].end);
      if (now >= start && now <= end) return LOTES[i];
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "#" + CONTAINER_ID + "{",
      "  --pcc-bg: rgba(223,12,120,0.14);",
      "  --pcc-border: rgba(223,12,120,0.3);",
      "  --pcc-text: #f5f5f3;",
      "  --pcc-accent: #f02d8e;",
      "  --pcc-muted: #f02d8e;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;",
      "  gap: 16px; background: var(--pcc-bg); color: var(--pcc-text);",
      "  border: 1px solid var(--pcc-border);",
      "  padding: 14px 22px; border-radius: 10px;",
      "  margin-top: 24px;",
      "}",
      "#" + CONTAINER_ID + " .pcc-label{ font-size: 14px; color: var(--pcc-muted); font-weight: 500; }",
      "#" + CONTAINER_ID + " .pcc-units{ display: flex; gap: 10px; }",
      "#" + CONTAINER_ID + " .pcc-unit{ display: flex; flex-direction: column; align-items: center; min-width: 46px; }",
      "#" + CONTAINER_ID + " .pcc-value{ font-size: 22px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }",
      "#" + CONTAINER_ID + " .pcc-unit-label{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--pcc-muted); margin-top: 4px; }",
      "#" + CONTAINER_ID + " .pcc-cta{",
      "  background: var(--pcc-accent); color: #fff; text-decoration: none;",
      "  font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 999px;",
      "  white-space: nowrap; transition: opacity 0.15s;",
      "}",
      "#" + CONTAINER_ID + " .pcc-cta:hover{ opacity: 0.85; }",
      "@media (max-width: 480px){",
      "  #" + CONTAINER_ID + "{ flex-direction: column; gap: 10px; padding: 12px 16px; }",
      "  #" + CONTAINER_ID + " .pcc-unit{ min-width: 40px; }",
      "  #" + CONTAINER_ID + " .pcc-value{ font-size: 18px; }",
      "}"
    ].join("\n");
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function buildMarkup(container, opts) {
    container.innerHTML =
      '<span class="pcc-label">' + opts.label + "</span>" +
      '<div class="pcc-units">' +
      '<div class="pcc-unit"><span class="pcc-value" data-pcc="d">00</span><span class="pcc-unit-label">dias</span></div>' +
      '<div class="pcc-unit"><span class="pcc-value" data-pcc="h">00</span><span class="pcc-unit-label">h</span></div>' +
      '<div class="pcc-unit"><span class="pcc-value" data-pcc="m">00</span><span class="pcc-unit-label">min</span></div>' +
      '<div class="pcc-unit"><span class="pcc-value" data-pcc="s">00</span><span class="pcc-unit-label">seg</span></div>' +
      "</div>" +
      (opts.ctaUrl ? '<a class="pcc-cta" href="' + opts.ctaUrl + '">' + opts.ctaText + "</a>" : "");
  }

  function removeWidget(container) {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    var style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
  }

  function init() {
    var script = getCurrentScript();

    var labelTemplate = (script && script.getAttribute("data-label-template")) || "{lote} termina em:";
    var ctaText = (script && script.getAttribute("data-cta-text")) || "Garantir ingresso";
    var ctaUrl = script && script.getAttribute("data-cta-url"); // opcional

    var now = new Date();
    var lote = findActiveLote(now);

    // Sem lote ativo hoje (gap entre fases, ou fora do período de vendas) → não renderiza nada.
    if (!lote) {
      var existing = document.getElementById(CONTAINER_ID);
      if (existing) removeWidget(existing);
      return;
    }

    var targetDate = new Date(lote.end);

    // Fora da janela de urgência (mais de N dias antes do fim do lote) → não renderiza.
    var windowStart = new Date(targetDate.getTime() - VISIBLE_WINDOW_DAYS * 86400000);
    if (now < windowStart) {
      var existingOutOfWindow = document.getElementById(CONTAINER_ID);
      if (existingOutOfWindow) removeWidget(existingOutOfWindow);
      return;
    }

    var label = labelTemplate.replace("{lote}", lote.label);

    injectStyles();

    var container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      if (script && script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }

    buildMarkup(container, { label: label, ctaText: ctaText, ctaUrl: ctaUrl });

    function tick() {
      var nowTick = new Date();
      var diff = targetDate - nowTick;

      if (diff <= 0) {
        clearInterval(timer);
        removeWidget(container);
        return;
      }

      var totalSeconds = Math.floor(diff / 1000);
      var days = Math.floor(totalSeconds / 86400);
      var hours = Math.floor((totalSeconds % 86400) / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;

      container.querySelector('[data-pcc="d"]').textContent = pad(days);
      container.querySelector('[data-pcc="h"]').textContent = pad(hours);
      container.querySelector('[data-pcc="m"]').textContent = pad(minutes);
      container.querySelector('[data-pcc="s"]').textContent = pad(seconds);
    }

    tick();
    var timer = setInterval(tick, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
