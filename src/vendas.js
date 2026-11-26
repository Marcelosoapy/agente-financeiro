// Vendas de cada usuário: listar, criar e excluir.
// O servidor recalcula a comissão e confere os valores; cada usuário só vê as próprias vendas.

import { json, erro, lerJson, HttpError } from "./util.js";

const numero = (v, nome, { min = 0, max = 1e9, obrigatorio = true } = {}) => {
  if ((v === null || v === undefined || v === "") && !obrigatorio) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Valor inválido em ${nome}.`);
  return n;
};
const arred = (n) => Math.round(n * 1e6) / 1e6;
const texto = (v, max) => String(v ?? "").trim().slice(0, max);

const paraCliente = (r) => ({
  id: r.id,
  data: r.data,
  produto: r.produto,
  categoria: r.categoria,
  qtd: r.qtd,
  compra: r.compra,
  venda: r.venda,
  vendaBase: r.venda_base,
  margem: r.margem || null,
  comissaoPct: r.comissao_pct,
  comissao: r.comissao,
  obs: r.obs,
  inputMode: r.input_mode,
  dolar: r.dolar,
  rateUsed: r.rate_used,
});

async function listar(env, user) {
  const { results } = await env.DB.prepare("SELECT * FROM vendas WHERE user_id = ? ORDER BY data DESC, id DESC")
    .bind(user.id)
    .all();
  return json({ vendas: results.map(paraCliente) });
}

async function criar(request, env, user) {
  const d = await lerJson(request);
  const produto = texto(d.produto, 120);
  if (!produto) throw new HttpError(400, "Informe o produto.");
  const data = texto(d.data, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) throw new HttpError(400, "Data inválida.");

  const qtd = Math.round(numero(d.qtd, "quantidade", { min: 1, max: 1e6 }));
  const compra = numero(d.compra, "preço de compra", { min: 0.000001 });
  const vendaBase = numero(d.vendaBase, "preço de venda", { min: 0.000001 });
  const margem = numero(d.margem ?? 0, "margem", { max: 1000 });
  const comissaoPct = numero(d.comissaoPct ?? 0, "comissão", { max: 100 });
  const venda = arred(vendaBase * (1 + margem / 100));
  const comissao = arred((venda * qtd * comissaoPct) / 100);
  const inputMode = d.inputMode === "usd" ? "usd" : "brl";
  const dolar = numero(d.dolar, "dólar", { max: 1000, obrigatorio: false });
  const rateUsed = numero(d.rateUsed, "dólar usado", { max: 1000, obrigatorio: false });

  const r = await env.DB.prepare(
    `INSERT INTO vendas (user_id, data, produto, categoria, qtd, compra, venda, venda_base, margem, comissao_pct,
                         comissao, obs, input_mode, dolar, rate_used, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(user.id, data, produto, texto(d.categoria, 60), qtd, compra, venda, vendaBase, margem, comissaoPct, comissao,
      texto(d.obs, 300), inputMode, dolar, rateUsed, Date.now())
    .first();
  return json({ venda: paraCliente(r) }, 201);
}

async function excluir(env, user, id) {
  const r = await env.DB.prepare("DELETE FROM vendas WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  if (!r.meta.changes) return erro("Venda não encontrada.", 404);
  return json({ ok: true });
}

export async function rotasVendas(request, env, user, caminho) {
  if (caminho === "/api/vendas") {
    if (request.method === "GET") return listar(env, user);
    if (request.method === "POST") return criar(request, env, user);
  }
  const m = caminho.match(/^\/api\/vendas\/(\d+)$/);
  if (m && request.method === "DELETE") return excluir(env, user, Number(m[1]));
  return null;
}
