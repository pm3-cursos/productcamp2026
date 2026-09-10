// POST /api/admin/importar (multipart/form-data)
//   arquivo: o export da Sympla (.csv ou .xlsx)
//   tipo:    'compras' (padrão) | 'indicadores'
//   acao:    'prever' (só simula e devolve a conciliação) | 'aplicar' (grava)
//
// A planilha é sempre a foto completa da base: a plataforma reconcilia por
// "Nº ingresso", então subir o mesmo arquivo de novo atualiza em vez de
// duplicar. Nenhuma marcação manual de VIP é tocada aqui — e o resumo prova
// isso comparando o estado antes e depois da gravação.

import { erro, json } from '../../_lib/resposta.js';
import { mesmaOrigem } from '../../_lib/requisicao.js';
import { lerArquivoDePlanilha } from '../../_lib/arquivo.js';
import { lerCompras, lerIndicadores } from '../../_lib/planilha.js';
import { calcularContagens, resolverQualificacao } from '../../_lib/reconciliacao.js';
import { agoraISO, nomeAbreviado } from '../../_lib/util.js';
import { META_COMPRAS } from '../../_lib/config.js';
import {
  banco,
  criarImport,
  fecharImport,
  idsDeComprasExistentes,
  listarComprasParaContagem,
  listarIndicadores,
  listarPremios,
  marcarAusentes,
  salvarCompras,
  salvarContagens,
  salvarIndicadores,
} from '../../_lib/dados.js';

const LIMITE_PREVIA = 12;

/** Junta o que já está no banco com o que veio na planilha, sem gravar. */
function projetarCompras(existentes, planilha) {
  const mapa = new Map();
  for (const compra of existentes) {
    // Tudo que não vier nesta planilha passa a ser considerado ausente.
    mapa.set(compra.id_compra, { ...compra, ausente: 1 });
  }
  for (const compra of planilha) {
    mapa.set(compra.id_compra, { ...compra, ausente: 0 });
  }
  return [...mapa.values()];
}

/** Recalcula contagens a partir do banco e grava (preservando vip_liberado). */
async function recalcular(db) {
  const [compras, indicadores, premiosAntes] = await Promise.all([
    listarComprasParaContagem(db),
    listarIndicadores(db),
    listarPremios(db),
  ]);

  const { porIndicador, cuponsOrfaos, diagnostico } = calcularContagens({
    compras,
    indicadores,
  });
  const antes = new Map(premiosAntes.map((p) => [p.email, p]));
  const agora = agoraISO();

  const registros = [];
  let qualificadosAgora = 0;

  for (const registro of porIndicador.values()) {
    const anterior = antes.get(registro.email);
    const { qualificou_em, qualificouAgora } = resolverQualificacao(
      anterior ? anterior.qualificou_em : null,
      registro.total,
      agora
    );
    if (qualificouAgora) qualificadosAgora++;
    registros.push({
      email: registro.email,
      compras_confirmadas: registro.total,
      receita: Math.round(registro.receita * 100) / 100,
      qualificou_em,
    });
  }

  await salvarContagens(db, registros);

  // Confere que nenhuma marcação manual de VIP mudou durante o import.
  const premiosDepois = await listarPremios(db);
  const depois = new Map(premiosDepois.map((p) => [p.email, p]));
  let vipAlterados = 0;
  for (const [email, anterior] of antes) {
    const atual = depois.get(email);
    if (!atual || Number(atual.vip_liberado) !== Number(anterior.vip_liberado)) {
      vipAlterados++;
    }
  }

  return { porIndicador, cuponsOrfaos, diagnostico, qualificadosAgora, vipAlterados };
}

