// Leitor de CSV/TSV conforme RFC 4180, com detecção de separador e de BOM.
// Puro, sem dependências — a Sympla exporta CSV com separador variável
// (`,` no export em inglês, `;` no export em pt-BR).

/** Detecta o separador olhando a primeira linha fora de aspas. */
export function detectarSeparador(texto) {
  const candidatos = [';', ',', '\t'];
  let dentroAspas = false;
  const contagem = { ';': 0, ',': 0, '\t': 0 };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (dentroAspas && texto[i + 1] === '"') i++;
      else dentroAspas = !dentroAspas;
      continue;
    }
    if (!dentroAspas) {
      if (c === '\n' || c === '\r') break;
      if (c in contagem) contagem[c]++;
    }
  }
  let melhor = ',';
  let maior = -1;
  for (const c of candidatos) {
    if (contagem[c] > maior) {
      maior = contagem[c];
      melhor = c;
    }
  }
  return maior > 0 ? melhor : ',';
}

/**
 * Converte o texto em matriz de células. Respeita aspas duplas, aspas
 * escapadas (`""`), quebras de linha dentro de célula e CRLF.
 */
export function parseDelimitado(textoBruto, separador) {
  const texto = String(textoBruto).replace(/^﻿/, '');
  const sep = separador || detectarSeparador(texto);
  const linhas = [];
  let celula = '';
  let linha = [];
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        celula += c;
      }
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
    } else if (c === sep) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n') {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = '';
    } else if (c === '\r') {
      // ignorado: o \n seguinte fecha a linha
    } else {
      celula += c;
    }
  }
  if (celula !== '' || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }

  // Remove linhas totalmente vazias (rodapés e linhas em branco do export).
  return linhas.filter((l) => l.some((c) => String(c).trim() !== ''));
}

/** Escapa uma célula para gerar CSV de saída. */
export function celulaCSV(valor) {
  const texto = valor == null ? '' : String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Gera CSV (separador `;`, compatível com Excel pt-BR) com BOM. */
export function gerarCSV(cabecalho, linhas) {
  const partes = [cabecalho.map(celulaCSV).join(';')];
  for (const linha of linhas) partes.push(linha.map(celulaCSV).join(';'));
  return '﻿' + partes.join('\r\n') + '\r\n';
}
