// Respostas HTTP padronizadas da API.

const BASE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export function json(dados, status = 200, extras = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...BASE, ...extras },
  });
}

export function erro(codigo, mensagem, status = 400, extras = {}) {
  return json({ erro: codigo, mensagem }, status, extras);
}

/** Erro 500 com log no console do Worker e sem vazar detalhe interno. */
export function falha(e, contexto) {
  console.error(`[indicacao] ${contexto}:`, e && e.stack ? e.stack : e);
  return erro(
    'falha_interna',
    'Algo deu errado do nosso lado. Tente de novo em instantes.',
    500
  );
}
