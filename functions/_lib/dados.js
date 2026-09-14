// Acesso ao D1. Concentra as consultas para que os endpoints fiquem finos e a
// regra de negócio continue no módulo de reconciliação (implementação única).

import { agoraISO } from './util.js';

const PAGINA = 2000;

/** Devolve o binding do D1 ou explica o que falta configurar. */
export function banco(env) {
  if (!env || !env.DB) {
    throw new Error(
      'Binding D1 "DB" não encontrado. Configure o banco no projeto do Cloudflare Pages (ver indicacao/LEIA-ME.md).'
    );
  }
  return env.DB;
}

/** Executa um `batch` em blocos, para não estourar limite de statements. */
async function emBlocos(db, statements, tamanho = 100) {
  for (let i = 0; i < statements.length; i += tamanho) {
    await db.batch(statements.slice(i, i + tamanho));
  }
}

/** Lê uma tabela inteira paginando, para não depender do tamanho do resultado. */
async function lerTudo(db, sql, ordem) {
  const linhas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { results } = await db
      .prepare(`${sql} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
      .bind(PAGINA, offset)
      .all();
    if (!results || results.length === 0) break;
    linhas.push(...results);
    if (results.length < PAGINA) break;
  }
  return linhas;
}

// ---------------------------------------------------------------- indicadores

export async function buscarIndicador(db, email) {
  return db
    .prepare(
      `SELECT i.email, i.codigo_publico, i.primeiro_nome, i.nome_completo, i.ativo,
              COALESCE(p.compras_confirmadas, 0) AS compras_confirmadas,
              COALESCE(p.receita, 0) AS receita,
              p.qualificou_em,
              COALESCE(p.vip_liberado, 0) AS vip_liberado
         FROM indicadores i
         LEFT JOIN premios p ON p.email = i.email
        WHERE i.email = ?`
    )
    .bind(email)
    .first();
}

export function listarIndicadores(db) {
  return lerTudo(
    db,
    'SELECT email, codigo_publico, primeiro_nome, nome_completo, ativo FROM indicadores',
    'email'
  );
}

/** Indicadores + status de prêmio, para o painel e o ranking. */
export function listarIndicadoresComPremio(db) {
  return lerTudo(
    db,
    `SELECT i.email, i.codigo_publico, i.primeiro_nome, i.nome_completo, i.ativo,
            COALESCE(p.compras_confirmadas, 0) AS compras_confirmadas,
            COALESCE(p.receita, 0) AS receita,
            p.qualificou_em,
            COALESCE(p.vip_liberado, 0) AS vip_liberado,
            p.liberado_por, p.liberado_em
       FROM indicadores i
       LEFT JOIN premios p ON p.email = i.email`,
    'i.email'
  );
}

export async function salvarIndicadores(db, indicadores) {
  const agora = agoraISO();
  const statements = indicadores.map((i) =>
    db
      .prepare(
        `INSERT INTO indicadores (email, codigo_publico, primeiro_nome, nome_completo, ativo, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           codigo_publico = excluded.codigo_publico,
           primeiro_nome  = excluded.primeiro_nome,
           nome_completo  = excluded.nome_completo,
           ativo          = excluded.ativo,
           atualizado_em  = excluded.atualizado_em`
      )
      .bind(
        i.email,
        i.codigo_publico || i.email,
        i.primeiro_nome || '',
        i.nome_completo || '',
        Number(i.ativo) === 0 ? 0 : 1,
        agora,
        agora
      )
  );
  await emBlocos(db, statements);
}

// ---------------------------------------------------------------- compras

/** Campos mínimos para a contagem — mantém o payload pequeno. */
export function listarComprasParaContagem(db) {
  return lerTudo(
    db,
    `SELECT id_compra, cupom_email, comprador_email, valor, aprovado, ausente, data_compra
       FROM compras`,
    'id_compra'
  );
}

export function listarComprasDoIndicador(db, cupomEmail) {
  return db
    .prepare(
      `SELECT id_compra, numero_pedido, comprador_nome, comprador_email, tipo_ingresso,
              valor, estado_pagamento, aprovado, ausente, data_compra
         FROM compras
        WHERE cupom_email = ?
        ORDER BY data_compra, id_compra`
    )
    .bind(cupomEmail)
    .all();
}

export async function idsDeComprasExistentes(db) {
  const linhas = await lerTudo(db, 'SELECT id_compra FROM compras', 'id_compra');
  return new Set(linhas.map((l) => l.id_compra));
}

export async function salvarCompras(db, compras, importId) {
  const agora = agoraISO();
  const statements = compras.map((c) =>
    db
      .prepare(
        `INSERT INTO compras (id_compra, numero_pedido, comprador_nome, comprador_email,
                              cupom_email, tipo_ingresso, valor, estado_pagamento, aprovado,
                              data_compra, ausente, primeiro_import_id, ultimo_import_id,
                              criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(id_compra) DO UPDATE SET
           numero_pedido    = excluded.numero_pedido,
           comprador_nome   = excluded.comprador_nome,
           comprador_email  = excluded.comprador_email,
           cupom_email      = excluded.cupom_email,
           tipo_ingresso    = excluded.tipo_ingresso,
           valor            = excluded.valor,
           estado_pagamento = excluded.estado_pagamento,
           aprovado         = excluded.aprovado,
           data_compra      = excluded.data_compra,
           ausente          = 0,
           ultimo_import_id = excluded.ultimo_import_id,
           atualizado_em    = excluded.atualizado_em`
      )
      .bind(
        c.id_compra,
        c.numero_pedido || '',
        c.comprador_nome || '',
        c.comprador_email || '',
        c.cupom_email || '',
        c.tipo_ingresso || '',
        Number(c.valor) || 0,
        c.estado_pagamento || '',
        c.aprovado ? 1 : 0,
        c.data_compra || null,
        importId,
        importId,
        agora,
        agora
      )
  );
  await emBlocos(db, statements);
}

/**
 * A planilha é sempre a foto completa da base: o que não veio neste import
 * é marcado como ausente e deixa de contar (reembolso, cancelamento).
 * Devolve quantas compras aprovadas saíram da foto.
 */
export async function marcarAusentes(db, importId) {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM compras
        WHERE ultimo_import_id IS NOT ? AND aprovado = 1 AND ausente = 0`
    )
    .bind(importId)
    .all();
  const total = results && results[0] ? results[0].total : 0;
  await db
    .prepare('UPDATE compras SET ausente = 1 WHERE ultimo_import_id IS NOT ?')
    .bind(importId)
    .run();
  return total;
}

// ---------------------------------------------------------------- prêmios

export function listarPremios(db) {
  return lerTudo(
    db,
    `SELECT email, compras_confirmadas, receita, qualificou_em, vip_liberado,
            liberado_por, liberado_em
       FROM premios`,
    'email'
  );
}

/**
 * Grava contagem, receita e qualificação. Não menciona `vip_liberado`,
 * `liberado_por` nem `liberado_em`: a marcação manual do time é intocável.
 */
export async function salvarContagens(db, registros) {
  const statements = registros.map((r) =>
    db
      .prepare(
        `INSERT INTO premios (email, compras_confirmadas, receita, qualificou_em)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           compras_confirmadas = excluded.compras_confirmadas,
           receita             = excluded.receita,
           qualificou_em       = COALESCE(premios.qualificou_em, excluded.qualificou_em)`
      )
      .bind(r.email, r.compras_confirmadas, r.receita, r.qualificou_em)
  );
  await emBlocos(db, statements);
}

export async function definirVip(db, { email, liberado, adminEmail }) {
  const agora = agoraISO();
  await db.batch([
    db
      .prepare(
        `INSERT INTO premios (email, vip_liberado, liberado_por, liberado_em)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           vip_liberado = excluded.vip_liberado,
           liberado_por = excluded.liberado_por,
           liberado_em  = excluded.liberado_em`
      )
      .bind(email, liberado ? 1 : 0, liberado ? adminEmail : null, liberado ? agora : null),
    db
      .prepare('INSERT INTO vip_log (email, liberado, admin_email, criado_em) VALUES (?, ?, ?, ?)')
      .bind(email, liberado ? 1 : 0, adminEmail, agora),
  ]);
}

// ---------------------------------------------------------------- importações

export async function criarImport(db, { tipo, arquivo, adminEmail }) {
  const { results } = await db
    .prepare(
      `INSERT INTO imports (tipo, arquivo, admin_email, criado_em)
       VALUES (?, ?, ?, ?) RETURNING id`
    )
    .bind(tipo, arquivo || '', adminEmail, agoraISO())
    .all();
  return results[0].id;
}

export async function fecharImport(db, id, resumo) {
  await db
    .prepare(
      `UPDATE imports SET linhas_lidas = ?, aprovadas = ?, novas = ?, atualizadas = ?,
              qualificados_agora = ?, cupons_orfaos = ?, autoindicacoes = ?, ausentes = ?,
              vip_alterados = 0, resumo = ?
        WHERE id = ?`
    )
    .bind(
      resumo.linhas_lidas || 0,
      resumo.aprovadas || 0,
      resumo.novas || 0,
      resumo.atualizadas || 0,
      resumo.qualificados_agora || 0,
      resumo.cupons_orfaos || 0,
      resumo.autoindicacoes || 0,
      resumo.ausentes || 0,
      JSON.stringify(resumo),
      id
    )
    .run();
}

export function ultimoImport(db, tipo) {
  return db
    .prepare(
      `SELECT id, tipo, arquivo, admin_email, criado_em, linhas_lidas, novas
         FROM imports WHERE tipo = ? AND resumo IS NOT NULL
        ORDER BY id DESC LIMIT 1`
    )
    .bind(tipo)
    .first();
}

// ---------------------------------------------------------------- links mágicos

export async function guardarLinkMagico(db, { tokenHash, email, papel, expiraEm, ip }) {
  await db
    .prepare(
      `INSERT INTO magic_links (token_hash, email, papel, criado_em, expira_em, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(tokenHash, email, papel, agoraISO(), expiraEm, ip || '')
    .run();
}

/**
 * Consome o token: só vale se existir, não tiver sido usado e não tiver
 * expirado. O UPDATE condicional garante uso único mesmo em cliques
 * simultâneos — se não afetou nenhuma linha, alguém chegou antes.
 */
export async function consumirLinkMagico(db, tokenHash) {
  const registro = await db
    .prepare('SELECT email, papel, expira_em, usado_em FROM magic_links WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!registro) return { ok: false, motivo: 'invalido' };
  if (registro.usado_em) return { ok: false, motivo: 'usado' };
  if (registro.expira_em < agoraISO()) return { ok: false, motivo: 'expirado' };

  const resultado = await db
    .prepare('UPDATE magic_links SET usado_em = ? WHERE token_hash = ? AND usado_em IS NULL')
    .bind(agoraISO(), tokenHash)
    .run();
  const alterou = resultado && resultado.meta && resultado.meta.changes;
  if (!alterou) return { ok: false, motivo: 'usado' };

  return { ok: true, email: registro.email, papel: registro.papel };
}

/** Quantos links foram pedidos por e-mail/IP desde `desdeISO`. */
export async function contarLinksRecentes(db, { email, ip, desdeISO }) {
  const porEmail = await db
    .prepare('SELECT COUNT(*) AS total FROM magic_links WHERE email = ? AND criado_em >= ?')
    .bind(email, desdeISO)
    .first();
  const porIp = ip
    ? await db
        .prepare('SELECT COUNT(*) AS total FROM magic_links WHERE ip = ? AND criado_em >= ?')
        .bind(ip, desdeISO)
        .first()
    : { total: 0 };
  return { email: (porEmail && porEmail.total) || 0, ip: (porIp && porIp.total) || 0 };
}

// ---------------------------------------------------------------- aceite do regulamento

/**
 * Prova de consentimento: quem concluiu a tela de acesso com a caixa
 * "li e concordo" marcada. Só insere — o histórico nunca é reescrito.
 */
export async function registrarAceiteRegulamento(
  db,
  { email, versao, documento, ip, userAgent }
) {
  await db
    .prepare(
      `INSERT INTO aceites_regulamento (email, versao, documento, aceito_em, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(email, versao, documento, agoraISO(), ip || '', String(userAgent || '').slice(0, 300))
    .run();
}

/** Faxina de links vencidos (roda junto com a emissão, é barato). */
export async function limparLinksVencidos(db) {
  await db
    .prepare(
      "DELETE FROM magic_links WHERE expira_em < strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days')"
    )
    .run();
}
