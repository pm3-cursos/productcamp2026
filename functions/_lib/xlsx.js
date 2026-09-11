// Leitor mínimo de .xlsx (ZIP + XML) sem biblioteca externa.
// Um .xlsx é um ZIP com `xl/worksheets/sheet1.xml` (células) e
// `xl/sharedStrings.xml` (textos). Só precisamos da primeira planilha como
// matriz de strings — o mesmo formato que o leitor de CSV devolve.

import { tags, atributo, desescapar } from './xml.js';

const dec = new TextDecoder();

/** Lê o diretório central do ZIP e devolve as entradas. */
function lerEntradasZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tamanho = bytes.length;

  // Localiza o End Of Central Directory (0x06054b50) do fim para o começo.
  let eocd = -1;
  const limite = Math.max(0, tamanho - 66000);
  for (let i = tamanho - 22; i >= limite; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('Arquivo .xlsx inválido: não parece ser um ZIP.');
  }

  const totalEntradas = view.getUint16(eocd + 10, true);
  let ponteiro = view.getUint32(eocd + 16, true);
  const entradas = [];

  for (let i = 0; i < totalEntradas; i++) {
    if (ponteiro + 46 > tamanho || view.getUint32(ponteiro, true) !== 0x02014b50) break;
    const nomeTam = view.getUint16(ponteiro + 28, true);
    entradas.push({
      nome: dec.decode(bytes.subarray(ponteiro + 46, ponteiro + 46 + nomeTam)),
      metodo: view.getUint16(ponteiro + 10, true),
      tamanhoComprimido: view.getUint32(ponteiro + 20, true),
      offsetLocal: view.getUint32(ponteiro + 42, true),
    });
    ponteiro +=
      46 +
      nomeTam +
      view.getUint16(ponteiro + 30, true) +
      view.getUint16(ponteiro + 32, true);
  }
  return { entradas, bytes, view };
}

async function extrair(zip, nome) {
  const entrada = zip.entradas.find((e) => e.nome === nome);
  if (!entrada) return null;

  const { view, bytes } = zip;
  const base = entrada.offsetLocal;
  if (view.getUint32(base, true) !== 0x04034b50) {
    throw new Error(`Arquivo .xlsx inválido: cabeçalho local ausente em ${nome}.`);
  }
  const inicio =
    base + 30 + view.getUint16(base + 26, true) + view.getUint16(base + 28, true);
  const dados = bytes.subarray(inicio, inicio + entrada.tamanhoComprimido);

  if (entrada.metodo === 0) return dec.decode(dados);
  if (entrada.metodo !== 8) {
    throw new Error(
      `Compressão não suportada neste .xlsx (método ${entrada.metodo}). Salve a planilha como CSV e importe de novo.`
    );
  }
  const stream = new Blob([dados])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return dec.decode(await new Response(stream).arrayBuffer());
}

/** Concatena os `<t>` de um item (o Excel quebra texto formatado em pedaços). */
function textoDoItem(xml) {
  let texto = '';
  for (const t of tags(xml, 't')) texto += desescapar(t.corpo);
  return texto;
}

function lerSharedStrings(xml) {
  const itens = [];
  for (const si of tags(xml, 'si')) itens.push(textoDoItem(si.corpo));
  return itens;
}

/** "BC" -> 54 (índice 0 da coluna). */
function colunaParaIndice(ref) {
  const letras = (String(ref).match(/^[A-Z]+/) || [''])[0];
  let indice = 0;
  for (let i = 0; i < letras.length; i++) indice = indice * 26 + (letras.charCodeAt(i) - 64);
  return indice - 1;
}

