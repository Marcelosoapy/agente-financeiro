// Utilitários compartilhados pelas rotas da API

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export const erro = (mensagem, status = 400, headers = {}) => json({ erro: mensagem }, status, headers);

export class HttpError extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// Lê o corpo JSON da requisição (máx. 20 KB)
export async function lerJson(request) {
  const tipo = request.headers.get("content-type") || "";
  if (!tipo.includes("application/json")) throw new HttpError(415, "Envie os dados em JSON.");
  const texto = await request.text();
  if (texto.length > 20000) throw new HttpError(413, "Dados grandes demais.");
  try {
    const obj = JSON.parse(texto || "{}");
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error();
    return obj;
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function tokenAleatorio() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return hex(a.buffer);
}

export async function sha256(texto) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(texto)));
}

export function lerCookie(request, nome) {
  const cab = request.headers.get("cookie") || "";
  for (const parte of cab.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return null;
}
