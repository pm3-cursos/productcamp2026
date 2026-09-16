// GET /api/admin/painel — KPIs e tabela de indicadores.
// Aceita ?q= (busca por nome ou e-mail) e ?filtro=qualificados|progresso|vip.

import { json } from '../../_lib/resposta.js';
import {
  banco,
  listarIndicadoresComPremio,
  ultimaSincronizacao,
  ultimoDisparo,
} from '../../_lib/dados.js';
import { dentroDoTeto, montarFilaVip, montarRanking } from '../../_lib/reconciliacao.js';
import { INTERVALO_SYNC_MIN, META_COMPRAS, TETO_VIP } from '../../_lib/config.js';
import { chaveTexto } from '../../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const db = banco(env);
  const url = new URL(request.url);
  const busca = chaveTexto(url.searchParams.get('q') || '');
  const filtro = url.searchParams.get('filtro') || 'todos';

  const [indicadores, sincronizacao, disparo] = await Promise.all([
    listarIndicadoresComPremio(db),
    ultimaSincronizacao(db),
    ultimoDisparo(db),
  ]);

  const ranking = montarRanking(indicadores);
  const fila = montarFilaVip(indicadores);

  const linhas = ranking.map((i) => {
    const compras = Number(i.compras_confirmadas) || 0;
    const posicaoFila = fila.get(i.email) || null;
    return {
      email: i.email,
      primeiro_nome: i.primeiro_nome,
      nome_completo: i.nome_completo || i.primeiro_nome,
      ativo: Number(i.ativo) === 1,
      compras,
      receita: Number(i.receita) || 0,
      qualificado: compras >= META_COMPRAS,
      faltam: Math.max(0, META_COMPRAS - compras),
      qualificou_em: i.qualificou_em || null,
      posicao: i.posicao,
      posicao_fila_vip: posicaoFila,
      dentro_do_teto: dentroDoTeto(posicaoFila),
      vip_liberado: Number(i.vip_liberado) === 1,
      liberado_por: i.liberado_por || null,
      liberado_em: i.liberado_em || null,
    };
  });

  const kpis = {
    indicadores_cadastrados: linhas.length,
    indicadores_ativos: linhas.filter((l) => l.compras > 0).length,
    compras_confirmadas: linhas.reduce((total, l) => total + l.compras, 0),
    receita: linhas.reduce((total, l) => total + l.receita, 0),
    qualificados: linhas.filter((l) => l.qualificado).length,
    vip_liberados: linhas.filter((l) => l.vip_liberado).length,
    teto_vip: TETO_VIP,
    meta: META_COMPRAS,
  };
  kpis.vagas_restantes = Math.max(0, TETO_VIP - kpis.vip_liberados);

  const filtradas = linhas.filter((l) => {
    if (filtro === 'qualificados' && !l.qualificado) return false;
    if (filtro === 'progresso' && (l.qualificado || l.compras === 0)) return false;
    if (filtro === 'vip' && !l.vip_liberado) return false;
    if (!busca) return true;
    return chaveTexto(l.nome_completo).includes(busca) || chaveTexto(l.email).includes(busca);
  });

  // O disparo manual fica "em andamento" enquanto a sincronização que ele
  // pediu ainda não chegou (ou até o intervalo mínimo vencer).
  const disparoPendente =
    disparo &&
    (!sincronizacao || sincronizacao.criado_em < disparo.criado_em) &&
    Date.now() - Date.parse(disparo.criado_em) < INTERVALO_SYNC_MIN * 60 * 1000;

  return json({
    kpis,
    indicadores: filtradas,
    total: linhas.length,
    ultima_sincronizacao: sincronizacao
      ? { ...sincronizacao, resumo: sincronizacao.resumo ? JSON.parse(sincronizacao.resumo) : null }
      : null,
    disparo_pendente: Boolean(disparoPendente),
    ultimo_disparo: disparo || null,
    intervalo_sync_min: INTERVALO_SYNC_MIN,
    sync_configurado: Boolean(env.GITHUB_SYNC_TOKEN),
  });
}
