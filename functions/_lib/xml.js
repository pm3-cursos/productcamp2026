// Varredura mínima de XML por nome de tag. Escrita à mão porque o Workers não
// tem parser de XML e as planilhas da Sympla são pequenas e bem formadas.
//
// O ponto de atenção que motivou este módulo: uma regex ingênua como
// /<c[^>]*>([\s\S]*?)<\/c>/ casa também com `<c r="J9"/>` (o `[^>]*` engole a
// barra) e passa a ler o conteúdo da célula seguinte, deslocando as colunas.
// Aqui a tag autofechada é reconhecida explicitamente.

/**
 * Itera as tags `<nome ...>...</nome>` e `<nome .../>` no nível em que
 * aparecem, devolvendo `{ atributos, corpo }`.
 * @param {string} xml
 * @param {string} nome
 */
export function* tags(xml, nome) {
  if (!xml) return;
  const abertura = new RegExp(`<${nome}\\b([^>]*?)(\\/?)>`, 'g');
  const fechamento = `</${nome}>`;
  let m;
  while ((m = abertura.exec(xml)) !== null) {
    const atributos = m[1] || '';
    if (m[2] === '/') {
      yield { atributos, corpo: '' };
      continue;
    }
    const fim = xml.indexOf(fechamento, abertura.lastIndex);
    if (fim < 0) {
      yield { atributos, corpo: xml.slice(abertura.lastIndex) };
      return;
    }
    yield { atributos, corpo: xml.slice(abertura.lastIndex, fim) };
    abertura.lastIndex = fim + fechamento.length;
  }
}

/** Lê um atributo da string de atributos de uma tag. */
export function atributo(atributos, nome) {
  const m = new RegExp(`\\b${nome}="([^"]*)"`).exec(atributos || '');
  return m ? m[1] : null;
}

/** Desfaz as entidades XML usadas pelo Excel. */
export function desescapar(texto) {
  if (!texto) return '';
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}
