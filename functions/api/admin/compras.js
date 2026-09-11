// GET /api/admin/compras?email=... — compras atribuídas a um indicador.

import { erro, json } from '../../_lib/resposta.js';
import { banco, buscarIndicador, listarComprasDoIndicador } from '../../_lib/dados.js';
import { normalizarEmail } from '../../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const email = normalizarEmail(url.searchParams.get('email') || '');
  if (!email) return erro('email_invalido', 'Informe o e-mail do indicador.', 400);

  const db = banco(env);
  const indicador = await buscarIndicador(db, email);
  if (!indicador) return erro('nao_encontrado', 'Indicador não encontrado.', 404);

  const { results } = await listarComprasDoIndicador(db, email);

  const compras = (results || []).map((c) => ({
    id_compra: c.id_compra,
    numero_pedido: c.numero_pedido,
    comprador_nome: c.comprador_nome,
    comprador_email: c.comprador_email,
    tipo_ingresso: c.tipo_ingresso,
    valor: Number(c.valor) || 0,
    estado_pagamento: c.estado_pagamento,
    data_compra: c.data_compra,
    conta:
      Number(c.aprovado) === 1 &&
      Number(c.ausente) === 0 &&
      c.comprador_email !== email,
    motivo:
      Number(c.aprovado) !== 1
        ? 'pagamento não aprovado'
        : Number(c.ausente) === 1
          ? 'ausente da última planilha'
          : c.comprador_email === email
            ? 'compra do próprio indicador'
            : null,
  }));

  return json({
    email,
    primeiro_nome: indicador.primeiro_nome,
    nome_completo: indicador.nome_completo || indicador.primeiro_nome,
    compras,
  });
}
