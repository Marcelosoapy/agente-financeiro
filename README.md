# Agente de Vendas

Painel web com login para anotar vendas e acompanhar resultados: preço de compra e de venda (em R$ ou em US$), margem de negociação, comissão, lucro bruto e líquido, métricas por período e gráficos. A cotação do dólar vem da **PTAX oficial do Banco Central**, atualizada automaticamente.

Feito para rodar no **Cloudflare Workers** (plano gratuito).

---

## 1. Escopo do projeto

**Objetivo:** dar a um vendedor ou pequena loja uma ferramenta única para registrar cada venda e saber, na hora, quanto ganhou de verdade depois do custo e da comissão, inclusive em operações cotadas em dólar.

**Dentro do escopo**

| Área | O que faz |
|---|---|
| Contas de cliente | Criar conta, entrar e sair com e-mail e senha; recuperação de senha por e-mail |
| Registro de vendas | Produto, categoria, quantidade, data, observações; salvas na conta do cliente |
| Preços em R$ | Compra e venda em reais, com o equivalente em US$ pela PTAX |
| Preços em US$ | Compra e venda em dólar, convertidas para R$ pela PTAX ou por um dólar informado |
| Margem de negociação | % somada sobre o preço de venda para chegar à venda final |
| Comissão | % calculada sobre a receita final da venda (venda final × quantidade) |
| Cotação do dólar | PTAX de venda do Banco Central, boletim mais recente, atualizada a cada 2 min |
| Métricas | Receita, custo, comissões, lucro líquido, ticket médio, melhor margem |
| Filtros | Tudo, hoje, 7 dias, 30 dias, mês atual ou intervalo de datas |
| Gráficos | Receita por dia (custo + comissão + lucro), divisão da receita, receita e comissão por categoria |
| Funil de produtos | Ranking dos produtos que mais vendem no período, por quantidade, receita ou lucro líquido |
| Histórico | Busca, ordenação (data, lucro, receita, comissão) e exclusão |

**Fora do escopo (nesta versão)**

- Equipes (várias pessoas na mesma conta) e níveis de acesso
- Editar uma venda já registrada (hoje: excluir e registrar de novo)
- Emissão de nota fiscal, controle de estoque, exportação de relatórios

**Possíveis próximas etapas:** editar vendas, exportação CSV/Excel, trocar senha e e-mail logado, metas mensais, login com Google.

---

## 2. Regras de cálculo

| Item | Fórmula |
|---|---|
| Conversão US$ → R$ | valor em US$ × dólar usado (PTAX de venda com 2 casas decimais, cortando as casas extras e arredondando para cima quando elas forem 90 ou mais: 5,7750 → 5,77; 5,7790 → 5,78; ou o valor informado) |
| Venda final (unitária) | preço de venda × (1 + margem de negociação %) |
| Receita da venda | venda final × quantidade |
| Custo da venda | preço de compra × quantidade |
| Lucro bruto | receita − custo |
| Comissão | receita × comissão % |
| Lucro líquido | lucro bruto − comissão |
| Margem sobre compra | (venda final − compra) ÷ compra |
| Ticket médio | receita do período ÷ número de vendas do período |

Cada venda guarda também o dólar usado na conversão, para o histórico não mudar quando a cotação mudar.

---

## 3. Cotação PTAX

- O Worker (`src/worker.js`) responde em `/api/ptax`. A rota, em `src/ptax.js`, consulta a API oficial do Banco Central (Olinda, recurso `CotacaoMoedaDia`).
- Ela devolve o **boletim mais recente** do dia (abertura, intermediários ou fechamento). Antes do primeiro boletim, em fins de semana e feriados, usa o último dia útil.
- O Banco Central publica cerca de 5 boletins por dia, entre 10h e 13h. Fora desse horário o valor fica igual ao do último boletim, e isso é o comportamento correto.
- Se a rota não responder, a página tenta o Banco Central diretamente. Se nada funcionar, dá para informar a cotação manualmente pelo lápis no cartão do dólar.

