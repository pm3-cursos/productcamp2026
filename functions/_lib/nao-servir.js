// Resposta 404 para arquivos do repositório que o Pages serviria como
// estáticos mas não são parte do site: testes, script de sincronização,
// schema e documentação interna. Só os caminhos listados em _routes.json
// chegam aqui — o resto do site continua 100% estático.

export function naoServir() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
