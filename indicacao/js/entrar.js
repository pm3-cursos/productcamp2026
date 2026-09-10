// Consome o token do link mágico.
//
// A troca é feita por POST a partir desta página, e não por um GET direto no
// endpoint: clientes de e-mail e antivírus corporativos abrem os links das
// mensagens para inspecionar, e isso queimaria um token de uso único antes
// de a pessoa clicar.

import { $, api, mensagemDeErro } from './comum.js';

const parametros = new URLSearchParams(window.location.search);
const token = parametros.get('t') || '';

function falhar(mensagem) {
  $('#titulo').textContent = 'Não conseguimos entrar';
  $('#mensagem').textContent = mensagem;
  $('#voltar').classList.remove('oculto');
}

async function entrar() {
  if (!token) {
    falhar('Este endereço não tem um link de acesso válido.');
    return;
  }

  const resultado = await api('/api/auth/verificar', { method: 'POST', body: { token } });

  if (!resultado.ok) {
    falhar(mensagemDeErro(resultado, 'Este link não é válido. Peça um novo acesso.'));
    return;
  }

  // Limpa o token da barra de endereço antes de seguir.
  window.history.replaceState({}, '', '/indicacao/entrar/');
  window.location.replace(resultado.dados.destino || '/indicacao/minha-pagina/');
}

entrar();
