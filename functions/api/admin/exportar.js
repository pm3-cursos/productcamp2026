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

const decimal = (n) => String(Number(n) || 0).replace('.', ',');

export async function onRequestGet({ request, env }) {
  const db = banco(env);
  const tipo = new URL(request.url).searchParams.get('tipo') || 'indicadores';
  const hoje = new Date().toISOString().slice(0, 10);

  if (tipo === 'compras') {
    const { results } = await db
      .prepare(
        `SELECT c.linha, c.comprador_nome, c.comprador_email, c.cupom, c.cupom_email,
                i.primeiro_nome AS indicador, c.lote, c.modalidade, c.categoria, c.formato,
                c.quantidade, c.valor_unitario, c.valor, c.data_compra, c.conta, c.motivo
           FROM compras c
           LEFT JOIN indicadores i ON i.email = c.cupom_email
          ORDER BY c.data_compra, c.linha`
      )
      .all();

    const linhas = (results || []).map((c) => [
      c.linha,
      c.data_compra || '',
      c.comprador_nome,
      c.comprador_email,
      c.cupom || '',
      c.indicador || (c.cupom_email ? '(cupom sem indicador)' : ''),
      c.lote,
      c.modalidade,
      c.categoria,
      c.formato,
      c.quantidade,
      decimal(c.valor_unitario),
      decimal(c.valor),
      Number(c.conta) === 1 ? 'sim' : c.motivo || 'não',
    ]);

    return csv(
      `pcamp26-indicacao-compras-${hoje}.csv`,
      gerarCSV(
        [
          'Linha na planilha',
          'Data do pedido',
          'Comprador',
          'E-mail do comprador',
          'Cupom',
          'Indicador',
          'Lote',
          'Modalidade',
          'Categoria',
          'Formato',
          'Número de ingressos',
          'Valor por ingresso',
          'Valor total do pedido',
          'Conta para a indicação',
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
      i.primeiro_nome,
      i.nome_completo || '',
      i.email,
      compras,
      decimal(i.receita),
      compras >= META_COMPRAS ? 'sim' : 'não',
      i.qualificou_em || '',
      posicaoFila || '',
      posicaoFila ? (dentroDoTeto(posicaoFila) ? 'sim' : 'não') : '',
      Number(i.vip_liberado) === 1 ? 'sim' : 'não',
      i.liberado_por || '',
      i.liberado_em || '',
    ];
  });

  return csv(
    `pcamp26-indicacao-indicadores-${hoje}.csv`,
    gerarCSV(
      [
        'Posição no ranking',
        'Nome',
        'Nome completo',
        'Cupom (e-mail)',
        'Ingressos indicados',
        'Receita gerada',
        'Qualificou',
        'Qualificou em',
        'Posição na fila do VIP',
        'Dentro dos 50 primeiros',
        'VIP liberado',
        'Liberado por',
        'Liberado em',
      ],
      linhas
    )
  );
}
