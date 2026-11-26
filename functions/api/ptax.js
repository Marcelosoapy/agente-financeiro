// Cloudflare Pages Function: GET /api/ptax
// Busca a PTAX do dólar (USD/BRL) na API oficial do Banco Central (Olinda)
// e devolve o boletim mais recente. Se o dia ainda não tem boletim
// (antes das 10h, fim de semana ou feriado), volta até 8 dias.

const BCB =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
  "CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)" +
  "?@moeda='USD'&@dataCotacao='%DATA%'&$format=json";

const pad = (n) => String(n).padStart(2, "0");

// Data no fuso de Brasília (UTC-3, sem horário de verão desde 2019)
function dataBrasilia(diasAtras) {
  const d = new Date(Date.now() - 3 * 3600 * 1000 - diasAtras * 86400 * 1000);
  return pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "-" + d.getUTCFullYear();
}

function json(body, status = 200, maxAge = 60) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? `public, max-age=${maxAge}` : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestGet() {
  try {
    for (let i = 0; i < 8; i++) {
      const url = BCB.replace("%DATA%", dataBrasilia(i));
      const r = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
      if (!r.ok) throw new Error("BCB respondeu " + r.status);
      const data = await r.json();
      const lista = data && data.value;
      if (lista && lista.length) {
        const ultimo = lista[lista.length - 1];
        return json({
          fonte: "Banco Central do Brasil - PTAX",
          venda: ultimo.cotacaoVenda,
          compra: ultimo.cotacaoCompra,
          boletim: ultimo.tipoBoletim,
          dataHora: ultimo.dataHoraCotacao,
          boletinsDoDia: lista.length,
        });
      }
    }
    return json({ erro: "Nenhum boletim PTAX encontrado nos últimos 8 dias" }, 404);
  } catch (e) {
    return json({ erro: "Falha ao consultar o Banco Central", detalhe: String(e.message || e) }, 502);
  }
}
