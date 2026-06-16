# Ingredient Scanner — Monorepo

Chrome **Manifest V3** extension + **Node.js / TypeScript** API for extracting retailer ingredient text, optionally running **Google Cloud Vision** `DOCUMENT_TEXT_DETECTION`, matching against a **PostgreSQL** encyclopedia, and returning tiered safety results with caching.

## Repository layout

```text
extension/   Chrome MV3 UI + retailer scraping strategies
api/         Fastify HTTP service + analysis pipeline + migrations
shared/      Zod contracts, enums, normalization helpers
```

## Quick start (local)

### 1) Database (Supabase or local Postgres)

Create a database and set `DATABASE_URL` (see `api/.env.example`).

**Supabase / special passwords:** connection strings are parsed as URLs. If the password contains `#`, `@`, `:`, or other reserved characters, **encode them** in the URI (for example `#` → `%23`). A literal `#` in the password produces `TypeError: Invalid URL` from the Postgres client.

**Supabase (direct Postgres):** use `sslmode=require` on the URL. Build it from dashboard fields:

```text
postgresql://USER:ENCODED_PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Example shape (replace host and password):

```text
postgresql://postgres:YOUR_ENCODED_PASSWORD@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

To avoid hand-encoding the password, generate the full URI with Node (password only in `PGPASSWORD`):

```bash
PGPASSWORD='(paste password here)' node -e "const u=new URL('postgresql://db.<project-ref>.supabase.co:5432/postgres'); u.username='postgres'; u.password=process.env.PGPASSWORD; u.searchParams.set('sslmode','require'); console.log(u.toString())"
```

Run migrations:

```bash
cd /Users/itsva/Desktop/CODES/extention-new
export DATABASE_URL="postgresql://..."
pnpm db:migrate
```

### 2) API

Copy `api/.env.example` to **`.env` in the monorepo root** (recommended) or to **`api/.env`**. The API loads both (without overriding variables you already exported in the shell).

If `cre.json` sits next to `.gitignore` (repo root), use `GOOGLE_VISION_CREDENTIALS_FILE=../cre.json` inside **`api/.env`**, or `GOOGLE_VISION_CREDENTIALS_FILE=./cre.json` inside **root `.env`** — depending on where the file lives relative to that `.env` file.

```bash
export DATABASE_URL="postgresql://..."
# Optional OCR (see api/.env.example for file vs JSON):
# export GOOGLE_VISION_CREDENTIALS_FILE=../cre.json
pnpm dev:api
```

Health check:

- `GET http://localhost:8787/health`
- `GET http://localhost:8787/ready`

In **development**, if `checks.database` is `false`, the JSON may include **`database_error`** with the underlying driver message (wrong password, SSL, timeout, etc.). Production responses omit that field.

Supabase URLs (`*.supabase.co`) use **`ssl: "require"`** automatically on the Postgres client.

Analyze:

- `POST http://localhost:8787/analyze/product`

### 3) Extension

```bash
pnpm dev:extension
```

Chrome → **Extensions** → **Load unpacked** → pick `extension/dist`.

**UI is the Chrome Side Panel** (not a popup): click the extension **toolbar icon** to open the side panel. It **stays open** while you change tabs in the same window.

1. Open **Options** (from the extension card on `chrome://extensions/`) and set **API Base URL** (e.g. `http://localhost:8787`).
2. Open a supported product page (e.g. `https://www.amazon.in/dp/...`).
3. Open the **side panel** (toolbar icon) → **Analyze Product** (uses server cache when valid) or **Fresh run (skip cache)** to force a new pipeline. The active tab in that window must be a **supported product URL** (see `extension/public/manifest.json` `content_scripts` matches). If you see *Receiving end does not exist*, reload the product page or switch to a supported host (e.g. `amazon.in` including non-`www`). You can switch tabs while analysis runs; when the API finishes, results appear in the panel (first run can take **up to ~2 minutes** if the pipeline hits Supabase + Vision OCR). In **Options**, set **Max gallery images** to **12** (default) or higher so more thumbnails (including back-of-pack) reach Vision; older installs may still have **4** or **8** saved in sync storage.
4. A small **banner** is also sent to the product tab when analysis completes.

