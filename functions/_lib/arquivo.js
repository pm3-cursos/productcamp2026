// Leitura do arquivo enviado no upload: decide entre .xlsx e texto delimitado,
// e resolve a codificação (o Excel em português salva CSV em Windows-1252).

import { parseDelimitado } from './csv.js';
import { lerXlsx } from './xlsx.js';
import { MAX_UPLOAD_BYTES } from './config.js';

/** `true` se o buffer começa com a assinatura de ZIP (todo .xlsx é um ZIP). */
function pareceZip(bytes) {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function decodificarTexto(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // CSV salvo pelo Excel pt-BR costuma vir em Windows-1252.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Converte o arquivo em matriz de strings (linhas x colunas).
 * @param {File|Blob} arquivo
 * @returns {Promise<{linhas: string[][], formato: 'xlsx'|'texto'}>}
 */
export async function lerArquivoDePlanilha(arquivo) {
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') {
    throw new Error('Nenhum arquivo recebido.');
  }
  if (arquivo.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Arquivo de ${(arquivo.size / 1048576).toFixed(1)} MB é maior que o limite de ${MAX_UPLOAD_BYTES / 1048576} MB.`
    );
  }

  const buffer = await arquivo.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) throw new Error('O arquivo está vazio.');

  if (pareceZip(bytes)) {
    return { linhas: await lerXlsx(buffer), formato: 'xlsx' };
  }

  const nome = String(arquivo.name || '').toLowerCase();
  if (nome.endsWith('.xls')) {
    throw new Error(
      'Formato .xls antigo não é suportado. Salve como .xlsx ou .csv e importe de novo.'
    );
  }

  return { linhas: parseDelimitado(decodificarTexto(bytes)), formato: 'texto' };
}
