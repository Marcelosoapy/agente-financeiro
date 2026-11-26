// Envio do e-mail de recuperação de senha pela API do Resend (resend.com).
// Configuração no Cloudflare:
//   - segredo RESEND_API_KEY  (Settings → Variables and Secrets → tipo Secret)
//   - variável MAIL_FROM      (no wrangler.toml), ex.: "Agente de Vendas <nao-responda@seudominio.com.br>"

export const emailConfigurado = (env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function enviarEmailRecuperacao(env, { para, nome, link }) {
  const app = env.APP_NAME || "Agente de Vendas";
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a18">
    <h2 style="font-size:20px">Redefinir sua senha</h2>
    <p>Olá, ${escapar(nome)}.</p>
    <p>Recebemos um pedido para redefinir a senha da sua conta no ${escapar(app)}.</p>
    <p style="margin:28px 0">
      <a href="${escapar(link)}" style="background:#1a1a18;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Criar nova senha</a>
    </p>
    <p style="font-size:13px;color:#6b6b66">O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.</p>
    <p style="font-size:12px;color:#a0a09a;word-break:break-all">Se o botão não funcionar, copie este endereço: ${escapar(link)}</p>
  </div>`;
  const texto = `Olá, ${nome}.\n\nPara redefinir sua senha no ${app}, acesse:\n${link}\n\nO link vale por 1 hora. Se você não pediu isso, ignore este e-mail.`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [para], subject: `${app}: redefinir senha`, html, text: texto }),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`Resend respondeu ${r.status}: ${corpo.slice(0, 300)}`);
  }
}