Reload the extension in `chrome://extensions` after each rebuild.

### Chrome Web Store & privacy

- **Privacy policy (user-facing):** `extension/public/privacy-policy.html` — bundled into `extension/dist/`; linked from **Options** and the **side panel**. For the store’s **Privacy policy URL**, use a public HTTPS link to the same file on `main`, e.g.  
  `https://raw.githubusercontent.com/itsvaidahipatel/ingredient-scanner/main/extension/public/privacy-policy.html`  
  You can also host a copy on GitHub Pages or your own domain.
- **Policy ↔ behavior:** Keep the policy updated when you change permissions, hosts, or what is sent to the API.
- **Checklist vs Google’s principles:** see **`docs/chrome-web-store-compliance.md`**.

### Analyze timing logs (debugging hangs)

- **API terminal:** Each run emits structured `pipeline_phase` logs (message `pipeline:<phase>`) with `duration_ms`, `phase`, and `correlation_id`. Slow work usually appears under `vision_fetch_images`, `vision_ocr_batch`, `ingredient_match_*`, or `cache_lookup_db`.
- **Extension service worker:** `chrome://extensions` → your extension → **Service worker** → **Inspect** → filter the console for `[IngredientScanner:SW]` (includes `fetch_duration_ms`, HTTP status, and `correlation_id` after JSON parse).
- **Side panel:** Right‑click the side panel → **Inspect** → filter `[IngredientScanner:Panel]` for page extract and background handoff timings.
- Match **`correlation_id`** from the SW log `response_json_parsed` with the same field in API logs for one request.

## Environment variables

See `api/.env.example`.

Never log or commit `GOOGLE_VISION_CREDENTIALS_JSON`, `cre.json`, private keys, or `x-api-key` values.

### Supabase `CONNECT_TIMEOUT` (port 5432)

If the API returns **503** with a database connection message, the host running Node often cannot complete a TCP handshake to `db.<ref>.supabase.co:5432` in time (paused project, IPv6 routing, or cloud egress). Use the **Transaction pooler** URL (port **6543**) from the Supabase dashboard, keep `sslmode=require`, and ensure the project is **resumed** (free tier pauses after inactivity).

### Supabase `ENOTFOUND` / `getaddrinfo ENOTFOUND`

DNS returned no address for the hostname in `DATABASE_URL`. That usually means a **wrong or stale project ref** in the subdomain (`db.<ref>.supabase.co`), a **deleted** Supabase project, or **local DNS** (VPN, corporate filter, broken resolver). Open the Supabase dashboard, confirm the project exists, and paste the **current** database URI from **Settings → Database**. On your Mac, `dig +short db.<ref>.supabase.co` should print at least one IP; if it prints nothing, fix the URL or network before restarting `pnpm dev:api`.

### Supabase direct host: `dig` empty but dashboard URL looks right

Supabase’s **direct** host `db.<ref>.supabase.co` often has **only IPv6 (AAAA)**, not IPv4 (A). Plain `dig +short db.<ref>.supabase.co` asks for **A** by default, so it can print **nothing** even when the project is fine. Check IPv6 explicitly:

```bash
dig +short AAAA db.<ref>.supabase.co
```

If you see an IPv6 address but the API still fails with `ENOTFOUND` or connection errors, the API sets **`dns.setDefaultResultOrder('verbatim')`** and **`net.setDefaultAutoSelectFamily(true)`** at startup (`api/src/dns-bootstrap.ts`). For any **`*.supabase.co` / `*.supabase.com`** host in `DATABASE_URL`, it uses a custom **`postgres` `socket` factory** (`api/src/db/supabase-direct-socket.ts`): **`dns.lookup` → `resolve6` → `resolve4`**, sorts **IPv4 before IPv6** when both exist (many home networks cannot route outbound IPv6 to Supabase), then **`net.Socket#connect({ port, host, family })`**. On boot it runs **`select 1`** and **exits** if the DB is unreachable so failures are obvious in the terminal. Restart `pnpm dev:api` after pulling, rebuild/reload the extension for longer HTTP error text. If you see **`EHOSTUNREACH`** to an IPv6-only direct host, switch **`DATABASE_URL`** to the **Transaction pooler** URI (port **6543**) from **Settings → Database**.