Indicador no cartão: **verde** = PTAX ao vivo · **laranja** = cotação manual · **vermelho** = sem cotação.

---

## 4. Estrutura dos arquivos

```
agente-financeiro/
├── public/
│   └── index.html        # o painel completo (HTML, CSS e JavaScript)
├── src/
│   ├── worker.js         # Worker: roteia /api/* e serve o painel
│   ├── auth.js           # contas: criar, entrar, sair, esqueci e redefinir senha
│   ├── vendas.js         # vendas do usuário logado (listar, criar, excluir)
│   ├── db.js             # tabelas do banco D1 (criadas sozinhas no 1º acesso)
│   ├── email.js          # e-mail de recuperação de senha (Resend)
│   ├── ptax.js           # busca a PTAX no Banco Central
│   └── util.js           # funções auxiliares
├── wrangler.toml         # configuração do Worker no Cloudflare
├── .gitignore
└── README.md
```

Não há etapa de build: o Cloudflare publica os arquivos como estão. O único recurso externo é a biblioteca de gráficos Chart.js (via cdnjs).

---

## 5. Publicar no Cloudflare Workers

### Opção A: pelo GitHub (recomendada, publica sozinho a cada alteração)

1. No Cloudflare: **Workers & Pages → Create → Import a repository** e escolha `Marcelosoapy/agente-financeiro`.
2. Configuração:
   - Project name: `agente-financeiro` (igual ao `name` do `wrangler.toml`)
   - Build command: *(deixe vazio)*
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
3. Clique em **Deploy**. Em cerca de 1 minuto o site estará em `https://agente-financeiro.SEU-SUBDOMINIO.workers.dev`.

No primeiro deploy, o Cloudflare **cria sozinho o banco D1** `agente-financeiro-db` (o `wrangler.toml` declara o banco sem ID, e o Wrangler o provisiona). As tabelas são criadas na primeira vez que alguém usa o site.

Cada `push` na branch `main` publica uma nova versão automaticamente.

### Opção B: pelo terminal (Wrangler)

Precisa do Node.js instalado.

```bash
git clone https://github.com/Marcelosoapy/agente-financeiro.git
cd agente-financeiro
npx wrangler login
npx wrangler deploy
```

Para testar no computador antes de publicar: `npx wrangler dev` e abra `http://localhost:8787`.

---

## 6. Recuperação de senha por e-mail (configurar uma vez)

O link de "Esqueci minha senha" é enviado pelo **Resend** (resend.com, plano gratuito com 3.000 e-mails/mês). Sem essa configuração o site funciona normalmente, mas a tela de recuperação avisa o cliente que a recuperação ainda não foi ativada.

1. Crie uma conta em **resend.com**.
2. Em **Domains**, adicione o seu domínio (ex.: `suaempresa.com.br`) e cadastre os registros DNS que o Resend mostrar. Se o domínio já está no Cloudflare, o Resend oferece configurar automaticamente. **Sem domínio verificado o Resend só entrega e-mails para o seu próprio endereço**, então os clientes não receberiam o link.
3. Em **API Keys**, crie uma chave com permissão de envio e copie (começa com `re_`).
4. No Cloudflare: **Workers & Pages → agente-financeiro → Settings → Variables and Secrets → Add**:
   - Type: **Secret** · Name: `RESEND_API_KEY` · Value: a chave do passo 3.
5. No `wrangler.toml` do repositório, preencha o remetente com um endereço do domínio verificado:
   ```toml
   MAIL_FROM = "Agente de Vendas <nao-responda@suaempresa.com.br>"
   ```
   Faça o commit: o Cloudflare publica sozinho.

Como funciona: o link vale **1 hora**, só pode ser usado **uma vez**, no máximo um e-mail por minuto por conta, e ao trocar a senha todas as sessões abertas são encerradas. A resposta da tela é a mesma exista o e-mail ou não, para ninguém descobrir quais e-mails têm conta.

