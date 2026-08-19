/**
 * PCamp 2026 — Countdown de virada de lote
 * ----------------------------------------------------------------
 * Descobre sozinho qual lote está ativo agora pelo calendário embutido
 * (LOTES abaixo) e mostra a contagem regressiva até o fim dele.
 *
 * Uso: o destino é qualquer elemento com o atributo data-pcamp-countdown,
 * que já exista no HTML com `hidden`. O script preenche e revela. Havendo
 * mais de um, todos compartilham o mesmo relógio. Como ele localiza os
 * containers por atributo, PODE (e deve) ser carregado com defer — não
 * depende de document.currentScript nem da posição da tag.
 *
 * Estilos vivem no bloco <style> do index.html, junto do resto do CSS
 * do site, e usam os tokens do design system.
 *
 * Janela de exibição: só aparece nos últimos VISIBLE_WINDOW_DAYS dias
 * antes do fim do lote ativo, para concentrar a urgência em vez de
 * diluí-la o mês inteiro.
 *
 * Comportamento:
 *  - Sem lote ativo (gap entre fases, ou fora do período de vendas) →
 *    permanece oculto, sem "00:00:00" travado.
 *  - Na virada com a página aberta, se oculta sozinho. Não pula para o
 *    lote seguinte sem reload, de propósito: evita anunciar preço novo
 *    antes de a virada valer no checkout.
 *  - Pausa o relógio quando a aba sai de foco.
 *  - Sem dependências externas.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------
  // ÚNICO PONTO QUE PRECISA SER EDITADO QUANDO O CALENDÁRIO MUDAR
  //
  // ATENÇÃO: o lote também aparece FIXO no index.html, em dois lugares
  // que este arquivo não controla e que precisam mudar junto, no mesmo
  // deploy, senão a página se contradiz (countdown anunciando um lote e
  // os cards vendendo outro):
  //   1. os badges <span class="lote-badge">LOTE N</span> dos ingressos
  //   2. o JSON-LD de Event → offers: "Ingresso Lote N", os preços e o
  //      priceValidUntil, que deve receber a data de fim do lote ativo
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
  var LABEL_TEMPLATE = "{lote} termina em:";
  // ---------------------------------------------------------------

  // Seletor por atributo, não por id: o widget pode aparecer em mais de um
  // ponto da página, e todos ficam em sincronia com o mesmo relógio.
  var CONTAINER_SELECTOR = "[data-pcamp-countdown]";

  function findActiveLote(now) {
    for (var i = 0; i < LOTES.length; i++) {
      if (now >= new Date(LOTES[i].start) && now <= new Date(LOTES[i].end)) return LOTES[i];
    }
    return null;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function buildMarkup(container, label) {
    container.innerHTML =
      '<span class="pcc-label"></span>' +
      '<div class="pcc-units">' +
        '<div class="pcc-unit"><span class="pcc-value" data-pcc="d">00</span><span class="pcc-unit-label">dias</span></div>' +
        '<div class="pcc-unit"><span class="pcc-value" data-pcc="h">00</span><span class="pcc-unit-label">h</span></div>' +
        '<div class="pcc-unit"><span class="pcc-value" data-pcc="m">00</span><span class="pcc-unit-label">min</span></div>' +
        '<div class="pcc-unit"><span class="pcc-value" data-pcc="s">00</span><span class="pcc-unit-label">seg</span></div>' +
      "</div>";
    // textContent em vez de interpolar no HTML: o label vem do LOTES,
    // mas não custa nada manter a inserção livre de marcação.
    container.querySelector(".pcc-label").textContent = label;
  }

  function init() {
    var containers = document.querySelectorAll(CONTAINER_SELECTOR);
    if (!containers.length) return;

    var lote = findActiveLote(new Date());
    if (!lote) return;

    var targetDate = new Date(lote.end);
    var windowStart = new Date(targetDate.getTime() - VISIBLE_WINDOW_DAYS * 86400000);
    if (new Date() < windowStart) return;

    var label = LABEL_TEMPLATE.replace("{lote}", lote.label);
    var views = [];

    Array.prototype.forEach.call(containers, function (container) {
      buildMarkup(container, label);
      views.push({
        el: container,
        d: container.querySelector('[data-pcc="d"]'),
        h: container.querySelector('[data-pcc="h"]'),
        m: container.querySelector('[data-pcc="m"]'),
        s: container.querySelector('[data-pcc="s"]')
      });
    });

    var timer = null;

    function tick() {
      var diff = targetDate - new Date();

      if (diff <= 0) {
        stop();
        views.forEach(function (v) {
          v.el.hidden = true;
          v.el.innerHTML = "";
        });
        return;
      }

      var total = Math.floor(diff / 1000);
      var d = pad(Math.floor(total / 86400));
      var h = pad(Math.floor((total % 86400) / 3600));
      var m = pad(Math.floor((total % 3600) / 60));
      var s = pad(total % 60);

      views.forEach(function (v) {
        v.d.textContent = d;
        v.h.textContent = h;
        v.m.textContent = m;
        v.s.textContent = s;
      });
    }

    function start() {
      if (timer === null) timer = setInterval(tick, 1000);
    }

    function stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    // Com a aba em segundo plano o relógio não precisa correr: ao voltar,
    // um tick imediato recalcula a partir do horário real, sem acumular erro.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    });

    tick();
    views.forEach(function (v) { v.el.hidden = false; });
    start();
  }

  // Carregado com defer, então o parse já terminou. O guard cobre o caso
  // de alguém incluir o arquivo de outro jeito.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
