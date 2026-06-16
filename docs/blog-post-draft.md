# Blog Post Draft: Building a Consumer Product Intelligence Platform

## Hook
Ingredient lists on e-commerce sites are hard to read and harder to trust. I built **AI Scanner** — a Chrome extension and API platform that turns PDP ingredient text into cited safety assessments.

## Architecture
1. **Extension** extracts structured product data from supported retailers.
2. **API** runs a multimodal pipeline (DOM + OCR) and matches ingredients to a canonical encyclopedia.
3. **RAG** retrieves regulatory and scientific chunks from PostgreSQL.
4. **Agents** synthesize a report with a fact-checker gate — no claim without evidence IDs.
5. **Personalization** elevates risk for fragrance sensitivity, allergies, pregnancy, and vegan preferences.

## What I learned
- Cache versioning matters when OCR and embeddings change.
- Slash-separated INCI labels (`aqua / water`) need special normalization.
- Open-source LLMs via Ollama keep costs low for portfolio demos.

## Next steps
US retailer expansion, cross-encoder reranking, benchmark growth.
