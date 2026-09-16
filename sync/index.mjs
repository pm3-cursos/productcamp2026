#!/usr/bin/env node
// Sincroniza a planilha de pedidos (Google Sheets) com o D1 da plataforma
// de indicação. Roda no GitHub Actions (6/6 h e por disparo do painel) e na
// máquina de quem quiser testar. Sem dependências além do Node e do wrangler.
//
//   node sync/index.mjs                  só lê e mostra o resumo (dry-run)
//   node sync/index.mjs --local          grava no D1 local do `wrangler pages dev`
//   node sync/index.mjs --remote         grava no D1 de produção
//   node sync/index.mjs --fixture=x.csv  usa um CSV no lugar da planilha
//   node sync/index.mjs --sql=saida.sql  também salva o SQL gerado
//
// Configuração (variáveis de ambiente, ou um .dev.vars na raiz do repo):
//   GOOGLE_SA_JSON        conteúdo do JSON da conta de serviço
//   GOOGLE_SA_JSON_PATH   ...ou o caminho do arquivo (mais prático localmente)
//   SHEET_ID              ID da planilha (trecho da URL entre /d/ e /edit)
//   SHEET_TAB             nome da aba (opcional: usa a primeira)
//   D1_DATABASE           nome do banco no Cloudflare (padrão: pcamp-indicacao)
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   só para --remote
//   SYNC_ORIGEM           quem pediu (o workflow preenche; padrão: cron/local)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { lerAba, primeiraAba } from './sheets.js';
import { parseDelimitado } from './csv.js';
import { gerarSQL, montarSnapshot } from './snapshot.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------- argumentos

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [chave, valor] = arg.replace(/^--/, '').split('=');
  args.set(chave, valor === undefined ? true : valor);
}
const alvo = args.has('remote') ? 'remote' : args.has('local') ? 'local' : 'dry-run';
const fixture = args.get('fixture');
const salvarSql = args.get('sql');

// ------------------------------------------------------------- ambiente

