-- Plataforma de Indicação — Product Camp 2026
-- Banco: Cloudflare D1 (SQLite). Aplicar com:
--   npx wrangler d1 execute pcamp-indicacao --remote --file=indicacao/schema.sql
-- O script é idempotente: pode rodar de novo sem perder dados.
--
-- A fonte de verdade é a tabela `pedidos` do D1 `pm3-eventos` (espelho da
-- planilha de vendas, mantido pelo Worker pm3-eventos-vendas-sync). A
-- Function de sincronização lê os pedidos por HTTP e grava aqui um snapshot
-- completo de `indicadores`, `compras` e `premios` (contagens). O que é da
-- plataforma e nunca é tocado pelo snapshot: `premios.vip_liberado` (decisão
-- manual do time), `vip_log`, `aceites_regulamento`, `magic_links`.
--
-- Se o banco foi criado com o schema anterior (upload de planilha da Sympla),
-- rode antes indicacao/schema-reset.sql: as tabelas de snapshot mudaram.

-- ---------------------------------------------------------------------------
-- Indicadores: quem tem Passaporte e não tem VIP. O e-mail é a chave, o
-- cupom e o login. `sync_id` marca em qual sincronização a linha veio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicadores (
  email           TEXT PRIMARY KEY,
  primeiro_nome   TEXT NOT NULL,
  nome_completo   TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  sync_id         INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  atualizado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_indicadores_sync ON indicadores (sync_id);

-- ---------------------------------------------------------------------------
-- Compras do evento (linhas da planilha, sem as canceladas e sem outros
-- eventos). `id_compra` é um hash do conteúdo + posição da linha.
-- `conta` = 1 quando a compra conta para um indicador (cupom casou e não é
-- auto-indicação); `motivo` explica quando não conta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
  id_compra          TEXT PRIMARY KEY,
  linha              INTEGER,
  comprador_nome     TEXT,
  comprador_email    TEXT,
  cupom              TEXT,
  cupom_email        TEXT,
  lote               TEXT,
  categoria          TEXT,
  formato            TEXT,
  modalidade         TEXT,
  quantidade         INTEGER NOT NULL DEFAULT 1,
  valor_unitario     REAL NOT NULL DEFAULT 0,
  valor              REAL NOT NULL DEFAULT 0,
  data_compra        TEXT,
  conta              INTEGER NOT NULL DEFAULT 0,
  motivo             TEXT,
  sync_id            INTEGER NOT NULL DEFAULT 0,
  atualizado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_compras_cupom ON compras (cupom_email);
CREATE INDEX IF NOT EXISTS idx_compras_sync ON compras (sync_id);

-- ---------------------------------------------------------------------------
-- Status de prêmio por indicador. compras_confirmadas, receita e
-- qualificou_em são recalculados a cada sincronização; vip_liberado,
-- liberado_por e liberado_em NUNCA são tocados pela sincronização.
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
-- Histórico de sincronizações (tipo 'planilha'); `origem` diz quem pediu
-- (e-mail do admin ou 'worker'). `resumo` é o JSON completo da rodada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sincronizacoes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo               TEXT NOT NULL,
  sync_id            INTEGER,
  origem             TEXT,
  criado_em          TEXT NOT NULL,
  linhas_lidas       INTEGER NOT NULL DEFAULT 0,
  compras            INTEGER NOT NULL DEFAULT 0,
  indicadores        INTEGER NOT NULL DEFAULT 0,
  qualificados       INTEGER NOT NULL DEFAULT 0,
  cupons_orfaos      INTEGER NOT NULL DEFAULT 0,
  autoindicacoes     INTEGER NOT NULL DEFAULT 0,
  canceladas         INTEGER NOT NULL DEFAULT 0,
  resumo             TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_tipo ON sincronizacoes (tipo, id);

-- ---------------------------------------------------------------------------
-- Auditoria das liberações manuais de VIP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vip_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  liberado    INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  criado_em   TEXT NOT NULL,
  webhook     TEXT
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