### Supabase `EHOSTUNREACH` to an IPv6 address

If the startup probe or logs show **`connect EHOSTUNREACH 2406:…:5432`**, DNS resolved Supabase over **IPv6**, but your **LAN/router/VPN does not deliver working outbound IPv6** to that destination. The direct host `db.<ref>.supabase.co` is often **IPv6-only**. Use the **Transaction pooler** connection string (port **6543**, host `*.pooler.supabase.com`) from Supabase → **Settings → Database**, or enable Supabase’s **IPv4 add-on** for direct session mode.

## Railway deployment (API)

The repo includes **`railway.json`** (config-as-code): monorepo **build** (shared + API only), **`node api/dist/index.js`** start, and **`/ready`** health check. Dashboard values for those keys are overridden by this file when present.

1. Create a Railway project and connect this GitHub repo (or deploy from the CLI after `railway login` and `railway link`).
2. Leave **Root Directory** empty (monorepo root) so `railway.json` and `pnpm-lock.yaml` apply.
3. Add **Postgres** (or set `DATABASE_URL` to Supabase / external Postgres). Reference the plugin URL on the API service.
4. Set variables on the API service (full list with comments: **`docs/railway-variables.env`**).
5. **Migrations:** run after the first successful build, from a **Railway shell** on the service (or a one-off deploy command), so `DATABASE_URL` matches production:

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm db:migrate
```

   Alternatively, set a **Pre-deploy command** in the Railway UI (not in `railway.json` here): Railway’s runtime image may not include `pnpm` on `PATH` the same way as the build image, so a UI **Pre-deploy** with a full shell command is easier to tune than a one-size-fits-all config file.

Equivalent manual overrides (if you delete `railway.json`):

```bash
pnpm install && pnpm --filter @ingredient-scanner/shared build && pnpm --filter @ingredient-scanner/api build
```

```bash
node api/dist/index.js
```

## Architecture (high level)

```mermaid
flowchart LR
  subgraph Browser[Chrome Extension]
    CS[Content scripts\nstrategies + selectors]
    BG[Service worker\nAPI transport]
    POP[Popup UI]
  end

  subgraph Server[API]
    Q[POST /analyze/product]
    P[Pipeline:\nscored DOM/OCR candidates\nVision ≤12 images\nmatch → classify]
    DB[(Postgres)]
    V[Vision OCR]
  end

  POP --> BG
  BG --> Q
  CS --> POP
  Q --> P
  P --> DB
  P --> V
```

## Ingredient candidate scoring (API)

The API no longer picks a single “DOM blob vs whole OCR string” with a simple merge. It:

1. **Splits the DOM payload** into multiple text candidates (paragraphs + slices around heading keywords such as *ingredients*, *composition*, *contains*, …).
2. **Slices OCR** into windows after those keywords (roughly the next ~18 lines), instead of tokenizing the entire label dump.
3. **Scores every candidate** with retailer heuristics (comma-separated INCI-like lists, marketing/usage/MRP penalties, etc.) plus **encyclopedia hit rate** and a **completeness-style bonus**, then picks the winner (or merges two close lists when Jaccard similarity is high).
4. **Ranks product images** by URL + optional `alt` (label/back-of-pack hints) and sends at most **twelve** to Vision to save cost.
5. **Runs OCR keyword windows per image** (`ocrChunks`), then **always** runs the same extractors on **all chunks joined** (so a label line on another image still surfaces next to hero marketing). If there is no `INGREDIENTS:` line, a **comma-separated INCI fallback** can still surface a dense list from label OCR.
6. If the winning candidate is **short DOM** and OCR chunks exist, the API may **prefer a longer OCR list** over that DOM pick.
7. **Amazon.in** collects the **thumbnail strip** and **`data-a-dynamic-image`** hi-res variants, then sorts by the same image score before picking URLs for the payload.

Shared logic lives in `shared/src/ingredient-candidates.ts`; DB hit counting in `api/src/services/canonical-token-hits.ts`; selection in `api/src/services/scored-candidate-selection.ts`.

When extraction or scoring rules change incompatibly, bump **`PIPELINE_VERSION`** in `shared/src/constants.ts` so older `product_analyses` rows no longer satisfy the cache lookup and users get a fresh run (or use **Force refresh** in extension options, or **Fresh run (skip cache)** in the side panel).

## Sequence: “Analyze Product”

```mermaid
sequenceDiagram
  participant U as User
  participant P as Popup
  participant C as Content script
  participant B as Background worker
  participant A as API
  participant D as Postgres
  participant V as Google Vision

  U->>P: Click Analyze Product
  P->>C: INGREDIENT_SCANNER_EXTRACT
  C-->>P: DOM payload (url, text, images…)
  P->>B: INGREDIENT_SCANNER_ANALYZE
  B->>A: POST /analyze/product
  A->>D: Cache lookup / persist analysis
  opt OCR required
    A->>V: documentTextDetection (fetched images)
  end
  A-->>B: JSON results
  B-->>P: analysis
  P->>C: INGREDIENT_SCANNER_SHOW_BANNER
