# Recruiter-Focused Roadmap

North star: **Chrome Extension → Railway → PostgreSQL → Gemini API → pgvector**. No Ollama, no local models, no GPU.

---

## Current state (MVP — done)

| Capability | Status | Where |
|------------|--------|--------|
| Chrome MV3 extension | Done | `extension/` — side panel, PDP button, 5 IN retailers |
| Fastify backend | Done | `api/` — `/analyze`, `/analysis/:id`, `/feedback` |
| PostgreSQL + cache | Done | `product_analyses`, pipeline/schema versioning |
| OCR pipeline | Done | Google Vision, `ocr_runs` cache, bbox persistence |
| Railway deploy config | Done | `railway.json`, `docs/railway-variables.env` |
| Retailer-specific extraction | Done | `extension/src/content/strategies/` |

**Resume line:** Shipped end-to-end consumer product analysis on live e-commerce PDPs with multimodal extraction and persisted cache.

---

## Already ahead of this roadmap (simplify for interviews)

Built during platform work — **mention selectively**, don’t lead with buzzwords:

| Area | Built | Recruiter framing |
|------|-------|-------------------|
| pgvector RAG | `document_chunks`, hybrid retrieval, `pnpm rag:seed` | “Evidence retrieval over ingredient knowledge base” |
| Agent orchestration | Linear coordinator + fact-check | “Multi-step analysis pipeline” (not “10 agents”) |
| Personalization | Extension toggles + rule engine | “User-profile-aware risk” |
| Eval CLI | `pnpm eval:run`, 6 metrics | “Offline eval harness” (expand dataset in Phase 4) |
| Observability hooks | Phase timing logs, optional Langfuse | “Production tracing” (add screenshots in Phase 5) |
| Feedback loop | `POST /feedback` | “Continuous improvement data capture” |

**De-emphasize in recruiter materials:** Neo4j, Ollama, local LLM — replace with **Gemini API** for the hiring narrative.

---

## Phase 1: AI upgrade (1–2 weeks)

**Goal:** OCR tool → AI-powered ingredient intelligence.

### Step 1: Gemini analysis

| | |
|--|--|
| **Today** | Tier rules + encyclopedia match + optional Ollama summary |
| **Target** | Ingredients → **Gemini** → structured JSON |

```json
{
  "risk_level": "medium",
  "confidence": 89,
  "summary": "...",
  "high_risk_ingredients": [],
  "beneficial_ingredients": [],
  "reasoning": []
}
```

- Add `api/src/llm/gemini.ts` provider
- Env: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.0-flash`
- Persist in `product_analyses` or new `gemini_analysis_json` column
- Railway: remove Ollama vars; `LLM_SUMMARY=gemini`

**Resume signal:** LLM integration, structured output generation, inference pipeline

### Step 2: Explainable AI output

| | |
|--|--|
| **Today** | Ingredient modal with description + evidence links |
| **Target** | Purpose, concerns, **confidence %**, source per ingredient |

Extension ingredient cards:

- Purpose (from encyclopedia / Gemini)
- Potential concern
- Confidence (match score or model confidence)
- Source link

**Resume signal:** Explainable AI, human-readable risk communication

### Step 3: Analysis history

| | |
|--|--|
| **Today** | `GET /analysis/:id`, DB rows exist |
| **Target** | Extension **`/history`** view — product name, URL, summary, timestamp |

- API: `GET /history?limit=20` (or extension reads recent `analysisId`s from storage)
- Side panel tab or options page list

**Resume signal:** Persistent systems, audit trail

---

## Phase 2: RAG layer (1 week)

**Goal:** Modern AI engineering — retrieval before generation.

| | |
|--|--|
| **Today** | pgvector + 25+ chunks, keyword + cosine hybrid |
| **Target** | Gemini receives retrieved context → evidence-backed report |

```
Extract ingredients → embed/query pgvector → top-k chunks → Gemini prompt → cited report
```

- Expand KB to 100–500 ingredients (seed + PubChem excerpts)
- Wire retrieval context into Gemini prompt (not encyclopedia-only)
- Citation IDs in API; clean display in extension

**Resume signal:** RAG, vector search, embeddings, retrieval systems

---

## Phase 3: Agent workflow (1 week)

**Goal:** Agentic AI — keep it simple (3 agents).

| | |
|--|--|
| **Today** | Linear orchestrator (`analyze-orchestrator.ts`) |
| **Target** | LangGraph: Research → Risk → Recommendation + Coordinator |

```
Ingredients → Research Agent → Risk Agent → Recommendation Agent → Final report
```

- Wrap existing `retrieve.ts`, tier logic, Gemini call as graph nodes
- Fact-check gate before response

**Resume signal:** Multi-agent orchestration, LangGraph

---

## Phase 4: Evaluation (high ROI)

**Goal:** Metrics in README — most students skip this.

| | |
|--|--|
| **Today** | 2 golden extraction cases, proxy metrics |
| **Target** | ~100 product benchmark set |

Track:

- OCR accuracy
- Extraction F1
- Retrieval precision@k
- End-to-end latency (p50/p95)
- Cost per analysis (Gemini tokens)

Output: `docs/evaluation-report.md` + table in README

**Resume signal:** ML eval discipline, regression testing for AI systems

---

## Phase 5: Observability

**Goal:** Langfuse screenshots in README.

| | |
|--|--|
| **Today** | `pipeline_phase` logs with timestamps; optional Langfuse ingest |
| **Target** | Full trace: prompt, response, latency, tokens, errors |

- Enable Langfuse on Railway
- Screenshot one end-to-end trace for portfolio

**Resume signal:** Production LLM observability

---

## Target deployment architecture

```
Chrome Extension
      ↓
Railway (Fastify API)
      ↓
Supabase PostgreSQL + pgvector
      ↓
Google Gemini API
      ↓
Google Cloud Vision (OCR)
```

---

## Suggested interview story (30 seconds)

> I built a Chrome extension that analyzes ingredient lists on Indian e-commerce product pages. It extracts data from retailer DOMs, runs OCR when needed, matches against a PostgreSQL knowledge base with vector retrieval, and calls Gemini for structured risk analysis. The API is deployed on Railway with caching, feedback collection, and an eval harness with published metrics.

---

## Immediate next actions (priority order)

1. **Deploy MVP to Railway** (if not live) — pooler URL, Vision JSON, API key
2. **Swap Ollama → Gemini** (`LLM_SUMMARY=gemini`, structured JSON schema)
3. **History UI** in extension (quick recruiter win)
4. **Expand eval dataset** to 20+ products, publish metrics in README
5. **Langfuse screenshot** after Gemini is wired
