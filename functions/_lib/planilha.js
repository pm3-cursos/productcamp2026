// Mapeamento das colunas da planilha da Sympla para o modelo da plataforma.
// Puro e testável: recebe matriz de strings (do CSV ou do XLSX) e devolve
// registros normalizados + diagnóstico do que não deu para ler.

import {
  chaveTexto,
  normalizarEmail,
  pagamentoAprovado,
  parseDataSympla,
  parseValorBR,
  primeiroNome,
} from './util.js';

/**
 * Cabeçalhos aceitos por campo. A comparação é feita com `chaveTexto`
 * (minúsculo, sem acentos e sem pontuação), então "Nº ingresso" vira
 * "n ingresso". A primeira coluna que casar vence.
 */
const COLUNAS = {
  id_compra: ['n ingresso', 'numero do ingresso', 'numero ingresso', 'ingresso id', 'id do ingresso', 'ticket number'],
  numero_pedido: ['n pedido', 'numero do pedido', 'numero pedido', 'pedido', 'order number'],
  nome: ['nome', 'first name', 'primeiro nome'],
  sobrenome: ['sobrenome', 'last name', 'ultimo nome'],
  nome_completo: ['nome completo', 'participante', 'comprador', 'full name'],
  email: ['email', 'e mail', 'email do comprador', 'e mail do comprador', 'email do participante'],
  tipo_ingresso: ['tipo de ingresso', 'tipo ingresso', 'ticket type', 'setor'],
  valor: ['valor', 'valor do ingresso', 'valor r', 'valor pago', 'preco', 'price'],
  estado_pagamento: ['estado de pagamento', 'estado do pagamento', 'status do pagamento', 'status de pagamento', 'situacao do pagamento', 'payment status'],
  data_compra: ['data compra', 'data da compra', 'data do pedido', 'data de compra', 'order date'],
  cupom_email: ['cupom de desconto', 'cupom', 'codigo de desconto', 'cupom do indicador', 'discount coupon'],
};

/** Colunas sem as quais não dá para conciliar nada. */
const OBRIGATORIAS = ['id_compra', 'cupom_email', 'estado_pagamento'];

/** Rótulo humano de cada coluna, para a mensagem de erro. */
const ROTULOS = {
  id_compra: 'Nº ingresso',
  cupom_email: 'Cupom de Desconto',
  estado_pagamento: 'Estado de pagamento',
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

/** Nome do comprador a partir de "Nome" + "Sobrenome" ou "Nome completo". */
function montarNome(linha, indices) {
  const completo = celula(linha, indices, 'nome_completo');
  if (completo) return completo.replace(/\s+/g, ' ');
  const nome = celula(linha, indices, 'nome');
  const sobrenome = celula(linha, indices, 'sobrenome');
  return `${nome} ${sobrenome}`.replace(/\s+/g, ' ').trim();
}

/**
 * Converte a matriz da planilha em registros de compra.
 * Não aplica regra de negócio (isso é a conciliação) — só normaliza.
 *
 * @param {string[][]} linhas primeira linha é o cabeçalho
 */
export function lerCompras(linhas) {
  if (!linhas || linhas.length === 0) {
    return { compras: [], faltando: [], linhasLidas: 0, semIdentificador: 0 };
  }

  const { indices, faltando } = mapearColunas(linhas[0]);
  if (faltando.length) {
    return { compras: [], faltando, linhasLidas: 0, semIdentificador: 0 };
  }

  const compras = [];
  const vistos = new Set();
  let semIdentificador = 0;
  let duplicadasNoArquivo = 0;

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const idCompra = celula(linha, indices, 'id_compra');
    if (!idCompra) {
      semIdentificador++;
      continue;
    }
    if (vistos.has(idCompra)) {
      // Mesmo Nº ingresso repetido no arquivo: a última linha vence.
      duplicadasNoArquivo++;
    }
    vistos.add(idCompra);

    const estado = celula(linha, indices, 'estado_pagamento');
    const nome = montarNome(linha, indices);

    compras.push({
      id_compra: idCompra,
      numero_pedido: celula(linha, indices, 'numero_pedido'),
      comprador_nome: nome,
      comprador_email: normalizarEmail(celula(linha, indices, 'email')),
      cupom_email: normalizarEmail(celula(linha, indices, 'cupom_email')),
      tipo_ingresso: celula(linha, indices, 'tipo_ingresso'),
      valor: parseValorBR(celula(linha, indices, 'valor')),
      estado_pagamento: estado,
      aprovado: pagamentoAprovado(estado) ? 1 : 0,
      data_compra: parseDataSympla(celula(linha, indices, 'data_compra')),
    });
  }

  // Deduplica mantendo a última ocorrência de cada Nº ingresso.
  const porId = new Map();
  for (const compra of compras) porId.set(compra.id_compra, compra);

  return {
    compras: [...porId.values()],
    faltando: [],
    linhasLidas: linhas.length - 1,
    semIdentificador,
    duplicadasNoArquivo,
  };
}

