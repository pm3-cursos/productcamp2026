// GET /api/auth/sessao — quem está logado (usado pelas telas para se montar).

import { json } from '../../_lib/resposta.js';
import { lerSessao } from '../../_lib/session.js';
import { banco, buscarIndicador } from '../../_lib/dados.js';
import { ROTA_ADMIN, ROTA_INDICADOR } from '../../_lib/config.js';

export async function onRequestGet({ request, env }) {
  const sessao = await lerSessao(request, env);
  if (!sessao) return json({ autenticado: false });

  let primeiroNome = '';
  if (sessao.papel === 'indicador') {
    const indicador = await buscarIndicador(banco(env), sessao.email);
    primeiroNome = (indicador && indicador.primeiro_nome) || '';
  }

  return json({
    autenticado: true,
    email: sessao.email,
    papel: sessao.papel,
    primeiro_nome: primeiroNome,
    destino: sessao.papel === 'admin' ? ROTA_ADMIN : ROTA_INDICADOR,
  });
}
