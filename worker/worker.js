/**
 * aloyport-api — private backend for the Aloy Port site.
 *
 *   GET  /search?q=…            → Yahoo ticker search (powers the add-stock dropdown)
 *   GET  /chart?symbol=…&range= → Yahoo v8 chart passthrough (adjusted closes = total return)
 *   GET  /me                    → { role } for the Bearer token, or 401
 *   GET  /state                 → the whole site state (needs WRITE_TOKEN or VIEW_TOKEN)
 *   PUT  /state                 → replace the state (needs WRITE_TOKEN)
 *
 * Bindings: KV namespace PORT_KV; secrets WRITE_TOKEN (you, edit) and VIEW_TOKEN (your boss, read-only).
 * Unlike mamreg, nothing here is readable without a token.
 */
const YH = "https://query1.finance.yahoo.com";
const UA = "Mozilla/5.0 (aloyport-worker)";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } });

function yahoo(path, ttl) {
  return fetch(YH + path, {
    headers: { "user-agent": UA, accept: "application/json" },
    cf: ttl ? { cacheTtl: ttl, cacheEverything: true } : undefined,
  });
}
function role(req, env) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok) return "none";
  if (env.WRITE_TOKEN && tok === env.WRITE_TOKEN) return "admin";
  if (env.VIEW_TOKEN && tok === env.VIEW_TOKEN) return "viewer";
  return "none";
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "");
    try {
      if (p.endsWith("/search")) {
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return json([]);
        const r = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`, 120);
        const d = await r.json();
        const keep = new Set(["EQUITY", "ETF", "INDEX"]);
        return json((d.quotes || []).filter((x) => x.symbol && keep.has(x.quoteType)).map((x) => ({
          symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchDisp || x.exchange || "", type: x.quoteType,
        })));
      }
      if (p.endsWith("/chart")) {
        const sym = url.searchParams.get("symbol");
        const range = url.searchParams.get("range") || "2y";
        if (!sym) return json({ error: "symbol required" }, 400);
        const r = await yahoo(`/v8/finance/chart/${encodeURIComponent(sym)}?range=${encodeURIComponent(range)}&interval=1d&events=div%2Csplit`, 900);
        return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", ...CORS } });
      }
      const who = role(req, env);
      if (p.endsWith("/me")) return who === "none" ? json({ error: "unauthorized" }, 401) : json({ role: who });
      if (p.endsWith("/state")) {
        if (who === "none") return json({ error: "unauthorized" }, 401);
        if (req.method === "GET") {
          const s = await env.PORT_KV.get("state");
          return new Response(s || "{}", { headers: { "content-type": "application/json", ...CORS } });
        }
        if (req.method === "PUT") {
          if (who !== "admin") return json({ error: "view only" }, 403);
          const body = await req.text();
          try { JSON.parse(body); } catch { return json({ error: "invalid json" }, 400); }
          // keep the previous version as a one-step undo
          const prev = await env.PORT_KV.get("state");
          if (prev) await env.PORT_KV.put("state.prev", prev);
          await env.PORT_KV.put("state", body);
          return json({ ok: true });
        }
        return json({ error: "method not allowed" }, 405);
      }
      return json({ error: "not found", path: p }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};
