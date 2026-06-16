-- User feedback on persisted product analyses (continuous learning / eval inputs).

CREATE TABLE IF NOT EXISTS analysis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES product_analyses (id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (
    vote IN ('helpful', 'not_helpful', 'incorrect', 'flag')
  ),
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text,
  client_hints jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_feedback_analysis_id_idx ON analysis_feedback (analysis_id);
