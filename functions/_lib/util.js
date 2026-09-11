// Helpers puros de normalização e formatação. Sem dependências de runtime,
// para poderem ser testados com `node tests/run.mjs`.

/** Normaliza e-mail: minúsculo, sem espaços nas pontas e sem espaços internos. */
export function normalizarEmail(valor) {
  if (valor == null) return '';
  return String(valor).replace(/\s+/g, '').toLowerCase();
}

/** Texto comparável: minúsculo, sem acentos, sem pontuação, espaços colapsados. */
export function chaveTexto(valor) {
  if (valor == null) return '';
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `true` só para estados de pagamento aprovados. */
export function pagamentoAprovado(estado) {
  return chaveTexto(estado) === 'aprovado';
}

/**
 * Converte o valor da planilha da Sympla para número.
 * Aceita "R$ 1.214,10", "1.214,10", "1214.10", "1214", "" e nulos.
 */
export function parseValorBR(valor) {
  if (valor == null || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor).replace(/[^\d,.-]/g, '');
  if (texto === '' || texto === '-') return 0;
  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');
  if (temVirgula && temPonto) {
    // Formato br: ponto é separador de milhar, vírgula é decimal.
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    texto = texto.replace(',', '.');
  } else if (temPonto) {
    // "1.214" da Sympla é milhar; "1214.10" é decimal com 1-2 casas.
    const partes = texto.split('.');
    const ultima = partes[partes.length - 1];
    if (partes.length > 2 || ultima.length === 3) texto = partes.join('');
  }
  const numero = Number.parseFloat(texto);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Converte a data da planilha para ISO (YYYY-MM-DD HH:MM quando houver hora).
 * Aceita "05/09/2026 14:32", "05/09/26", "2026-09-05 14:32" e ISO completo.
 * Devolve o texto original se não reconhecer o formato — nunca inventa data.
 */
export function parseDataSympla(valor) {
  if (valor == null || valor === '') return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  const br = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (br) {
    const dia = br[1].padStart(2, '0');
    const mes = br[2].padStart(2, '0');
    let ano = br[3];
    if (ano.length === 2) ano = String(2000 + Number(ano));
    const hora = br[4] ? ` ${br[4].padStart(2, '0')}:${br[5]}` : '';
    return `${ano}-${mes}-${dia}${hora}`;
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    const hora = iso[4] ? ` ${iso[4]}:${iso[5]}` : '';
    return `${iso[1]}-${iso[2]}-${iso[3]}${hora}`;
  }

  return texto;
}

/** Primeiro nome a partir de um nome completo. */
export function primeiroNome(nome) {
  const limpo = String(nome == null ? '' : nome).trim().replace(/\s+/g, ' ');
  if (!limpo) return '';
  const parte = limpo.split(' ')[0];
  return parte.charAt(0).toUpperCase() + parte.slice(1);
}

/**
 * Nome exibido na lista de indicações: primeiro nome + inicial do sobrenome.
 * "Marcela Andrade" -> "Marcela A."
 */
export function nomeAbreviado(nome) {
  const limpo = String(nome == null ? '' : nome).trim().replace(/\s+/g, ' ');
  if (!limpo) return '';
  const partes = limpo.split(' ');
  const primeiro = primeiroNome(partes[0]);
  if (partes.length === 1) return primeiro;
  const inicial = partes[partes.length - 1].charAt(0).toUpperCase();
  return `${primeiro} ${inicial}.`;
}

/** Iniciais para o avatar (máx. 2 letras). */
export function iniciais(nome) {
  const limpo = String(nome == null ? '' : nome).trim().replace(/\s+/g, ' ');
  if (!limpo) return '?';
  const partes = limpo.split(' ').filter(Boolean);
  const primeira = partes[0].charAt(0);
  const segunda = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
  return (primeira + segunda).toUpperCase();
}

/** Agora em ISO curto UTC (mesmo formato usado pelo schema). */
export function agoraISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** ISO de N horas atrás. */
export function horasAtrasISO(horas) {
  return new Date(Date.now() - horas * 3600 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Formata em real brasileiro sem depender de Intl no Worker. */
export function formatarBRL(valor) {
  const n = Number(valor) || 0;
  const partes = n.toFixed(2).split('.');
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiro},${partes[1]}`;
}

/** Formato compacto para KPI: 415000 -> "R$ 415k". */
export function formatarBRLCompacto(valor) {
  const n = Number(valor) || 0;
  if (Math.abs(n) >= 1000000) {
    return `R$ ${(n / 1000000).toFixed(1).replace('.', ',')}M`;
  }
  if (Math.abs(n) >= 1000) return `R$ ${Math.round(n / 1000)}k`;
  return formatarBRL(n);
}

/** Valida formato de e-mail de forma conservadora. */
export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
