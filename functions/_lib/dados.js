// Acesso ao D1 a partir das Functions. As tabelas de snapshot (indicadores,
// compras, contagens em premios) são escritas pelo script sync/ — aqui só se
// lê. O que as Functions escrevem: liberação de VIP, links mágicos e o
// (a gravação do snapshot está em snapshot.js).

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
      `SELECT i.email, i.primeiro_nome, i.nome_completo, i.ativo,
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

/** Indicadores + status de prêmio, para o painel e o ranking. */
export function listarIndicadoresComPremio(db) {
  return lerTudo(
    db,
    `SELECT i.email, i.primeiro_nome, i.nome_completo, i.ativo,
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

// ---------------------------------------------------------------- compras

export function listarComprasDoIndicador(db, cupomEmail) {
  return db
    .prepare(
      `SELECT id_compra, linha, comprador_nome, comprador_email, lote, categoria, formato,
              modalidade, quantidade, valor_unitario, valor, data_compra, conta, motivo
         FROM compras
        WHERE cupom_email = ?
        ORDER BY data_compra, id_compra`
    )
    .bind(cupomEmail)
    .all();
}

// ---------------------------------------------------------------- prêmios

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

// ---------------------------------------------------------------- sincronizações

/** Última sincronização concluída (a que alimentou o snapshot atual). */
export function ultimaSincronizacao(db) {
  return db
    .prepare(
      `SELECT id, sync_id, origem, criado_em, linhas_lidas, compras, indicadores,
              qualificados, cupons_orfaos, autoindicacoes, canceladas, resumo
         FROM sincronizacoes WHERE tipo = 'planilha'
        ORDER BY id DESC LIMIT 1`
    )
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
