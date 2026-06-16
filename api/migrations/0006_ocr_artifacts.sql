CREATE TABLE IF NOT EXISTS ocr_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES product_analyses (id) ON DELETE CASCADE,
  image_url_hash text NOT NULL,
  image_url text NOT NULL,
  raw_annotation_json jsonb,
  parsed_text text,
  mean_confidence real,
  bounding_boxes_json jsonb,
  vision_model_version text NOT NULL DEFAULT 'vision-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_url_hash, vision_model_version)
);

CREATE INDEX IF NOT EXISTS ocr_runs_analysis_id_idx ON ocr_runs (analysis_id);

ALTER TABLE product_analyses
  ADD COLUMN IF NOT EXISTS product_understanding_json jsonb;
