// Leitura da planilha de pedidos (Google Sheets) para o modelo da plataforma.
// Puro e testável: recebe a matriz de strings (primeira linha = cabeçalho) e
// devolve compras, indicadores e um diagnóstico do que ficou de fora.
//
// Regras (ver indicacao/LEIA-ME.md):
//   - só linhas do evento configurado (`Evento` == EVENTO_PLANILHA);
//   - `Número de Ingressos` = CANCELADO tira a linha de tudo;
//   - indicador = tem compra Passaporte (não B2B) e nenhuma compra VIP (exceto a
//     cortesia gravada pelo n8n quando o próprio prêmio é liberado);
//   - indicação = `Cupom` é um e-mail; a contagem acontece na reconciliação.

import {
  CATEGORIA_CORTESIA,
  EVENTO_PLANILHA,
  FORMATO_SEM_INDICACAO,
  LOTE_VIP_CORTESIA,
  MARCA_CANCELADO,
  MODALIDADE_INDICADOR,
  MODALIDADE_VIP,
} from './config.js';
import {
  chaveTexto,
  cupomEhEmail,
  normalizarEmail,
  parseDataSympla,
  parseQuantidade,
  parseValorBR,
  primeiroNome,
} from './util.js';

/**
 * Cabeçalhos aceitos por campo, comparados com `chaveTexto` (minúsculo, sem
 * acento, sem pontuação). A primeira coluna que casar vence.
 */
const COLUNAS = {
  data_compra: ['data do pedido', 'data pedido', 'data da compra'],
  nome: ['nome', 'primeiro nome'],
  sobrenome: ['sobrenome'],
  email: ['e mail', 'email'],
  lote: ['lote'],
  quantidade: ['numero de ingressos', 'n de ingressos', 'qtd ingressos', 'ingressos'],
  valor_unitario: ['valor por ingresso', 'valor do ingresso', 'valor unitario'],
  valor: ['valor total do pedido', 'valor total', 'total do pedido'],
  cupom: ['cupom', 'cupom de desconto', 'codigo de desconto'],
  categoria: ['categoria'],
  formato: ['formato'],
  modalidade: ['modalidade', 'tipo de ingresso'],
  evento: ['evento'],
};

/** Sem estas colunas não dá para aplicar nenhuma regra. */
const OBRIGATORIAS = ['email', 'cupom', 'modalidade', 'evento', 'quantidade'];

const ROTULOS = {
  email: 'E-mail',
  cupom: 'Cupom',
  modalidade: 'Modalidade',
  evento: 'Evento',
  quantidade: 'Número de Ingressos',
};

/**
 * Casa o cabeçalho da planilha com os campos do modelo.
 * @param {string[]} cabecalho
 * @returns {{indices: Record<string, number>, faltando: string[]}}
 */
export function mapearColunas(cabecalho) {
  const chaves = (cabecalho || []).map((c) => chaveTexto(c));
  const indices = {};
  for (const [campo, aceitos] of Object.entries(COLUNAS)) {
    for (const aceito of aceitos) {
      const posicao = chaves.indexOf(aceito);
      if (posicao !== -1) {
        indices[campo] = posicao;
        break;
      }
    }
  }
  const faltando = OBRIGATORIAS.filter((campo) => indices[campo] === undefined).map(
    (campo) => ROTULOS[campo]
  );
  return { indices, faltando };
}

function celula(linha, indices, campo) {
  const posicao = indices[campo];
  if (posicao === undefined) return '';
  const valor = linha[posicao];
  return valor == null ? '' : String(valor).trim();
}

/**
 * Identificador estável de uma linha dentro de um snapshot. Não existe ID na
 * planilha, então a chave é o conteúdo que importa + a posição da linha
 * (duas compras idênticas continuam sendo duas). FNV-1a em dois sabores,
 * 16 hex — sem depender de crypto, para rodar igual em Node e no Worker.
 */
