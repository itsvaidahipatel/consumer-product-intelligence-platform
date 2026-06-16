CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid REFERENCES canonical_ingredients (id) ON DELETE SET NULL,
  source_type text NOT NULL,
  title text,
  excerpt text NOT NULL,
  source_uri text,
  trust_weight real NOT NULL DEFAULT 0.5,
  embedding vector(384),
  embedding_model text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_ingredient_id_idx ON document_chunks (ingredient_id);
