# Aloy Port

A private model portfolio against MSCI AC Asia Pacific ex-Japan (MIAPJ), in MYR, total return.
Live at https://mamreg.github.io/aloyport/

- `index.html`: the whole site (single file). Deployed to GitHub Pages on every push to `main`.
- `worker/`: the private backend (Cloudflare Worker): Yahoo price and ticker-search proxy, plus storage in KV behind passphrases.

No index or portfolio data lives in this repo. Constituents and index levels are uploaded on the site's **Data** tab and stored in the Worker (or, before the Worker is connected, in your browser).

## How returns are measured
- Prices: Yahoo adjusted closes (dividends included), converted to MYR with each day's FX (USD crosses).
- Portfolio: units are fixed at each saved change and drift with prices until the next change. Inception is the first save; nothing is backfilled.
- Benchmark: the MIAPJ index levels you upload (MYR, total return).
- Relative attribution: active weight × (stock return − index return), daily, over your holdings and the 25 largest index names.

## Worker setup (one time)
```bash
cd worker
npx wrangler login
npx wrangler kv namespace create PORT_KV     # paste the id into wrangler.toml
npx wrangler secret put WRITE_TOKEN           # your passphrase
npx wrangler secret put VIEW_TOKEN            # view-only passphrase for your boss
npx wrangler deploy                           # prints https://aloyport-api.<you>.workers.dev
```
Then on the site: Data → Private cloud storage → paste the Worker address and your passphrase → Connect.
