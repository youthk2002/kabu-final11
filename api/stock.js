export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { symbol, period } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  const periodMap = {
    "1d":  { range: "1d",  interval: "5m"  },
    "1mo": { range: "1mo", interval: "1d"  },
    "3mo": { range: "3mo", interval: "1d"  },
    "6mo": { range: "6mo", interval: "1d"  },
    "1y":  { range: "1y",  interval: "1wk" },
  };
  const p = periodMap[period] || periodMap["3mo"];
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${p.interval}&range=${p.range}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (!r.ok) throw new Error("fetch error");
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("no data");
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const meta = result.meta || {};
    const rows = ts.map((t, i) => ({
      date: (() => {
        const d = new Date(t * 1000);
        if (period === "1d") {
          // JST = UTC+9
          const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return jst.toISOString().slice(0, 16);
        }
        return d.toISOString().slice(0, 10);
      })(),
      open:   q.open?.[i]   ? parseFloat(q.open[i].toFixed(2))   : null,
      high:   q.high?.[i]   ? parseFloat(q.high[i].toFixed(2))   : null,
      low:    q.low?.[i]    ? parseFloat(q.low[i].toFixed(2))    : null,
      close:  q.close?.[i]  ? parseFloat(q.close[i].toFixed(2))  : null,
      volume: q.volume?.[i] || 0,
    })).filter(d => d.close != null);
    res.status(200).json({ rows, meta: { name: meta.longName || meta.shortName || symbol, currency: meta.currency, current: meta.regularMarketPrice, prev: meta.chartPreviousClose } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
