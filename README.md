# Agente de Vendas

Painel web para anotar vendas e acompanhar resultados: preço de compra e de venda (em R$ ou em US$), margem de negociação, comissão, lucro bruto e líquido, métricas por período e gráficos. A cotação do dólar vem da **PTAX oficial do Banco Central**, atualizada automaticamente.

Feito para rodar no **Cloudflare Workers** (plano gratuito).

---

## 1. Escopo do projeto

**Objetivo:** dar a um vendedor ou pequena loja uma ferramenta única para registrar cada venda e saber, na hora, quanto ganhou de verdade depois do custo e da comissão, inclusive em operações cotadas em dólar.

**Dentro do escopo**

| Área | O que faz |
|---|---|
| Registro de vendas | Produto, categoria, quantidade, data, observações |
| Preços em R$ | Compra e venda em reais, com o equivalente em US$ pela PTAX |
| Preços em US$ | Compra e venda em dólar, convertidas para R$ pela PTAX ou por um dólar informado |
| Margem de negociação | % somada sobre o preço de venda para chegar à venda final |
| Comissão | % calculada sobre a receita final da venda (venda final × quantidade) |
| Cotação do dólar | PTAX de venda do Banco Central, boletim mais recente, atualizada a cada 2 min |
| Métricas | Receita, custo, comissões, lucro líquido, ticket médio, melhor margem |
| Filtros | Tudo, hoje, 7 dias, 30 dias, mês atual ou intervalo de datas |
| Gráficos | Receita por dia (custo + comissão + lucro), divisão da receita, receita e comissão por categoria |
| Histórico | Busca, ordenação (data, lucro, receita, comissão) e exclusão |

**Fora do escopo (nesta versão)**

- Login e múltiplos usuários
- Sincronizar vendas entre aparelhos (os dados ficam no navegador de cada aparelho)
- Emissão de nota fiscal, controle de estoque, exportação de relatórios

**Possíveis próximas etapas:** banco de dados online (ex.: Cloudflare D1) para sincronizar aparelhos, exportação CSV/Excel, login, metas mensais.

---

## 2. Regras de cálculo

| Item | Fórmula |
|---|---|
| Conversão US$ → R$ | valor em US$ × dólar usado (PTAX de venda ou valor informado) |
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
│   ├── worker.js         # Worker: serve o painel e a rota /api/ptax
│   └── ptax.js           # busca a PTAX no Banco Central
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

## 6. Conferir se está funcionando

1. Abra `https://agente-financeiro.SEU-SUBDOMINIO.workers.dev/api/ptax`. Deve aparecer algo como:
   ```json
   {"fonte":"Banco Central do Brasil - PTAX","venda":5.3338,"compra":5.3332,"boletim":"Fechamento","dataHora":"2026-11-25 13:09:28.123","boletinsDoDia":5}
   ```
2. Abra o site: o ponto do cartão do dólar deve ficar **verde**, com o tipo e o horário do boletim.

---

## 7. Dados e privacidade

- As vendas ficam salvas no **navegador** (localStorage) de quem usa. Nada é enviado a servidores.
- Limpar os dados do navegador apaga as vendas. Cada aparelho e cada navegador têm o seu próprio histórico.
- Na primeira abertura aparecem vendas de exemplo. Exclua-as pelo Histórico.
- O link do site é público: quem tiver o endereço consegue abrir o painel, mas só vê as vendas do próprio navegador.

---

## 8. Personalizar

- **Intervalo de atualização da PTAX:** em `public/index.html`, procure `setInterval(updateRate, 120000)` (120000 ms = 2 min).
- **Cache da cotação:** em `src/ptax.js`, `max-age=60` e `cacheTtl: 60` (segundos).
- **Cores dos gráficos:** procure `#94a3b8` (custo), `#f59e0b` (comissão), `#22c55e` (lucro) e `#3b82f6` (receita) em `public/index.html`.
