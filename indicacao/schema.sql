-- Plataforma de Indicação — Product Camp 2026
-- Banco: Cloudflare D1 (SQLite). Aplicar com:
--   npx wrangler d1 execute pcamp-indicacao --remote --file=indicacao/schema.sql
-- O script é idempotente: pode rodar de novo sem perder dados.

-- ---------------------------------------------------------------------------
-- Indicadores (a "lista de cupons"). O e-mail é a chave, o cupom e o login.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicadores (
  email           TEXT PRIMARY KEY,
  codigo_publico  TEXT NOT NULL,
  primeiro_nome   TEXT NOT NULL,
  nome_completo   TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  atualizado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_indicadores_codigo ON indicadores (codigo_publico);

-- ---------------------------------------------------------------------------
-- Compras importadas do export de participantes da Sympla.
-- id_compra = "Nº ingresso" do comprador (chave única, evita duplicar).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
  id_compra          TEXT PRIMARY KEY,
  numero_pedido      TEXT,
  comprador_nome     TEXT,
  comprador_email    TEXT,
  cupom_email        TEXT,
  tipo_ingresso      TEXT,
  valor              REAL NOT NULL DEFAULT 0,
  estado_pagamento   TEXT,
  aprovado           INTEGER NOT NULL DEFAULT 0,
  data_compra        TEXT,
  ausente            INTEGER NOT NULL DEFAULT 0, -- 1 = não veio na última planilha
  primeiro_import_id INTEGER,
  ultimo_import_id   INTEGER,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  atualizado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_compras_cupom ON compras (cupom_email);
CREATE INDEX IF NOT EXISTS idx_compras_aprovado ON compras (aprovado, ausente);

-- ---------------------------------------------------------------------------
-- Status de prêmio por indicador. compras_confirmadas e qualificou_em são
-- recalculados a cada import; vip_liberado NUNCA é tocado por import.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS premios (
  email               TEXT PRIMARY KEY,
  compras_confirmadas INTEGER NOT NULL DEFAULT 0,
  receita             REAL NOT NULL DEFAULT 0,
  qualificou_em       TEXT,
  vip_liberado        INTEGER NOT NULL DEFAULT 0,
  liberado_por        TEXT,
  liberado_em         TEXT
);
CREATE INDEX IF NOT EXISTS idx_premios_ranking ON premios (compras_confirmadas DESC);
CREATE INDEX IF NOT EXISTS idx_premios_fila ON premios (qualificou_em);

-- ---------------------------------------------------------------------------
-- Links mágicos de acesso (uso único, validade curta). Guardamos só o hash.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  papel      TEXT NOT NULL,
  criado_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL,
  usado_em   TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_links (email, criado_em);
CREATE INDEX IF NOT EXISTS idx_magic_expira ON magic_links (expira_em);

-- ---------------------------------------------------------------------------
-- Histórico de importações (para o resumo de conciliação e auditoria).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo               TEXT NOT NULL,
  arquivo            TEXT,
  admin_email        TEXT NOT NULL,
  criado_em          TEXT NOT NULL,
  linhas_lidas       INTEGER NOT NULL DEFAULT 0,
  aprovadas          INTEGER NOT NULL DEFAULT 0,
  novas              INTEGER NOT NULL DEFAULT 0,
  atualizadas        INTEGER NOT NULL DEFAULT 0,
  qualificados_agora INTEGER NOT NULL DEFAULT 0,
  cupons_orfaos      INTEGER NOT NULL DEFAULT 0,
  autoindicacoes     INTEGER NOT NULL DEFAULT 0,
  ausentes           INTEGER NOT NULL DEFAULT 0,
  vip_alterados      INTEGER NOT NULL DEFAULT 0,
  resumo             TEXT
);

-- ---------------------------------------------------------------------------
-- Auditoria das liberações manuais de VIP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vip_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  liberado    INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vip_log_email ON vip_log (email, criado_em);

-- ---------------------------------------------------------------------------
-- Prova de consentimento: cada vez que alguém conclui a tela de acesso com a
-- caixa "li e concordo com o Regulamento" marcada, grava-se uma linha aqui.
-- É um registro só de inclusão (nunca se atualiza nem apaga). A versão vem
-- de REGULAMENTO_VERSAO em functions/_lib/config.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aceites_regulamento (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  versao     TEXT NOT NULL,
  documento  TEXT NOT NULL,
  aceito_em  TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_aceites_email ON aceites_regulamento (email, aceito_em);
