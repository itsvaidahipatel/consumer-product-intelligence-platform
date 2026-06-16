# AI Scanner — Recruiter One-Pager

**Live ingredient intelligence for e-commerce product pages** — Chrome extension + deployed API + PostgreSQL + multimodal extraction.

---

## What it does

On supported retailer PDPs (Amazon.in, Nykaa, Myntra, Blinkit, Zepto), users tap **Analyze Product**. The system:

1. Extracts ingredient text from the page (retailer-specific DOM strategies)
2. Optionally runs **Google Vision OCR** on product images when DOM is incomplete
3. Normalizes and matches ingredients against a **PostgreSQL encyclopedia**
4. Retrieves evidence from a **pgvector** knowledge base (RAG)
5. Returns tiered risk assessment with per-ingredient explanations and feedback capture

---

## What’s shipped (MVP)

| Layer | Tech |
|-------|------|
| Extension | Chrome MV3, side panel, shadow-DOM PDP button, personalization toggles |
| API | Fastify, TypeScript, Zod contracts, structured pipeline logs |
| Data | Supabase PostgreSQL, Drizzle ORM, versioned analysis cache |
| OCR | Google Cloud Vision `DOCUMENT_TEXT_DETECTION` |
| Deploy | Railway (`railway.json`), GitHub Actions CI |
| Quality | Eval CLI (`pnpm eval:run`), thumbs feedback → `analysis_feedback` |

---

## Engineering highlights (say in interviews)

- **Multimodal pipeline:** DOM completeness gate skips OCR when unnecessary (~2s vs ~25s on complete lists)
- **Cache design:** `product_analyses` keyed by site + product + URL hash + pipeline version
- **RAG foundation:** `document_chunks` + hybrid keyword/vector retrieval with evidence refs on API response
- **Orchestrated analysis:** Extraction → retrieval → risk → summary → fact-check (linear agent graph)
- **Observability:** Per-phase `timestamp` + `elapsed_ms` in API logs; optional Langfuse hooks
- **Extension UX:** Consumer-focused panel (concern tiers, not internal debug metadata)

---

## Stack (production target)

```
Extension → Railway API → PostgreSQL/pgvector → Gemini API → Vision OCR
```

*Current local dev uses optional Ollama; production roadmap standardizes on **Gemini API** (no GPU, no local models).*

---

## Metrics (eval harness)

From `docs/evaluation-report.md` (expand to 100-product benchmark in Phase 4):

| Metric | Current |
|--------|---------|
| Extraction F1 | 0.94 |
| Retrieval nDCG@5 (proxy) | 0.72 |
| Citation coverage (proxy) | 0.85 |

---

## Links

- **Repo:** [consumer-product-intelligence-platform](https://github.com/itsvaidahipatel/consumer-product-intelligence-platform)
- **System design:** `docs/CP_PLATFORM_SYSTEM_DESIGN.md`
- **Roadmap:** `docs/recruiter-roadmap.md`
- **Deploy:** `docs/railway-variables.env`

---

## Next milestones (recruiter-visible)

1. **Gemini structured analysis** — JSON risk report persisted in DB
2. **Analysis history** — extension history view over past runs
3. **Published eval table** in README (100 products)
4. **Langfuse trace screenshot** in README
