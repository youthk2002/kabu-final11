export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { symbol, name } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  try {
    const query = encodeURIComponent(`${name || symbol} 株価`);
    const url = `https://news.yahoo.co.jp/search?p=${query}&ei=UTF-8`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error("fetch error");
    const html = await r.text();
    const items = [];
    const regex = /<a[^>]+href="(https:\/\/news\.yahoo\.co\.jp\/articles\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 5) {
      const title = match[2].trim();
      if (title.length > 10) items.push({ title, url: match[1] });
    }
    if (items.length === 0) {
      const r2 = /<li[^>]+class="[^"]*newsFeed_item[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>/g;
      while ((match = r2.exec(html)) !== null && items.length < 5) {
        const title = match[2].trim();
        if (title.length > 10) items.push({ title, url: match[1] });
      }
    }
    res.status(200).json({ news: items });
  } catch (e) { res.status(500).json({ error: e.message, news: [] }); }
}