export function idDaLinha(posicao, partes) {
  const texto = `${posicao}|${partes.join('|')}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const ehEvento = (valor) => chaveTexto(valor) === chaveTexto(EVENTO_PLANILHA);
const ehPassaporte = (modalidade) =>
  chaveTexto(modalidade).includes(chaveTexto(MODALIDADE_INDICADOR));
const ehVip = (modalidade) => chaveTexto(modalidade).includes(chaveTexto(MODALIDADE_VIP));
const ehB2B = (formato) => chaveTexto(formato) === chaveTexto(FORMATO_SEM_INDICACAO);
const ehCortesiaVip = (compra) =>
  chaveTexto(compra.lote) === chaveTexto(LOTE_VIP_CORTESIA) ||
  chaveTexto(compra.categoria) === chaveTexto(CATEGORIA_CORTESIA);

/**
 * Converte a matriz da planilha em compras normalizadas do evento.
 * Linhas de outros eventos e canceladas não entram em `compras`, só no
 * diagnóstico. Não decide quem é indicador nem o que conta — isso é
 * `derivarIndicadores` e a reconciliação.
 *
 * @param {string[][]} linhas
 */
export function lerCompras(linhas) {
  const vazio = { compras: [], faltando: [], linhasLidas: 0, outrosEventos: 0, canceladas: 0, semEmail: 0 };
  if (!linhas || linhas.length === 0) return vazio;

  const { indices, faltando } = mapearColunas(linhas[0]);
  if (faltando.length) return { ...vazio, faltando };

  const compras = [];
  let outrosEventos = 0;
  let canceladas = 0;
  let semEmail = 0;

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha || linha.every((v) => v == null || String(v).trim() === '')) continue;

    if (!ehEvento(celula(linha, indices, 'evento'))) {
      outrosEventos++;
      continue;
    }

    const { cancelado, quantidade } = parseQuantidade(
      celula(linha, indices, 'quantidade'),
      MARCA_CANCELADO
    );
    if (cancelado) {
      canceladas++;
      continue;
    }

    const email = normalizarEmail(celula(linha, indices, 'email'));
    if (!email) {
      semEmail++;
      continue;
    }

    const cupomBruto = celula(linha, indices, 'cupom');
    const cupomEmail = cupomEhEmail(cupomBruto) ? normalizarEmail(cupomBruto) : '';
    const nome = celula(linha, indices, 'nome');
    const sobrenome = celula(linha, indices, 'sobrenome');
    const dataCompra = parseDataSympla(celula(linha, indices, 'data_compra'));
    const valor = parseValorBR(celula(linha, indices, 'valor'));
    const modalidade = celula(linha, indices, 'modalidade');

    compras.push({
      id_compra: idDaLinha(i, [email, dataCompra || '', cupomEmail, modalidade, quantidade, valor]),
      linha: i + 1,
      comprador_nome: `${nome} ${sobrenome}`.replace(/\s+/g, ' ').trim(),
      comprador_primeiro_nome: nome.replace(/\s+/g, ' ').trim(),
      comprador_email: email,
      cupom: cupomBruto,
      cupom_email: cupomEmail,
      lote: celula(linha, indices, 'lote'),
      categoria: celula(linha, indices, 'categoria'),
      formato: celula(linha, indices, 'formato'),
      modalidade,
      quantidade,
      valor_unitario: parseValorBR(celula(linha, indices, 'valor_unitario')),
      valor,
      data_compra: dataCompra,
    });
  }

  return { compras, faltando: [], linhasLidas: linhas.length - 1, outrosEventos, canceladas, semEmail };
}

/**
 * Quem pode indicar: tem Passaporte (em Formato que não seja B2B) e não tem
 * VIP — a não ser que o VIP seja a cortesia do próprio programa. Um e-mail
 * vira um indicador; o nome vem da primeira compra Passaporte dele e `primeiro_nome` é a coluna `Nome`.
 *
 * @param {object[]} compras saída de `lerCompras`
 * @returns {{indicadores: object[], excluidosVip: number, excluidosB2B: number}}
 */
export function derivarIndicadores(compras) {
  const comVip = new Set();
  for (const compra of compras || []) {
    if (ehVip(compra.modalidade) && !ehCortesiaVip(compra)) comVip.add(compra.comprador_email);
  }

  const porEmail = new Map();
  const excluidos = new Set();
  const soB2B = new Set();
  for (const compra of compras || []) {
    if (!ehPassaporte(compra.modalidade)) continue;
    // Passaporte comprado como B2B (corporativo) não libera a indicação.
    if (ehB2B(compra.formato)) {
      soB2B.add(compra.comprador_email);
      continue;
    }
    if (comVip.has(compra.comprador_email)) {
      excluidos.add(compra.comprador_email);
      continue;
    }
    if (porEmail.has(compra.comprador_email)) continue;
    porEmail.set(compra.comprador_email, {
      email: compra.comprador_email,
      primeiro_nome: primeiroNome(compra.comprador_primeiro_nome) || compra.comprador_email.split('@')[0],
      nome_completo: compra.comprador_nome,
      ativo: 1,
    });
  }

  const excluidosB2B = [...soB2B].filter((e) => !porEmail.has(e) && !excluidos.has(e)).length;
  return { indicadores: [...porEmail.values()], excluidosVip: excluidos.size, excluidosB2B };
}

/**
 * Atalho: planilha inteira -> compras + indicadores + diagnóstico.
 * @param {string[][]} linhas
 */
export function lerPlanilha(linhas) {
  const lido = lerCompras(linhas);
  if (lido.faltando.length) return { ...lido, indicadores: [], excluidosVip: 0, excluidosB2B: 0 };
  const { indicadores, excluidosVip, excluidosB2B } = derivarIndicadores(lido.compras);
  return { ...lido, indicadores, excluidosVip, excluidosB2B };
}
