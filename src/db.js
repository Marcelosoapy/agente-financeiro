// Estrutura do banco D1. As tabelas são criadas na primeira requisição
// (CREATE TABLE IF NOT EXISTS), então não é preciso rodar migração à mão.

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     nome TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     senha_hash TEXT NOT NULL,
     criado_em INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL,
     expira_em INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS reset_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL,
     criado_em INTEGER NOT NULL,
     expira_em INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS login_falhas (
     email TEXT PRIMARY KEY,
     tentativas INTEGER NOT NULL DEFAULT 0,
     bloqueado_ate INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS vendas (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     data TEXT NOT NULL,
     produto TEXT NOT NULL,
     categoria TEXT NOT NULL DEFAULT '',
     qtd INTEGER NOT NULL,
     compra REAL NOT NULL,
     venda REAL NOT NULL,
     venda_base REAL NOT NULL,
     margem REAL NOT NULL DEFAULT 0,
     comissao_pct REAL NOT NULL DEFAULT 0,
     comissao REAL NOT NULL DEFAULT 0,
     obs TEXT NOT NULL DEFAULT '',
     input_mode TEXT NOT NULL DEFAULT 'brl',
     dolar REAL,
     rate_used REAL,
     criado_em INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_vendas_user_data ON vendas(user_id, data)`,
];

let pronto = null;

export function garantirEsquema(env) {
  if (!env.DB) throw new Error("Banco D1 não configurado (binding DB ausente).");
  if (!pronto) {
    pronto = env.DB.batch(ESQUEMA.map((sql) => env.DB.prepare(sql))).catch((e) => {
      pronto = null;
      throw e;
    });
  }
  return pronto;
}