Alternativa: o **Email Sending** do próprio Cloudflare também serve, mas para enviar a qualquer destinatário exige o plano Workers Paid.

---

## 7. Conferir se está funcionando

1. Abra `https://agente-financeiro.SEU-SUBDOMINIO.workers.dev/api/ptax`. Deve aparecer algo como:
   ```json
   {"fonte":"Banco Central do Brasil - PTAX","venda":5.3338,"compra":5.3332,"boletim":"Fechamento","dataHora":"2026-11-25 13:09:28.123","boletinsDoDia":5}
   ```
2. Abra o site: aparece a tela **Entrar**. Clique em **Criar conta**, cadastre-se e registre uma venda.
3. Saia, entre de novo (ou abra em outro aparelho) e confira que a venda continua lá.
4. Depois de configurar o e-mail, teste **Esqueci minha senha** com a sua conta.

---

## 8. Segurança e dados

- **Senhas:** nunca são guardadas. O banco guarda só um hash PBKDF2-SHA256 (100.000 iterações, sal aleatório por usuário).
- **Sessão:** cookie `HttpOnly`, `Secure` e `SameSite=Lax`, válido por 30 dias. O banco guarda só o hash do token. "Sair" encerra a sessão no servidor.
- **Tentativas de login:** após 5 senhas erradas seguidas, aquele e-mail fica bloqueado por 15 minutos.
- **Isolamento:** cada cliente só lê e exclui as próprias vendas; o servidor confere o dono em toda operação e recalcula a comissão.
- **Outros sites:** pedidos que alteram dados vindos de outra origem são recusados.
- **Onde ficam os dados:** no banco D1 da sua conta Cloudflare (**Storage & Databases → D1 → agente-financeiro-db**), onde dá para consultar e fazer backup (o Time Travel permite voltar o banco a um momento anterior: 7 dias no plano gratuito, 30 no pago).
- **Apagar a conta de um cliente** (pelo console do D1):
  ```sql
  DELETE FROM vendas   WHERE user_id = (SELECT id FROM users WHERE email = 'cliente@email.com');
  DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'cliente@email.com');
  DELETE FROM users    WHERE email = 'cliente@email.com';
  ```

---

## 9. API (referência)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/ptax` | Cotação PTAX mais recente (pública) |
| POST | `/api/auth/signup` | `{nome, email, senha}` cria a conta e entra |
| POST | `/api/auth/login` | `{email, senha}` |
| POST | `/api/auth/logout` | Encerra a sessão |
| GET | `/api/auth/me` | Usuário logado |
| POST | `/api/auth/forgot` | `{email}` envia o link de recuperação |
| POST | `/api/auth/reset` | `{token, senha}` define a nova senha |
| GET | `/api/vendas` | Vendas do usuário logado |
| POST | `/api/vendas` | `{produto, categoria, qtd, compra, vendaBase, margem, comissaoPct, data, obs, inputMode, dolar, rateUsed}` |
| DELETE | `/api/vendas/:id` | Exclui uma venda do usuário |

---

## 10. Personalizar

- **Tema claro/escuro:** botão de sol/lua no cabeçalho e na tela de login. A escolha fica salva no navegador; sem escolha, segue o tema do sistema.
- **Casas decimais da PTAX:** em `public/index.html`, função `duasCasas`.
- **Intervalo de atualização da PTAX:** em `public/index.html`, procure `setInterval(updateRate, 120000)` (120000 ms = 2 min).
- **Cache da cotação:** em `src/ptax.js`, `max-age=60` e `cacheTtl: 60` (segundos).
- **Cores dos gráficos:** procure `#94a3b8` (custo), `#f59e0b` (comissão), `#22c55e` (lucro) e `#3b82f6` (receita) em `public/index.html`.
