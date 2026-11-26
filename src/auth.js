// Contas: criar conta, entrar, sair, sessão atual, esqueci a senha e redefinir senha.
// Senhas: PBKDF2-SHA256 com sal aleatório. Sessão: cookie HttpOnly com token aleatório;
// o banco guarda só o hash SHA-256 do token (vale também para os links de recuperação).

import { json, erro, lerJson, HttpError, tokenAleatorio, sha256, lerCookie } from "./util.js";
import { emailConfigurado, enviarEmailRecuperacao } from "./email.js";

const ITERACOES = 100000; // limite máximo do PBKDF2 no Cloudflare Workers
const SESSAO_DIAS = 30;
const RESET_MINUTOS = 60;
const MAX_FALHAS = 5;
const BLOQUEIO_MINUTOS = 15;

const enc = new TextEncoder();
const paraB64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, 256);
  return new Uint8Array(bits);
}

async function gerarHashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${paraB64(sal)}$${paraB64(h)}`;
}

async function conferirSenha(senha, armazenado) {
  const [alg, it, sal, h] = String(armazenado).split("$");
  if (alg !== "pbkdf2") return false;
  const calculado = await pbkdf2(senha, deB64(sal), Number(it));
  const esperado = deB64(h);
  if (calculado.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < calculado.length; i++) dif |= calculado[i] ^ esperado[i];
  return dif === 0;
}

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar isso
const HASH_FALSO = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// ── validação ──────────────────────────────────────────
const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
const emailValido = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8) throw new HttpError(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (senha.length > 200) throw new HttpError(400, "A senha pode ter no máximo 200 caracteres.");
}

// ── sessão ─────────────────────────────────────────────
function cookieSessao(request, token, maxAge) {
  const seguro = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `sid=${token}; Path=/; HttpOnly;${seguro} SameSite=Lax; Max-Age=${maxAge}`;
}

async function criarSessao(env, request, userId) {
  const token = tokenAleatorio();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expira_em) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, Date.now() + SESSAO_DIAS * 86400000)
    .run();
  return cookieSessao(request, token, SESSAO_DIAS * 86400);
}

export async function usuarioDaSessao(request, env) {
  const token = lerCookie(request, "sid");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT u.id, u.nome, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expira_em > ?`
  )
    .bind(await sha256(token), Date.now())
    .first();
}

const publico = (u) => ({ id: u.id, nome: u.nome, email: u.email });

// ── rotas ──────────────────────────────────────────────
async function criarConta(request, env) {
  const d = await lerJson(request);
  const nome = String(d.nome || "").trim().slice(0, 80);
  const email = normalizarEmail(d.email);
  if (!nome) throw new HttpError(400, "Informe seu nome.");
  if (!emailValido(email)) throw new HttpError(400, "Informe um e-mail válido.");
  validarSenha(d.senha);

  const existe = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existe) throw new HttpError(409, "Já existe uma conta com este e-mail. Entre ou recupere a senha.");

  const hash = await gerarHashSenha(d.senha);
  const u = await env.DB.prepare("INSERT INTO users (nome, email, senha_hash, criado_em) VALUES (?, ?, ?, ?) RETURNING id, nome, email")
    .bind(nome, email, hash, Date.now())
    .first();
  const cookie = await criarSessao(env, request, u.id);
  return json({ usuario: publico(u) }, 201, { "set-cookie": cookie });
}

async function entrar(request, env) {
  const d = await lerJson(request);
  const email = normalizarEmail(d.email);
  const senha = typeof d.senha === "string" ? d.senha : "";
  if (!email || !senha) throw new HttpError(400, "Informe e-mail e senha.");

  const agora = Date.now();
  const falhas = await env.DB.prepare("SELECT tentativas, bloqueado_ate FROM login_falhas WHERE email = ?").bind(email).first();
  if (falhas && falhas.bloqueado_ate > agora) {
    const min = Math.ceil((falhas.bloqueado_ate - agora) / 60000);
    throw new HttpError(429, `Muitas tentativas erradas. Tente de novo em ${min} minuto(s) ou recupere a senha.`);
  }

  const u = await env.DB.prepare("SELECT id, nome, email, senha_hash FROM users WHERE email = ?").bind(email).first();
  const ok = await conferirSenha(senha, u ? u.senha_hash : HASH_FALSO);

  if (!u || !ok) {
    const r = await env.DB.prepare(
      `INSERT INTO login_falhas (email, tentativas, bloqueado_ate) VALUES (?, 1, 0)
       ON CONFLICT(email) DO UPDATE SET tentativas = tentativas + 1 RETURNING tentativas`
    )
      .bind(email)
      .first();
    if (r && r.tentativas >= MAX_FALHAS) {
      await env.DB.prepare("UPDATE login_falhas SET tentativas = 0, bloqueado_ate = ? WHERE email = ?")
        .bind(agora + BLOQUEIO_MINUTOS * 60000, email)
        .run();
      throw new HttpError(429, `Muitas tentativas erradas. Tente de novo em ${BLOQUEIO_MINUTOS} minutos ou recupere a senha.`);
    }
    throw new HttpError(401, "E-mail ou senha incorretos.");
  }

  await env.DB.prepare("DELETE FROM login_falhas WHERE email = ?").bind(email).run();
  // limpeza ocasional de sessões vencidas
  await env.DB.prepare("DELETE FROM sessions WHERE expira_em < ?").bind(agora).run();
  const cookie = await criarSessao(env, request, u.id);
  return json({ usuario: publico(u) }, 200, { "set-cookie": cookie });
}