```

## ERD (V1 tables)

```mermaid
erDiagram
  canonical_ingredients ||--o{ ingredient_synonyms : has
  canonical_ingredients ||--o{ ingredient_regulatory_status : has
  product_analyses ||--o{ product_analysis_ingredients : contains

  canonical_ingredients {
    uuid id PK
    text normalized_name UK
    text display_name
    ingredient_tier tier
    text description
    timestamptz created_at
    timestamptz updated_at
  }

  ingredient_synonyms {
    uuid id PK
    uuid ingredient_id FK
    text synonym UK
    timestamptz created_at
    timestamptz updated_at
  }

  ingredient_regulatory_status {
    uuid id PK
    uuid ingredient_id FK
    text country_code
    regulatory_status status
    timestamptz created_at
    timestamptz updated_at
  }

  product_analyses {
    uuid id PK
    text site_id
    text retailer_product_id
    text url_hash
    boolean completeness_flag
    text provenance
    timestamptz analyzed_at
    text correlation_id
    timestamptz created_at
    timestamptz updated_at
  }

  product_analysis_ingredients {
    uuid id PK
    uuid analysis_id FK
    text raw_token
    uuid normalized_ingredient_id FK
    ingredient_tier tier_used
    int order_index
    text provenance
    timestamptz created_at
    timestamptz updated_at
  }
```

Migration `0002_schema_plan_extensions.sql` adds **`retailers`** (dimension + FK from `product_analyses.site_id`), **`ingredient_evidence`** and **`ingredient_notes`**, LLM/curation columns on **`canonical_ingredients`**, denormalized fields on **`product_analyses`** (e.g. `product_classification`, `raw_ingredient_text`, `analysis_summary_json`), and **`display_name_snapshot` / `match_confidence`** on **`product_analysis_ingredients`**. Keep **`SCHEMA_VERSION`** in [`shared/src/constants.ts`](shared/src/constants.ts) aligned with `product_analyses.schema_version` for cache hits.

## OCR policy (cost control)

Vision runs **only** when `analysisMode` is `DOM_AND_VISION` **and** at least one gallery URL exists **and** one of:

- ingredient text is missing/empty,
- DOM completeness heuristics fail,
- user requests **force refresh** (from Options / payload).

If DOM text looks complete, OCR is skipped.

## Caching policy (trusted results)

Cache hits require a prior row with:

- matching `site_id`, `retailer_product_id`, `url_hash`, `pipeline_version`, `schema_version`
- `completeness_flag = true`
- age \< 15 days
- provenance not `"dom"` **or** `confidence_score` ≥ threshold (see `CACHE_MIN_CONFIDENCE` in the API)

Incomplete analyses are persisted for audit/debug but **never** satisfy the cache short-circuit.

## Tests

```bash
pnpm test
```

## Notes / V1 limitations

- Retailer DOM selectors are **best-effort** and will require ongoing tuning in `extension/src/content/selectors.ts`.
- The encyclopedia ships with a **small seed** dataset (`api/migrations/0001_seed_canonical.sql`). Scale-out path is bulk imports into `canonical_ingredients` + `ingredient_synonyms`.
