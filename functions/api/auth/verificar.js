// POST /api/auth/verificar  { token }
// Troca o token do link mágico por uma sessão. É POST de propósito: alguns
// clientes de e-mail e antivírus abrem (GET) os links das mensagens, e um
// token de uso único seria queimado antes da pessoa clicar.

import { erro, json } from '../../_lib/resposta.js';
import { corpoJson, mesmaOrigem } from '../../_lib/requisicao.js';
import { sha256Hex } from '../../_lib/crypto.js';
import { banco, buscarIndicador, consumirLinkMagico } from '../../_lib/dados.js';
import { cookieSessao, criarSessao, ehAdmin } from '../../_lib/session.js';
import { ROTA_ADMIN, ROTA_INDICADOR } from '../../_lib/config.js';

const MOTIVOS = {
  invalido: 'Este link não é válido. Peça um novo acesso.',
  usado: 'Este link já foi usado. Peça um novo acesso.',
  expirado: 'Este link expirou. Peça um novo acesso.',
};

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) {
    return erro('origem_invalida', 'Requisição bloqueada por origem inválida.', 403);
  }

  const corpo = await corpoJson(request);
  const token = typeof corpo.token === 'string' ? corpo.token.trim() : '';
  if (!token || token.length > 200) {
    return erro('token_invalido', MOTIVOS.invalido, 400);
  }

  const db = banco(env);
  const resultado = await consumirLinkMagico(db, await sha256Hex(token));
  if (!resultado.ok) {
    return erro(resultado.motivo, MOTIVOS[resultado.motivo] || MOTIVOS.invalido, 401);
  }

  // O papel é sempre reconferido no momento do login: quem saiu da allowlist
  // de admin ou da lista de indicadores não entra, mesmo com link válido.
  const admin = ehAdmin(resultado.email);
  if (resultado.papel === 'admin' && !admin) {
    return erro('nao_liberado', 'Acesso não liberado para este e-mail.', 403);
  }
  if (!admin) {
    const indicador = await buscarIndicador(db, resultado.email);
    if (!indicador || Number(indicador.ativo) === 0) {
      return erro('nao_liberado', 'Acesso não liberado para este e-mail.', 403);
    }
  }

  const papel = admin ? 'admin' : 'indicador';
  const sessao = await criarSessao(env, { email: resultado.email, papel });

  return json(
    { ok: true, papel, destino: papel === 'admin' ? ROTA_ADMIN : ROTA_INDICADOR },
    200,
    { 'Set-Cookie': cookieSessao(sessao) }
  );
}
