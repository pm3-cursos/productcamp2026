// POST /api/admin/vip  { email, liberado, confirmar_acima_do_teto? }
// A liberação do VIP é uma decisão manual do time — a plataforma registra
// quem liberou e quando, avisa quando o teto de 50 já foi atingido e manda
// o aviso ao n8n para a cortesia entrar na planilha de pedidos.

import { erro, json } from '../../_lib/resposta.js';
import { corpoJson, mesmaOrigem } from '../../_lib/requisicao.js';
import {
  banco,
  buscarIndicador,
  definirVip,
  listarIndicadoresComPremio,
} from '../../_lib/dados.js';
import { dentroDoTeto, montarFilaVip } from '../../_lib/reconciliacao.js';
import { META_COMPRAS, TETO_VIP } from '../../_lib/config.js';
import { normalizarEmail } from '../../_lib/util.js';
import { avisarVipLiberado, montarAvisoVip } from '../../_lib/webhook.js';

export async function onRequestPost({ request, env, data }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }

  const corpo = await corpoJson(request);
  const email = normalizarEmail(corpo.email);
  const liberado = corpo.liberado === true || corpo.liberado === 1;
  if (!email) return erro('email_invalido', 'Informe o e-mail do indicador.', 400);

  const db = banco(env);
  const indicador = await buscarIndicador(db, email);
  if (!indicador) return erro('nao_encontrado', 'Indicador não encontrado.', 404);

  const confirmadas = Number(indicador.compras_confirmadas) || 0;
  if (liberado && confirmadas < META_COMPRAS) {
    return erro(
      'nao_qualificado',
      `Este indicador tem ${confirmadas} ingresso(s) indicado(s). O VIP só pode ser liberado a partir de ${META_COMPRAS}.`,
      409
    );
  }

  const todos = await listarIndicadoresComPremio(db);
  const jaLiberados = todos.filter(
    (i) => Number(i.vip_liberado) === 1 && i.email !== email
  ).length;
  const posicaoFila = montarFilaVip(todos).get(email) || null;
  const acimaDoTeto = liberado && (jaLiberados >= TETO_VIP || !dentroDoTeto(posicaoFila));

  if (acimaDoTeto && corpo.confirmar_acima_do_teto !== true) {
    return json(
      {
        erro: 'acima_do_teto',
        confirmacao_necessaria: true,
        mensagem:
          posicaoFila && posicaoFila > TETO_VIP
            ? `Este indicador é o ${posicaoFila}º a bater a meta, fora dos ${TETO_VIP} primeiros. Confirmar a liberação mesmo assim?`
            : `Os ${TETO_VIP} upgrades do prêmio já foram liberados. Confirmar a liberação mesmo assim?`,
        vip_liberados: jaLiberados,
        posicao_fila_vip: posicaoFila,
        teto_vip: TETO_VIP,
      },
      409
    );
  }

  // Só a liberação avisa o n8n. Desfazer é raro e fica só no log.
  let webhook = null;
  if (liberado) {
    webhook = await avisarVipLiberado(
      env,
      montarAvisoVip({ nome: indicador.nome_completo || indicador.primeiro_nome, email })
    );
  }

  await definirVip(db, {
    email,
    liberado,
    adminEmail: data.admin,
    webhook: webhook ? `${webhook.status}: ${webhook.detalhe}` : null,
  });

  return json({
    ok: true,
    email,
    vip_liberado: liberado,
    liberado_por: liberado ? data.admin : null,
    vip_liberados: jaLiberados + (liberado ? 1 : 0),
    vagas_restantes: Math.max(0, TETO_VIP - (jaLiberados + (liberado ? 1 : 0))),
    webhook,
  });
}