export async function onRequestPost({ request, env, data }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }

  let formulario;
  try {
    formulario = await request.formData();
  } catch {
    return erro('formulario_invalido', 'Envie o arquivo como multipart/form-data.', 400);
  }

  const arquivo = formulario.get('arquivo');
  const tipo = formulario.get('tipo') === 'indicadores' ? 'indicadores' : 'compras';
  const aplicar = formulario.get('acao') === 'aplicar';

  let linhas;
  let formato;
  try {
    const lido = await lerArquivoDePlanilha(arquivo);
    linhas = lido.linhas;
    formato = lido.formato;
  } catch (e) {
    return erro('arquivo_invalido', e.message, 422);
  }
  if (!linhas || linhas.length < 2) {
    return erro(
      'arquivo_vazio',
      'A planilha não tem linhas de dados além do cabeçalho.',
      422
    );
  }

  const db = banco(env);
  const nomeArquivo = String((arquivo && arquivo.name) || 'planilha');

  // ------------------------------------------------------- lista de cupons
  if (tipo === 'indicadores') {
    const lidos = lerIndicadores(linhas);
    if (lidos.faltando && lidos.faltando.length) {
      return erro(
        'colunas_faltando',
        `Não encontrei a coluna ${lidos.faltando.join(', ')} na planilha.`,
        422
      );
    }
    if (lidos.indicadores.length === 0) {
      return erro('nenhum_indicador', 'Nenhum indicador válido na planilha.', 422);
    }

    const existentes = new Set((await listarIndicadores(db)).map((i) => i.email));
    const novos = lidos.indicadores.filter((i) => !existentes.has(i.email));

    const resumo = {
      tipo: 'indicadores',
      formato,
      arquivo: nomeArquivo,
      linhas_lidas: lidos.linhasLidas,
      indicadores_na_planilha: lidos.indicadores.length,
      novos: novos.length,
      atualizados: lidos.indicadores.length - novos.length,
      excluidos_vip: lidos.excluidosVip || 0,
      previa: novos.slice(0, LIMITE_PREVIA).map((i) => ({
        email: i.email,
        codigo_publico: i.codigo_publico,
        primeiro_nome: i.primeiro_nome,
      })),
    };

    if (!aplicar) return json({ ok: true, aplicado: false, resumo });

    const importId = await criarImport(db, {
      tipo: 'indicadores',
      arquivo: nomeArquivo,
      adminEmail: data.admin,
    });
    await salvarIndicadores(db, lidos.indicadores);

    // Novos indicadores podem casar com cupons que antes eram órfãos.
    const recalculo = await recalcular(db);
    resumo.qualificados_agora = recalculo.qualificadosAgora;
    resumo.cupons_orfaos = recalculo.diagnostico.cuponsOrfaosDistintos;
    resumo.vip_alterados = recalculo.vipAlterados;

    await fecharImport(db, importId, {
      linhas_lidas: resumo.linhas_lidas,
      novas: resumo.novos,
      atualizadas: resumo.atualizados,
      qualificados_agora: resumo.qualificados_agora,
      cupons_orfaos: resumo.cupons_orfaos,
      ...resumo,
    });

    return json({ ok: true, aplicado: true, import_id: importId, resumo });
  }

  // ------------------------------------------------------------- compras
  const lido = lerCompras(linhas);
  if (lido.faltando.length) {
    return erro(
      'colunas_faltando',
      `Não encontrei a coluna ${lido.faltando.join(', ')} na planilha. Use o relatório de participantes da Sympla sem renomear colunas.`,
      422
    );
  }

  const [idsExistentes, indicadores, premiosAntes] = await Promise.all([
    idsDeComprasExistentes(db),
    listarIndicadores(db),
    listarPremios(db),
  ]);

  const novas = lido.compras.filter((c) => !idsExistentes.has(c.id_compra));
  const aprovadas = lido.compras.filter((c) => c.aprovado === 1).length;

  const antes = new Map(premiosAntes.map((p) => [p.email, p]));
  const nomePorEmail = new Map(indicadores.map((i) => [i.email, i.primeiro_nome]));

  const resumo = {
    tipo: 'compras',
    formato,
    arquivo: nomeArquivo,
    linhas_lidas: lido.linhasLidas,
    compras_na_planilha: lido.compras.length,
    aprovadas,
    novas: novas.length,
    atualizadas: lido.compras.length - novas.length,
    sem_identificador: lido.semIdentificador || 0,
    duplicadas_no_arquivo: lido.duplicadasNoArquivo || 0,
  };

  // --------------------------------------------------- prévia (não grava)
  if (!aplicar) {
    const existentes = await listarComprasParaContagem(db);
    const projetadas = projetarCompras(existentes, lido.compras);
    const { porIndicador, cuponsOrfaos, diagnostico } = calcularContagens({
      compras: projetadas,
      indicadores,
    });

    let qualificadosAgora = 0;
    for (const registro of porIndicador.values()) {
      const anterior = antes.get(registro.email);
      if (!anterior || !anterior.qualificou_em) {
        if (registro.total >= META_COMPRAS) qualificadosAgora++;
      }
    }

    const idsPlanilha = new Set(lido.compras.map((c) => c.id_compra));
    resumo.ausentes = existentes.filter(
      (c) => Number(c.aprovado) === 1 && Number(c.ausente) === 0 && !idsPlanilha.has(c.id_compra)
    ).length;
    resumo.qualificados_agora = qualificadosAgora;
    resumo.autoindicacoes = diagnostico.autoindicacoes;
    resumo.sem_cupom = diagnostico.semCupom;
    resumo.cupons_orfaos = diagnostico.cuponsOrfaosDistintos;
    resumo.linhas_com_cupom_orfao = diagnostico.linhasComCupomOrfao;
    resumo.vip_alterados = 0;
    resumo.cupons_orfaos_lista = [...cuponsOrfaos.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LIMITE_PREVIA)
      .map(([cupom, linhasDoCupom]) => ({ cupom, linhas: linhasDoCupom }));
    resumo.previa = novas
      .filter((c) => c.aprovado === 1 && c.cupom_email)
      .slice(0, LIMITE_PREVIA)
      .map((c) => ({
        comprador: nomeAbreviado(c.comprador_nome) || c.comprador_email,
        cupom: c.cupom_email,
        indicador: nomePorEmail.get(c.cupom_email) || null,
        valor: c.valor,
      }));

    return json({ ok: true, aplicado: false, resumo });
  }

  // -------------------------------------------------------------- gravação
  const importId = await criarImport(db, {
    tipo: 'compras',
    arquivo: nomeArquivo,
    adminEmail: data.admin,
  });

  await salvarCompras(db, lido.compras, importId);
  resumo.ausentes = await marcarAusentes(db, importId);

  const recalculo = await recalcular(db);
  resumo.qualificados_agora = recalculo.qualificadosAgora;
  resumo.autoindicacoes = recalculo.diagnostico.autoindicacoes;
  resumo.sem_cupom = recalculo.diagnostico.semCupom;
  resumo.cupons_orfaos = recalculo.diagnostico.cuponsOrfaosDistintos;
  resumo.linhas_com_cupom_orfao = recalculo.diagnostico.linhasComCupomOrfao;
  resumo.vip_alterados = recalculo.vipAlterados;
  resumo.cupons_orfaos_lista = [...recalculo.cuponsOrfaos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITE_PREVIA)
    .map(([cupom, linhasDoCupom]) => ({ cupom, linhas: linhasDoCupom }));
  resumo.previa = novas
    .filter((c) => c.aprovado === 1 && c.cupom_email)
    .slice(0, LIMITE_PREVIA)
    .map((c) => ({
      comprador: nomeAbreviado(c.comprador_nome) || c.comprador_email,
      cupom: c.cupom_email,
      indicador: nomePorEmail.get(c.cupom_email) || null,
      valor: c.valor,
    }));

  await fecharImport(db, importId, resumo);

  return json({ ok: true, aplicado: true, import_id: importId, resumo });
}
