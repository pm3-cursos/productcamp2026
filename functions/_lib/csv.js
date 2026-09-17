// Geração de CSV para a exportação do painel. Puro, sem dependências.

export function celulaCSV(valor) {
  const texto = valor == null ? '' : String(valor);
  if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** CSV com `;` e BOM, para abrir direto no Excel em pt-BR. */
export function gerarCSV(cabecalho, linhas) {
  const todas = [cabecalho, ...linhas];
  return '﻿' + todas.map((linha) => linha.map(celulaCSV).join(';')).join('\r\n') + '\r\n';
}