async function sair(request, env) {
  const token = lerCookie(request, "sid");
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": cookieSessao(request, "", 0) });
}

async function eu(request, env) {
  const u = await usuarioDaSessao(request, env);
  if (!u) return erro("Não autenticado.", 401);
  return json({ usuario: publico(u), recuperacaoPorEmail: emailConfigurado(env) });
}

async function esqueciSenha(request, env, ctx) {
  const d = await lerJson(request);
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new HttpError(400, "Informe um e-mail válido.");

  // A resposta é sempre a mesma, exista a conta ou não
  const resposta = json({
    ok: true,
    emailConfigurado: emailConfigurado(env),
    mensagem: "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.",
  });
  if (!emailConfigurado(env)) return resposta;

  const u = await env.DB.prepare("SELECT id, nome, email FROM users WHERE email = ?").bind(email).first();
  if (!u) return resposta;

  const agora = Date.now();
  const recente = await env.DB.prepare("SELECT 1 FROM reset_tokens WHERE user_id = ? AND criado_em > ?")
    .bind(u.id, agora - 60000)
    .first();
  if (recente) return resposta; // no máximo um e-mail por minuto

  const token = tokenAleatorio();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reset_tokens WHERE user_id = ? OR expira_em < ?").bind(u.id, agora),
    env.DB.prepare("INSERT INTO reset_tokens (token_hash, user_id, criado_em, expira_em) VALUES (?, ?, ?, ?)").bind(
      await sha256(token),
      u.id,
      agora,
      agora + RESET_MINUTOS * 60000
    ),
  ]);

  const link = `${new URL(request.url).origin}/?reset=${token}`;
  const envio = enviarEmailRecuperacao(env, { para: u.email, nome: u.nome, link }).catch((e) =>
    console.error("Falha ao enviar e-mail de recuperação:", e.message)
  );
  if (ctx && ctx.waitUntil) ctx.waitUntil(envio);
  else await envio;
  return resposta;
}

async function redefinirSenha(request, env) {
  const d = await lerJson(request);
  const token = String(d.token || "");
  validarSenha(d.senha);
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, "Link de recuperação inválido.");

  const agora = Date.now();
  const r = await env.DB.prepare("SELECT user_id FROM reset_tokens WHERE token_hash = ? AND expira_em > ?")
    .bind(await sha256(token), agora)
    .first();
  if (!r) throw new HttpError(400, "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".");

  const hash = await gerarHashSenha(d.senha);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET senha_hash = ? WHERE id = ?").bind(hash, r.user_id),
    env.DB.prepare("DELETE FROM reset_tokens WHERE user_id = ?").bind(r.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(r.user_id), // encerra sessões antigas
  ]);
  const u = await env.DB.prepare("SELECT id, nome, email FROM users WHERE id = ?").bind(r.user_id).first();
  await env.DB.prepare("DELETE FROM login_falhas WHERE email = ?").bind(u.email).run();
  const cookie = await criarSessao(env, request, u.id);
  return json({ usuario: publico(u) }, 200, { "set-cookie": cookie });
}

export async function rotasAuth(request, env, ctx, caminho) {
  const m = request.method;
  if (caminho === "/api/auth/me" && m === "GET") return eu(request, env);
  if (caminho === "/api/auth/signup" && m === "POST") return criarConta(request, env);
  if (caminho === "/api/auth/login" && m === "POST") return entrar(request, env);
  if (caminho === "/api/auth/logout" && m === "POST") return sair(request, env);
  if (caminho === "/api/auth/forgot" && m === "POST") return esqueciSenha(request, env, ctx);
  if (caminho === "/api/auth/reset" && m === "POST") return redefinirSenha(request, env);
  return null;
}
