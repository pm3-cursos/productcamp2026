// Leitor de CSV (RFC 4180) usado só pelos testes, para carregar as fixtures
// como matriz de strings. Puro, sem dependências.

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

