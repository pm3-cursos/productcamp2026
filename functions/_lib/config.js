// Configuração central da plataforma de indicação do Product Camp 2026.

/**
 * Allowlist fixa do time PM3. Só estes e-mails acessam o painel interno.
 * Qualquer mudança aqui é uma mudança de código, revisada por PR.
 */
export const ADMINS = ['eventos@pm3.com.br'];

/** Compras confirmadas necessárias para qualificar ao upgrade VIP. */
export const META_COMPRAS = 3;

/** Teto de prêmios: os 50 primeiros que baterem a meta. */
export const TETO_VIP = 50;

/** Link do checkout usado na mensagem de WhatsApp. */
export const SYMPLA_URL =
  'https://www.sympla.com.br/evento/product-camp-2026-sao-paulo/3220593';

/** Rotas de destino após o login. */
export const ROTA_INDICADOR = '/indicacao/minha-pagina/';
export const ROTA_ADMIN = '/indicacao/pm3/';
export const ROTA_LOGIN = '/indicacao/';

/** Cookie de sessão. */
export const COOKIE_SESSAO = 'pc_ind_sessao';

/** Validade do link mágico, em minutos. */
export const LINK_TTL_MIN = 20;

/** Validade da sessão, em horas. */
export const SESSAO_TTL_H = 12;

/** Limites de emissão de link mágico (anti-abuso). */
export const LIMITE_LINKS_POR_EMAIL_HORA = 5;
export const LIMITE_LINKS_POR_IP_HORA = 20;

/** Tamanho máximo aceito no upload de planilha (bytes). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Regulamento vigente do programa. A versão é gravada em cada aceite (tabela
 * `aceites_regulamento`) como prova de consentimento. Ao publicar um novo
 * regulamento: suba o PDF novo em `assets/docs/`, troque o `href` do link
 * em `indicacao/index.html` e atualize os dois valores aqui — os aceites
 * antigos continuam apontando para a versão que a pessoa realmente leu.
 */
export const REGULAMENTO_VERSAO = '1'; // rodapé do PDF: "versão 1, setembro de 2026"
export const REGULAMENTO_URL = '/assets/docs/Regulamento-Programa-Indicacao-PCamp26.pdf';

/** Mensagem de compartilhamento. `[cupom]` é o e-mail do indicador. */
export function mensagemWhatsApp(cupom) {
  return (
    'Quero você comigo no Product Camp 2026! Use meu cupom ' +
    cupom +
    ' no checkout e ganhe 10% off: ' +
    SYMPLA_URL
  );
}

export function urlWhatsApp(cupom) {
  return 'https://wa.me/?text=' + encodeURIComponent(mensagemWhatsApp(cupom));
}

/** Textos fixos do estado "VIP conquistado" (não alterar sem pedido). */
export const TEXTO_VIP_BANNER =
  'Upgrade garantido! Sua vaga no VIP foi assegurada. Você receberá o acesso à nova modalidade de ingresso dentro de 7 dias úteis.';

export const TEXTO_VIP_CUPOM_ATIVO =
  'Você conquistou o VIP, mas o seu cupom continua ativo e você ainda pode compartilhá-lo com amigos que desejam um desconto a mais no ingresso! Nos vemos em breve!';
