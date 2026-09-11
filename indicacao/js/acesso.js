// Tela de acesso: dispara o link mágico. O e-mail digitado nunca autentica
// por si só — quem entra é quem clica no link recebido na caixa de entrada.

import { $, api, esc, mensagemDeErro } from './comum.js';

const MOTIVOS = {
  restrito: 'Essa área é restrita ao time PM3. Entre com o seu e-mail para continuar.',
  sessao: 'Sua sessão expirou. Peça um novo link de acesso.',
  saiu: 'Você saiu da sua página. Peça um novo link quando quiser voltar.',
};

const form = $('#form-acesso');
const campoEmail = $('#email');
const botao = $('#botao-acessar');
const aviso = $('#aviso');
const etapaForm = $('#etapa-form');
const etapaEnviado = $('#etapa-enviado');

function mostrarAviso(texto, tipo = 'erro') {
  aviso.textContent = texto;
  aviso.className = `aviso aviso-${tipo === 'ok' ? 'ok' : 'erro'}`;
}

function esconderAviso() {
  aviso.className = 'aviso aviso-erro oculto';
  aviso.textContent = '';
}

// Mensagem de contexto quando a pessoa foi mandada para cá por um guarda.
const motivo = new URLSearchParams(window.location.search).get('motivo');
if (motivo && MOTIVOS[motivo]) mostrarAviso(MOTIVOS[motivo]);

// Se já existe sessão válida, vai direto para a página certa.
api('/api/auth/sessao').then((resultado) => {
  if (resultado.ok && resultado.dados.autenticado && resultado.dados.destino) {
    window.location.replace(resultado.dados.destino);
  }
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  esconderAviso();

  const email = campoEmail.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    mostrarAviso('Confira o e-mail digitado.');
    campoEmail.focus();
    return;
  }

  botao.disabled = true;
  botao.textContent = 'Enviando link…';

  const resultado = await api('/api/auth/solicitar', { method: 'POST', body: { email } });

  botao.disabled = false;
  botao.textContent = 'Acessar minha página';

  if (!resultado.ok) {
    mostrarAviso(mensagemDeErro(resultado, 'Não foi possível enviar o link agora.'));
    return;
  }

  $('#email-enviado').textContent = email;
  $('#minutos').textContent = String(resultado.dados.minutos || 20);

  // Só aparece em desenvolvimento local, quando o e-mail não é realmente enviado.
  if (resultado.dados.link_dev) {
    $('#link-dev-box').innerHTML = `Modo de desenvolvimento — <a href="${esc(
      resultado.dados.link_dev
    )}">abrir o link de acesso</a>.`;
    $('#link-dev-box').classList.remove('oculto');
  }

  etapaForm.classList.add('oculto');
  etapaEnviado.classList.remove('oculto');
});

$('#tentar-outro').addEventListener('click', () => {
  etapaEnviado.classList.add('oculto');
  etapaForm.classList.remove('oculto');
  esconderAviso();
  campoEmail.value = '';
  campoEmail.focus();
});
