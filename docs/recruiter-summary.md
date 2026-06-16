# Consumer Product Intelligence Platform — Recruiter Summary

**AI Scanner** is a production-oriented platform that analyzes consumer product ingredient lists from e-commerce PDPs and returns evidence-backed safety assessments.

## Highlights
- Chrome MV3 extension with retailer-specific extraction (Amazon India, Nykaa, Myntra, Blinkit, Zepto)
- Fastify API + PostgreSQL (Supabase) + Drizzle ORM
- Multimodal pipeline: DOM extraction, Google Vision OCR, normalization, encyclopedia + RAG retrieval
- Multi-agent orchestration (extraction → research → regulatory → risk → recommendation → fact-check)
- pgvector-ready document chunks, Neo4j graph sync, personalization profiles
- Observability hooks (OpenTelemetry-style spans, Langfuse ingestion)
- Automated evaluation CLI + CI

## Stack
TypeScript, Vite, Fastify, PostgreSQL, pgvector, Neo4j, Ollama (open-source LLM), Google Cloud Vision

## Live demo
Deploy API to Railway; extension points to production URL.

## Repos
- MVP: ingredient-scanner
- Platform: consumer-product-intelligence-platform
