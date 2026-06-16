-- Encyclopedia LLM/curation, evidence & notes; retailer dimension; product analysis denorm; ingredient snapshots.

DO $$ BEGIN
  CREATE TYPE ingredient_review_status AS ENUM ('draft', 'published', 'deprecated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE evidence_source_type AS ENUM ('pubchem', 'regulation', 'llm_summary', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ingredient_note_author AS ENUM ('llm', 'human', 'import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_classification AS ENUM ('GREEN', 'BLUE', 'RED', 'BLACK', 'YELLOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS retailers (
  site_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  country TEXT,
  base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO retailers (site_id, label, country, base_url) VALUES
  ('amazon_in', 'Amazon India', 'IN', 'https://www.amazon.in'),
  ('nykaa', 'Nykaa', 'IN', 'https://www.nykaa.com'),
  ('myntra', 'Myntra', 'IN', 'https://www.myntra.com'),
  ('blinkit', 'Blinkit', 'IN', 'https://blinkit.com'),
  ('zepto', 'Zepto', 'IN', 'https://www.zepto.com')
ON CONFLICT (site_id) DO NOTHING;

INSERT INTO retailers (site_id, label, created_at, updated_at)
SELECT DISTINCT pa.site_id,
       initcap(replace(pa.site_id, '_', ' ')),
       now(),
       now()
FROM product_analyses pa
WHERE NOT EXISTS (SELECT 1 FROM retailers r WHERE r.site_id = pa.site_id)
ON CONFLICT (site_id) DO NOTHING;

ALTER TABLE canonical_ingredients
  ADD COLUMN IF NOT EXISTS review_status ingredient_review_status NOT NULL DEFAULT 'published'::ingredient_review_status,
  ADD COLUMN IF NOT EXISTS confidence REAL,
  ADD COLUMN IF NOT EXISTS last_llm_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS llm_model TEXT,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ingredient_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  source_type evidence_source_type NOT NULL,
  url TEXT,
  title TEXT,
  excerpt TEXT,
  retrieved_at TIMESTAMPTZ,
  trust_weight REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredient_evidence_ingredient_id_idx ON ingredient_evidence (ingredient_id);

CREATE TABLE IF NOT EXISTS ingredient_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  author_type ingredient_note_author NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredient_notes_ingredient_id_idx ON ingredient_notes (ingredient_id);

ALTER TABLE product_analyses
  ADD COLUMN IF NOT EXISTS product_classification product_classification,
  ADD COLUMN IF NOT EXISTS raw_ingredient_text TEXT,
  ADD COLUMN IF NOT EXISTS product_description TEXT,
  ADD COLUMN IF NOT EXISTS analysis_summary_json JSONB;

ALTER TABLE product_analysis_ingredients
  ADD COLUMN IF NOT EXISTS display_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS match_confidence REAL;

DO $$ BEGIN
  ALTER TABLE product_analyses
    ADD CONSTRAINT product_analyses_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES retailers(site_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS product_analyses_cache_pipeline_idx
  ON product_analyses (site_id, retailer_product_id, url_hash, pipeline_version, schema_version, analyzed_at DESC);
