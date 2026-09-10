// GET /api/admin/exportar?tipo=indicadores|compras — baixa a base em CSV.

import { banco, listarIndicadoresComPremio } from '../../_lib/dados.js';
import { gerarCSV } from '../../_lib/csv.js';
import { dentroDoTeto, montarFilaVip, montarRanking } from '../../_lib/reconciliacao.js';
import { META_COMPRAS } from '../../_lib/config.js';

function csv(nome, conteudo) {
  return new Response(conteudo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const db = banco(env);
  const tipo = new URL(request.url).searchParams.get('tipo') || 'indicadores';
  const hoje = new Date().toISOString().slice(0, 10);

  if (tipo === 'compras') {
    const { results } = await db
      .prepare(
        `SELECT c.id_compra, c.numero_pedido, c.comprador_nome, c.comprador_email,
                c.cupom_email, i.codigo_publico, c.tipo_ingresso, c.valor,
                c.estado_pagamento, c.data_compra, c.ausente
           FROM compras c
           LEFT JOIN indicadores i ON i.email = c.cupom_email
          ORDER BY c.data_compra, c.id_compra`
      )
      .all();

    const linhas = (results || []).map((c) => [
      c.id_compra,
      c.numero_pedido,
      c.comprador_nome,
      c.comprador_email,
      c.cupom_email,
      c.codigo_publico || '(cupom sem indicador)',
      c.tipo_ingresso,
      String(Number(c.valor) || 0).replace('.', ','),
      c.estado_pagamento,
      c.data_compra || '',
      Number(c.ausente) === 1 ? 'sim' : 'não',
    ]);

    return csv(
      `pcamp26-indicacao-compras-${hoje}.csv`,
      gerarCSV(
        [
          'Nº ingresso',
          'Nº pedido',
          'Comprador',
          'E-mail do comprador',
          'Cupom (e-mail do indicador)',
          'Código do indicador',
          'Tipo de ingresso',
          'Valor',
          'Estado de pagamento',
          'Data da compra',
          'Ausente da última planilha',
        ],
        linhas
      )
    );
  }

  const indicadores = await listarIndicadoresComPremio(db);
  const fila = montarFilaVip(indicadores);
  const linhas = montarRanking(indicadores).map((i) => {
    const compras = Number(i.compras_confirmadas) || 0;
    const posicaoFila = fila.get(i.email) || null;
    return [
      i.posicao,
      i.codigo_publico,
      i.primeiro_nome,
      i.nome_completo || '',
      i.email,
      compras,
      String(Number(i.receita) || 0).replace('.', ','),
      compras >= META_COMPRAS ? 'sim' : 'não',
      i.qualificou_em || '',
      posicaoFila || '',
      posicaoFila ? (dentroDoTeto(posicaoFila) ? 'sim' : 'não') : '',
      Number(i.vip_liberado) === 1 ? 'sim' : 'não',
      i.liberado_por || '',
      i.liberado_em || '',
      Number(i.ativo) === 1 ? 'sim' : 'não',
    ];
  });

  return csv(
    `pcamp26-indicacao-indicadores-${hoje}.csv`,
    gerarCSV(
      [
        'Posição no ranking',
        'Código público',
        'Primeiro nome',
        'Nome completo',
        'Cupom (e-mail)',
        'Compras confirmadas',
        'Receita gerada',
        'Qualificou',
        'Qualificou em',
        'Posição na fila do VIP',
        'Dentro dos 50 primeiros',
        'VIP liberado',
        'Liberado por',
        'Liberado em',
        'Ativo',
      ],
      linhas
    )
  );
}
