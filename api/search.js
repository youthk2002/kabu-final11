export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { q } = req.query;
  if (!q || q.length < 1) return res.status(200).json({ results: [] });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ja&region=JP&quotesCount=8&newsCount=0&listsCount=0`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (!r.ok) throw new Error("fetch error");
    const data = await r.json();
    const quotes = data?.quotes || [];
    const results = quotes
      .filter(q => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
      .map(q => ({
        symbol:   q.symbol,
        name:     q.longname || q.shortname || q.symbol,
        exchange: q.exchange,
        market:   q.symbol.endsWith(".T") ? "JP" : "US",
      }))
      .slice(0, 6);
    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message, results: [] });
  }
}
