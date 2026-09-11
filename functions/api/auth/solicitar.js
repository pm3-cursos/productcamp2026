// POST /api/auth/solicitar  { email }
// Emite o link mágico. Nunca autentica por e-mail digitado: o acesso só
// acontece quando a pessoa clica no link que chegou na caixa dela.

import { erro, json } from '../../_lib/resposta.js';
import { corpoJson, ipCliente, mesmaOrigem } from '../../_lib/requisicao.js';
import { emailValido, horasAtrasISO, normalizarEmail } from '../../_lib/util.js';
import { ehAdmin } from '../../_lib/session.js';
import { enviarLinkMagico } from '../../_lib/email.js';
import { sha256Hex, tokenAleatorio } from '../../_lib/crypto.js';
import {
  banco,
  buscarIndicador,
  contarLinksRecentes,
  guardarLinkMagico,
  limparLinksVencidos,
} from '../../_lib/dados.js';
import {
  LIMITE_LINKS_POR_EMAIL_HORA,
  LIMITE_LINKS_POR_IP_HORA,
  LINK_TTL_MIN,
} from '../../_lib/config.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }

  const corpo = await corpoJson(request);
  const email = normalizarEmail(corpo.email);
  if (!email || !emailValido(email)) {
    return erro('email_invalido', 'Confira o e-mail digitado.', 400);
  }

  const db = banco(env);
  const admin = ehAdmin(email);
  const indicador = admin ? null : await buscarIndicador(db, email);

  if (!admin && (!indicador || Number(indicador.ativo) === 0)) {
    return erro(
      'nao_liberado',
      'Este e-mail não está na lista de indicadores da organização. Use o mesmo e-mail da sua compra do ingresso.',
      403
    );
  }

  const ip = ipCliente(request);
  const recentes = await contarLinksRecentes(db, { email, ip, desdeISO: horasAtrasISO(1) });
  if (
    recentes.email >= LIMITE_LINKS_POR_EMAIL_HORA ||
    recentes.ip >= LIMITE_LINKS_POR_IP_HORA
  ) {
    return erro(
      'muitas_tentativas',
      'Você já pediu vários links na última hora. Confira sua caixa de entrada e tente de novo mais tarde.',
      429
    );
  }

  const papel = admin ? 'admin' : 'indicador';
  const token = tokenAleatorio();
  const expiraEm = new Date(Date.now() + LINK_TTL_MIN * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  await guardarLinkMagico(db, {
    tokenHash: await sha256Hex(token),
    email,
    papel,
    expiraEm,
    ip,
  });

  const link = `${new URL(request.url).origin}/indicacao/entrar/?t=${encodeURIComponent(token)}`;

  try {
    await enviarLinkMagico(env, {
      email,
      link,
      primeiroNome: indicador ? indicador.primeiro_nome : '',
      minutos: LINK_TTL_MIN,
    });
  } catch (e) {
    console.error('[indicacao] falha ao enviar link mágico:', e && e.message ? e.message : e);
    return erro(
      'envio_falhou',
      'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
      502
    );
  }

  // Faxina oportunista dos links vencidos.
  await limparLinksVencidos(db).catch(() => {});

  const resposta = { ok: true, papel, minutos: LINK_TTL_MIN };
  // Atalho só para desenvolvimento local: mostra o link na resposta quando o
  // provedor de e-mail é o `console`.
  if ((env.MAIL_PROVIDER || 'console').toLowerCase() === 'console' && env.MOSTRAR_LINK === '1') {
    resposta.link_dev = link;
  }
  return json(resposta);
}
