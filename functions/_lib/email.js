// Envio do link mágico. O provedor é escolhido por variável de ambiente para
// não amarrar a plataforma a um fornecedor: `MAIL_PROVIDER` aceita
// `resend`, `sendgrid` ou `console` (só loga, para desenvolvimento local).

/** Escapa texto para interpolar em HTML de e-mail. */
function esc(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function corpoHtml({ link, primeiroNome, minutos }) {
  const saudacao = primeiroNome ? `Oi, ${esc(primeiroNome)}!` : 'Oi!';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Seu acesso ao Programa de Indicação</title></head>
<body style="margin:0;padding:0;background:#2B1E39;font-family:Helvetica,Arial,sans-serif;color:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2B1E39;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#352843;border-radius:20px;padding:32px">
        <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#18CEF4;font-weight:700">Product Camp 2026</td></tr>
        <tr><td style="font-size:22px;font-weight:800;padding-top:8px">Programa de Indicação</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#d8cfe6;padding-top:16px">
          ${saudacao} Use o botão abaixo para entrar na sua página de indicações.
          O link é de uso único e vale por ${minutos} minutos.
        </td></tr>
        <tr><td align="center" style="padding:26px 0 8px">
          <a href="${esc(link)}" style="display:inline-block;background:#DF0C78;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:10px">Acessar minha página</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#b3a6c9;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);margin-top:18px">
          Se o botão não funcionar, copie e cole este endereço no navegador:<br>
          <span style="color:#18CEF4;word-break:break-all">${esc(link)}</span>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#8b7ea6;padding-top:14px">
          Não pediu este acesso? Ignore este e-mail — sem o link ninguém entra na sua página.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function corpoTexto({ link, primeiroNome, minutos }) {
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : 'Oi!';
  return [
    `${saudacao} Aqui está o seu acesso ao Programa de Indicação do Product Camp 2026.`,
    '',
    link,
    '',
    `O link é de uso único e vale por ${minutos} minutos.`,
    'Não pediu este acesso? Ignore este e-mail.',
  ].join('\n');
}

/**
 * Envia o link mágico. Lança erro se o provedor recusar, para a API poder
 * responder que o envio falhou em vez de fingir sucesso.
 */
export async function enviarLinkMagico(env, { email, link, primeiroNome, minutos }) {
  const provedor = (env.MAIL_PROVIDER || 'console').toLowerCase();
  const remetente = env.MAIL_FROM || 'Product Camp 2026 <indicacao@productcamp.com.br>';
  const assunto = 'Seu acesso ao Programa de Indicação do Product Camp 2026';
  const html = corpoHtml({ link, primeiroNome, minutos });
  const texto = corpoTexto({ link, primeiroNome, minutos });

  if (provedor === 'console') {
    console.log(`[indicacao] link mágico para ${email}: ${link}`);
    return { provedor: 'console' };
  }

  if (provedor === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada.');
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: remetente, to: [email], subject: assunto, html, text: texto }),
    });
    if (!resposta.ok) {
      throw new Error(`Resend respondeu ${resposta.status}: ${await resposta.text()}`);
    }
    return { provedor: 'resend' };
  }

  if (provedor === 'sendgrid') {
    if (!env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY não configurada.');
    const match = remetente.match(/^(.*?)\s*<(.+)>$/);
    const from = match ? { name: match[1], email: match[2] } : { email: remetente };
    const resposta = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from,
        subject: assunto,
        content: [
          { type: 'text/plain', value: texto },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!resposta.ok) {
      throw new Error(`SendGrid respondeu ${resposta.status}: ${await resposta.text()}`);
    }
    return { provedor: 'sendgrid' };
  }

  throw new Error(`MAIL_PROVIDER desconhecido: ${provedor}`);
}
