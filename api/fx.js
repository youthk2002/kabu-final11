export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    // Yahoo Finance で USD/JPY を取得
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X?interval=1m&range=1d";
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (!r.ok) throw new Error("fetch error");
    const data = await r.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!rate) throw new Error("no rate");
    res.status(200).json({ rate: parseFloat(rate.toFixed(2)) });
  } catch (e) {
    // フォールバック
    res.status(200).json({ rate: 150.0, fallback: true });
  }
}
