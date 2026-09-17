-- Só para bancos criados com o schema anterior (upload da planilha da Sympla).
-- Apaga as tabelas de snapshot, que mudaram de formato; preserva `premios`
-- (vip_liberado), `vip_log` e `magic_links`. Depois rode indicacao/schema.sql.
--   npx wrangler d1 execute pcamp-indicacao --remote --file=indicacao/schema-reset.sql
DROP TABLE IF EXISTS compras;
DROP TABLE IF EXISTS indicadores;
DROP TABLE IF EXISTS imports;
ALTER TABLE vip_log ADD COLUMN webhook TEXT;
