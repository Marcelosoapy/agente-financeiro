// Worker do Agente de Vendas
// - /api/ptax  -> cotação PTAX do Banco Central (src/ptax.js)
// - o resto    -> arquivos estáticos da pasta public/ (index.html)

import { ptax } from "./ptax.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ptax") {
      if (request.method !== "GET") {
        return new Response("Método não permitido", { status: 405 });
      }
      return ptax();
    }

    return env.ASSETS.fetch(request);
  },
};