/**
 * Deriva a lista de indicadores a partir de um export da Sympla.
 * Regras: só compras aprovadas, quem já tem VIP não entra, e um mesmo e-mail
 * pode ter vários "Nº ingresso" — fixamos o primeiro como código público.
 *
 * @param {string[][]} linhas
 */
export function derivarIndicadores(linhas) {
  const { compras, faltando, linhasLidas } = lerCompras(linhas);
  if (faltando.length) return { indicadores: [], faltando, linhasLidas, excluidosVip: 0 };

  const emailsVip = new Set();
  for (const compra of compras) {
    if (compra.aprovado && /vip/i.test(compra.tipo_ingresso || '') && compra.comprador_email) {
      emailsVip.add(compra.comprador_email);
    }
  }

  const porEmail = new Map();
  for (const compra of compras) {
    if (!compra.aprovado || !compra.comprador_email) continue;
    if (emailsVip.has(compra.comprador_email)) continue;
    if (porEmail.has(compra.comprador_email)) continue;
    porEmail.set(compra.comprador_email, {
      email: compra.comprador_email,
      codigo_publico: compra.id_compra,
      primeiro_nome: primeiroNome(compra.comprador_nome),
      nome_completo: compra.comprador_nome,
      ativo: 1,
    });
  }

  return {
    indicadores: [...porEmail.values()],
    faltando: [],
    linhasLidas,
    excluidosVip: emailsVip.size,
  };
}

/**
 * Lê uma lista de cupons já pronta (e-mail, código, nome).
 * Aceita cabeçalhos em português e também o export da Sympla — se as colunas
 * da Sympla estiverem presentes, cai em `derivarIndicadores`.
 *
 * @param {string[][]} linhas
 */
export function lerIndicadores(linhas) {
  if (!linhas || linhas.length === 0) {
    return { indicadores: [], faltando: ['E-mail'], linhasLidas: 0 };
  }

  const chaves = linhas[0].map((c) => chaveTexto(c));
  const acha = (...nomes) => {
    for (const nome of nomes) {
      const posicao = chaves.indexOf(nome);
      if (posicao !== -1) return posicao;
    }
    return -1;
  };

  const iEmail = acha('email', 'e mail', 'email do indicador', 'cupom', 'cupom email');
  const iCodigo = acha('codigo publico', 'codigo', 'n ingresso', 'numero do ingresso');
  const iNome = acha('primeiro nome', 'nome', 'nome completo');
  const iAtivo = acha('ativo');

  // Se parece um export da Sympla (tem cupom + estado de pagamento), deriva.
  const { faltando: faltandoSympla } = mapearColunas(linhas[0]);
  if (faltandoSympla.length === 0 && iEmail !== -1 && chaves.includes('estado de pagamento')) {
    return derivarIndicadores(linhas);
  }

  if (iEmail === -1) {
    return {
      indicadores: [],
      faltando: ['E-mail'],
      linhasLidas: Math.max(0, linhas.length - 1),
    };
  }

  const porEmail = new Map();
  let semEmail = 0;

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const email = normalizarEmail(linha[iEmail]);
    if (!email) {
      semEmail++;
      continue;
    }
    const nomeBruto = iNome !== -1 ? String(linha[iNome] || '').trim() : '';
    const ativoBruto = iAtivo !== -1 ? chaveTexto(linha[iAtivo]) : '';
    porEmail.set(email, {
      email,
      codigo_publico: iCodigo !== -1 ? String(linha[iCodigo] || '').trim() : '',
      primeiro_nome: primeiroNome(nomeBruto) || email.split('@')[0],
      nome_completo: nomeBruto,
      ativo: ['0', 'nao', 'false', 'inativo'].includes(ativoBruto) ? 0 : 1,
    });
  }

  return {
    indicadores: [...porEmail.values()],
    faltando: [],
    linhasLidas: linhas.length - 1,
    semEmail,
  };
}
