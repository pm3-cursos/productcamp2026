// GET /api/me — tudo o que a página do indicador precisa.
// Devolve apenas os dados da própria pessoa. O ranking sai sem e-mail de
// ninguém: só primeiro nome e código público, como manda a regra.

import { erro, json } from '../_lib/resposta.js';
import { lerSessao } from '../_lib/session.js';
import {
  banco,
  buscarIndicador,
  listarComprasDoIndicador,
  listarIndicadoresComPremio,
} from '../_lib/dados.js';
import { montarFilaVip, montarRanking, dentroDoTeto } from '../_lib/reconciliacao.js';
import { META_COMPRAS, TETO_VIP, urlWhatsApp } from '../_lib/config.js';
import { nomeAbreviado, iniciais } from '../_lib/util.js';

const LIDERES_NO_RANKING = 3;

export async function onRequestGet({ request, env }) {
  const sessao = await lerSessao(request, env);
  if (!sessao) return erro('nao_autenticado', 'Faça login para ver sua página.', 401);
  if (sessao.papel !== 'indicador') {
    return erro('papel_invalido', 'Esta página é da visão do indicador.', 403);
  }

  const db = banco(env);
  const indicador = await buscarIndicador(db, sessao.email);
  if (!indicador || Number(indicador.ativo) === 0) {
    return erro('nao_liberado', 'Acesso não liberado para este e-mail.', 403);
  }

  const [{ results: comprasDoCupom }, todos] = await Promise.all([
    listarComprasDoIndicador(db, sessao.email),
    listarIndicadoresComPremio(db),
  ]);

  // Só entram na lista as compras que contam: aprovadas, presentes na última
  // planilha e de outra pessoa (a própria compra do indicador não conta).
  const indicacoes = (comprasDoCupom || [])
    .filter(
      (c) =>
        Number(c.aprovado) === 1 &&
        Number(c.ausente) === 0 &&
        c.comprador_email !== sessao.email
    )
    .map((c) => ({
      nome: nomeAbreviado(c.comprador_nome) || 'Convidado',
      iniciais: iniciais(c.comprador_nome) || '?',
      data: c.data_compra || null,
    }));

  const ativos = (todos || []).filter((i) => Number(i.ativo) !== 0);
  const ranking = montarRanking(ativos);
  const fila = montarFilaVip(ativos);

  const eu = ranking.find((r) => r.email === sessao.email) || {
    compras_confirmadas: 0,
    posicao: null,
  };
  const confirmadas = Number(eu.compras_confirmadas) || 0;

  const lideres = ranking
    .filter((r) => (r.compras_confirmadas || 0) > 0)
    .slice(0, LIDERES_NO_RANKING)
    .map((r) => ({
      posicao: r.posicao,
      primeiro_nome: r.primeiro_nome,
      codigo_publico: r.codigo_publico,
      compras: r.compras_confirmadas || 0,
      sou_eu: r.email === sessao.email,
    }));

  const posicaoFila = fila.get(sessao.email) || null;
  const liberadosAteAgora = ativos.filter((i) => Number(i.vip_liberado) === 1).length;

  return json({
    email: sessao.email,
    cupom: sessao.email,
    primeiro_nome: indicador.primeiro_nome,
    codigo_publico: indicador.codigo_publico,
    iniciais: iniciais(indicador.nome_completo || indicador.primeiro_nome),
    meta: META_COMPRAS,
    compras_confirmadas: confirmadas,
    faltam: Math.max(0, META_COMPRAS - confirmadas),
    qualificado: confirmadas >= META_COMPRAS,
    vip_liberado: Number(indicador.vip_liberado) === 1,
    posicao: confirmadas > 0 ? eu.posicao : null,
    posicao_fila_vip: posicaoFila,
    dentro_do_teto: dentroDoTeto(posicaoFila),
    teto_vip: TETO_VIP,
    vagas_restantes: Math.max(0, TETO_VIP - liberadosAteAgora),
    whatsapp: urlWhatsApp(sessao.email),
    indicacoes,
    ranking: {
      lideres,
      eu: {
        posicao: confirmadas > 0 ? eu.posicao : null,
        primeiro_nome: indicador.primeiro_nome,
        codigo_publico: indicador.codigo_publico,
        compras: confirmadas,
      },
    },
  });
}