function carregarDevVars() {
  const arquivo = path.join(raiz, '.dev.vars');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
carregarDevVars();

function contaServico() {
  if (process.env.GOOGLE_SA_JSON) return JSON.parse(process.env.GOOGLE_SA_JSON);
  if (process.env.GOOGLE_SA_JSON_PATH) {
    const caminho = path.resolve(raiz, process.env.GOOGLE_SA_JSON_PATH);
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  }
  throw new Error('Defina GOOGLE_SA_JSON (conteúdo) ou GOOGLE_SA_JSON_PATH (arquivo) da conta de serviço.');
}

// ------------------------------------------------------------- leitura

async function lerLinhas() {
  if (fixture) {
    const caminho = path.resolve(raiz, fixture);
    console.log(`Lendo fixture ${caminho}`);
    const texto = fs.readFileSync(caminho, 'utf8');
    if (caminho.endsWith('.json')) return JSON.parse(texto);
    return parseDelimitado(texto);
  }

  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error('SHEET_ID não definido.');
  const sa = contaServico();
  const aba = process.env.SHEET_TAB || (await primeiraAba({ contaServico: sa, sheetId }));
  console.log(`Lendo a aba "${aba}" da planilha …${sheetId.slice(-6)} como ${sa.client_email}`);
  return lerAba({ contaServico: sa, sheetId, aba });
}

// ------------------------------------------------------------- resumo

function imprimirResumo(snapshot) {
  const r = snapshot.resumo;
  const linha = (rotulo, valor) => console.log(`  ${String(valor).padStart(6)}  ${rotulo}`);
  console.log('\nLeitura da planilha');
  linha('linhas lidas (sem o cabeçalho)', r.linhas_lidas);
  linha('de outros eventos (ignoradas)', r.outros_eventos);
  linha('canceladas (ignoradas)', r.canceladas);
  if (r.sem_email) linha('sem e-mail (ignoradas)', r.sem_email);
  linha('compras do evento', r.compras);

  console.log('\nIndicadores');
  linha('com Passaporte e sem VIP (podem indicar)', r.indicadores);
  linha('com Passaporte mas também VIP (fora)', r.excluidos_vip);
  linha('só com Passaporte B2B (fora)', r.excluidos_b2b);

  console.log('\nIndicações');
  linha('compras que contam', r.compras_que_contam);
  linha('ingressos indicados (soma de Número de Ingressos)', r.ingressos_indicados);
  linha('indicadores que bateram a meta', r.qualificados);
  linha('compras do próprio indicador (não contam)', r.autoindicacoes);
  linha('compras sem cupom de e-mail', r.sem_cupom);
  linha('cupons de e-mail sem indicador', r.cupons_orfaos);
  if (r.cupons_orfaos_lista.length) {
    for (const item of r.cupons_orfaos_lista) console.log(`            ${item.cupom} (${item.linhas})`);
  }

  const top = snapshot.contagens
    .filter((c) => c.compras_confirmadas > 0)
    .sort((a, b) => b.compras_confirmadas - a.compras_confirmadas || String(a.qualificou_em || '9').localeCompare(String(b.qualificou_em || '9')))
    .slice(0, 5);
  if (top.length) {
    console.log('\nTop 5');
    for (const c of top) {
      console.log(`  ${String(c.compras_confirmadas).padStart(4)}  ${c.email}${c.qualificou_em ? `  (meta em ${c.qualificou_em})` : ''}`);
    }
  }
  console.log('');
}

// ------------------------------------------------------------- gravação

function executarNoD1(statements, syncId) {
  const pasta = path.join(raiz, '.wrangler', 'tmp');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `snapshot-${syncId}.sql`);
  fs.writeFileSync(arquivo, statements.join('\n\n') + '\n', 'utf8');

  // Remoto: o banco é achado pelo nome na conta (CLOUDFLARE_API_TOKEN +
  // CLOUDFLARE_ACCOUNT_ID). Local: precisa do binding, que está em
  // tests/wrangler.e2e.toml — o mesmo banco que `wrangler pages dev` usa.
  const banco = alvo === 'remote' ? process.env.D1_DATABASE || 'pcamp-indicacao' : 'DB';
  const argumentos = ['wrangler', 'd1', 'execute', banco, `--${alvo}`, `--file=${arquivo}`, '-y'];
  if (alvo === 'local') {
    argumentos.push(`--config=${path.join(raiz, 'tests', 'wrangler.e2e.toml')}`);
    // O estado local fica na raiz, onde o `wrangler pages dev` também grava.
    argumentos.push(`--persist-to=${path.join(raiz, '.wrangler', 'state')}`);
  }
  console.log(`Gravando no D1 (${alvo}, banco "${banco}"): ${statements.length} instruções`);

  // No Windows o npx é um .cmd e só roda via shell; aí a linha de comando é
  // montada à mão, com aspas nos caminhos com espaço.
  const windows = os.platform() === 'win32';
  const opcoes = { cwd: raiz, stdio: 'inherit', env: process.env };
  const resultado = windows
    ? spawnSync(['npx', ...argumentos].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '), {
        ...opcoes,
        shell: true,
      })
    : spawnSync('npx', argumentos, opcoes);
  if (resultado.status !== 0) {
    throw new Error(`wrangler d1 execute terminou com código ${resultado.status}. O SQL ficou em ${arquivo}.`);
  }
  fs.unlinkSync(arquivo);
}

// ------------------------------------------------------------- principal

try {
  const linhas = await lerLinhas();
  if (!linhas || linhas.length < 2) throw new Error('A planilha não tem linhas de dados além do cabeçalho.');

  const snapshot = montarSnapshot(linhas);
  if (snapshot.faltando.length) {
    throw new Error(`Não encontrei a(s) coluna(s) ${snapshot.faltando.join(', ')} no cabeçalho: ${linhas[0].join(' | ')}`);
  }
  imprimirResumo(snapshot);

  const syncId = Date.now();
  const origem = process.env.SYNC_ORIGEM || (alvo === 'remote' ? 'cron' : 'local');
  const statements = gerarSQL(snapshot, syncId, origem);

  if (salvarSql) {
    const destino = path.resolve(raiz, salvarSql);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, statements.join('\n\n') + '\n', 'utf8');
    console.log(`SQL salvo em ${salvarSql}`);
  }

  if (alvo === 'dry-run') {
    console.log('Dry-run: nada foi gravado. Use --local ou --remote para gravar.');
  } else {
    executarNoD1(statements, syncId);
    console.log(`Snapshot ${syncId} gravado (${origem}).`);
  }
} catch (e) {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
}