/** Serial de data do Excel -> "DD/MM/AAAA HH:MM" (epoch 1899-12-30). */
function serialParaData(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(d.getTime())) return String(serial);
  const p = (n) => String(n).padStart(2, '0');
  const data = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const fracao = serial % 1;
  return fracao > 1e-9 ? `${data} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : data;
}

/** Índices de formato numérico embutidos que representam data/hora. */
const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Descobre quais estilos de célula (`s="n"`) são data. */
function lerEstilosData(xml) {
  const datas = new Set();
  if (!xml) return datas;

  const personalizados = new Set();
  for (const fmt of tags(xml, 'numFmt')) {
    const codigo = (atributo(fmt.atributos, 'formatCode') || '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/"[^"]*"/g, '');
    if (/[dmyhs]/i.test(codigo)) personalizados.add(Number(atributo(fmt.atributos, 'numFmtId')));
  }

  for (const bloco of tags(xml, 'cellXfs')) {
    let indice = 0;
    for (const xf of tags(bloco.corpo, 'xf')) {
      const fmt = Number(atributo(xf.atributos, 'numFmtId'));
      if (FORMATOS_DATA.has(fmt) || personalizados.has(fmt)) datas.add(indice);
      indice++;
    }
    break; // só o primeiro bloco cellXfs importa
  }
  return datas;
}

/** Caminho da primeira planilha, na ordem declarada no workbook. */
async function caminhoPrimeiraPlanilha(zip) {
  const [workbook, rels] = await Promise.all([
    extrair(zip, 'xl/workbook.xml'),
    extrair(zip, 'xl/_rels/workbook.xml.rels'),
  ]);
  if (workbook && rels) {
    for (const sheet of tags(workbook, 'sheet')) {
      const id = atributo(sheet.atributos, 'r:id');
      if (!id) continue;
      for (const rel of tags(rels, 'Relationship')) {
        if (atributo(rel.atributos, 'Id') !== id) continue;
        const alvo = (atributo(rel.atributos, 'Target') || '')
          .replace(/^\/?xl\//, '')
          .replace(/^\//, '');
        if (alvo) return `xl/${alvo}`;
      }
    }
  }
  const primeira = zip.entradas.find((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.nome));
  return primeira ? primeira.nome : null;
}

/**
 * Lê o .xlsx e devolve matriz de strings (linhas x colunas).
 * @param {ArrayBuffer} buffer conteúdo do arquivo
 */
export async function lerXlsx(buffer) {
  const zip = lerEntradasZip(buffer);
  const caminho = await caminhoPrimeiraPlanilha(zip);
  if (!caminho) throw new Error('Arquivo .xlsx inválido: nenhuma planilha encontrada.');

  const [sheetXml, sharedXml, stylesXml] = await Promise.all([
    extrair(zip, caminho),
    extrair(zip, 'xl/sharedStrings.xml'),
    extrair(zip, 'xl/styles.xml'),
  ]);
  if (!sheetXml) throw new Error('Arquivo .xlsx inválido: planilha vazia.');

  const compartilhadas = lerSharedStrings(sharedXml);
  const estilosData = lerEstilosData(stylesXml);
  const linhas = [];

  for (const linhaXml of tags(sheetXml, 'row')) {
    const celulas = [];
    for (const celula of tags(linhaXml.corpo, 'c')) {
      const ref = atributo(celula.atributos, 'r');
      const tipo = atributo(celula.atributos, 't') || 'n';
      const estilo = Number(atributo(celula.atributos, 's') || -1);

      let valor = '';
      if (tipo === 'inlineStr') {
        valor = textoDoItem(celula.corpo);
      } else {
        let bruto = null;
        for (const v of tags(celula.corpo, 'v')) {
          bruto = v.corpo;
          break;
        }
        if (bruto != null) {
          if (tipo === 's') {
            valor = compartilhadas[Number(bruto)] || '';
          } else if (tipo === 'b') {
            valor = bruto === '1' ? 'VERDADEIRO' : 'FALSO';
          } else if (tipo === 'str' || tipo === 'e') {
            valor = desescapar(bruto);
          } else {
            const numero = Number(bruto);
            valor =
              estilosData.has(estilo) && Number.isFinite(numero) && numero > 0
                ? serialParaData(numero)
                : desescapar(bruto);
          }
        }
      }

      const indice = ref ? colunaParaIndice(ref) : celulas.length;
      while (celulas.length < indice) celulas.push('');
      celulas[indice] = valor;
    }
    linhas.push(celulas);
  }

  return linhas.filter((l) => l.some((c) => String(c).trim() !== ''));
}
