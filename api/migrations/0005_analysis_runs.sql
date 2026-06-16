CREATE TABLE IF NOT EXISTS analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES product_analyses (id) ON DELETE SET NULL,
  correlation_id text NOT NULL,
  wall_ms integer NOT NULL,
  vision_units integer NOT NULL DEFAULT 0,
  embedding_calls integer NOT NULL DEFAULT 0,
  llm_input_tokens integer NOT NULL DEFAULT 0,
  llm_output_tokens integer NOT NULL DEFAULT 0,
  model_id text,
  estimated_cost_usd real,
  pipeline_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_runs_correlation_id_idx ON analysis_runs (correlation_id);
CREATE INDEX IF NOT EXISTS analysis_runs_analysis_id_idx ON analysis_runs (analysis_id);
