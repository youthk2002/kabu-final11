const STOCKS = [
  { symbol: "7203.T", name: "トヨタ自動車" },
  { symbol: "6758.T", name: "ソニーグループ" },
  { symbol: "9984.T", name: "ソフトバンクG" },
  { symbol: "8306.T", name: "三菱UFJ" },
  { symbol: "7974.T", name: "任天堂" },
  { symbol: "285A.T", name: "キオクシア" },
  { symbol: "6861.T", name: "キーエンス" },
  { symbol: "4063.T", name: "信越化学" },
  { symbol: "8035.T", name: "東京エレクトロン" },
  { symbol: "6098.T", name: "リクルートHD" },
  { symbol: "9432.T", name: "NTT" },
  { symbol: "9433.T", name: "KDDI" },
  { symbol: "4519.T", name: "中外製薬" },
  { symbol: "6367.T", name: "ダイキン工業" },
  { symbol: "7267.T", name: "ホンダ" },
  { symbol: "6954.T", name: "ファナック" },
  { symbol: "6981.T", name: "村田製作所" },
  { symbol: "4568.T", name: "第一三共" },
  { symbol: "8058.T", name: "三菱商事" },
  { symbol: "8316.T", name: "三井住友FG" },
  { symbol: "7751.T", name: "キヤノン" },
  { symbol: "6702.T", name: "富士通" },
  { symbol: "2802.T", name: "味の素" },
  { symbol: "9022.T", name: "東海旅客鉄道" },
  { symbol: "6503.T", name: "三菱電機" },
  { symbol: "4661.T", name: "オリエンタルランド" },
  { symbol: "7832.T", name: "バンダイナムコ" },
  { symbol: "9983.T", name: "ファーストリテイリング" },
  { symbol: "4901.T", name: "富士フイルムHD" },
  { symbol: "9020.T", name: "JR東日本" },
];
async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    if (closes.length < 2) return null;
    const meta = result.meta;
    const current = meta.regularMarketPrice || closes[closes.length - 1];
    const prev    = meta.chartPreviousClose  || closes[closes.length - 2];
    const week1   = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
    const month1  = closes[0];
    return { symbol, current, changeDay: prev?(current-prev)/prev*100:0, changeWeek: week1?(current-week1)/week1*100:0, changeMonth: month1?(current-month1)/month1*100:0 };
  } catch { return null; }
}
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const results = [];
    for (let i = 0; i < STOCKS.length; i += 5) {
      const batch = STOCKS.slice(i, i + 5);
      const br = await Promise.all(batch.map(async s => { const q = await fetchQuote(s.symbol); return q ? { ...s, ...q } : null; }));
      results.push(...br.filter(Boolean));
      if (i + 5 < STOCKS.length) await new Promise(r => setTimeout(r, 200));
    }
    res.status(200).json({ stocks: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
