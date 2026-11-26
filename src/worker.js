// Worker do Agente de Vendas
// - /api/ptax       -> cotação PTAX do Banco Central (público)
// - /api/auth/*     -> criar conta, entrar, sair, recuperar senha
// - /api/vendas     -> vendas do usuário logado
// - o resto         -> arquivos estáticos da pasta public/

import { ptax } from "./ptax.js";
import { rotasAuth, usuarioDaSessao } from "./auth.js";
import { rotasVendas } from "./vendas.js";
import { garantirEsquema } from "./db.js";
import { erro, HttpError } from "./util.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const caminho = url.pathname;

    if (!caminho.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (caminho === "/api/ptax") {
      return request.method === "GET" ? ptax() : erro("Método não permitido.", 405);
    }

    try {
      // Proteção contra requisições vindas de outros sites
      if (request.method !== "GET") {
        const origem = request.headers.get("origin");
        if (origem && new URL(origem).host !== url.host) return erro("Origem não permitida.", 403);
      }

      await garantirEsquema(env);

      if (caminho.startsWith("/api/auth/")) {
        const r = await rotasAuth(request, env, ctx, caminho);
        if (r) return r;
      }

      if (caminho === "/api/vendas" || caminho.startsWith("/api/vendas/")) {
        const user = await usuarioDaSessao(request, env);
        if (!user) return erro("Sua sessão expirou. Entre novamente.", 401);
        const r = await rotasVendas(request, env, user, caminho);
        if (r) return r;
      }

      return erro("Rota não encontrada.", 404);
    } catch (e) {
      if (e instanceof HttpError) return erro(e.message, e.status);
      console.error(e);
      return erro("Erro interno. Tente de novo em instantes.", 500);
    }
  },
};
