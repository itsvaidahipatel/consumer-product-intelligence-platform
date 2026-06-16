CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "ingredient_tier" AS ENUM ('GREEN', 'BLUE', 'RED', 'BLACK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "regulatory_status" AS ENUM ('allowed', 'restricted', 'banned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "canonical_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "normalized_name" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "tier" "ingredient_tier" NOT NULL,
  "description" text,
  "inci_name" text,
  "cas_number" text,
  "function_description" text,
  "country_restrictions" text,
  "review_notes" text,
  "data_source" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "last_reviewed_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "ingredient_synonyms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ingredient_id" uuid NOT NULL REFERENCES "canonical_ingredients"("id") ON DELETE CASCADE,
  "synonym" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_synonyms_synonym_uq" ON "ingredient_synonyms" ("synonym");

CREATE TABLE IF NOT EXISTS "ingredient_regulatory_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ingredient_id" uuid NOT NULL REFERENCES "canonical_ingredients"("id") ON DELETE CASCADE,
  "country_code" text NOT NULL,
  "status" "regulatory_status" NOT NULL,
  "notes" text,
  "effective_date" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" text NOT NULL,
  "retailer_product_id" text NOT NULL,
  "product_name" text NOT NULL,
  "product_url" text NOT NULL,
  "url_hash" text NOT NULL,
  "provenance" text NOT NULL,
  "completeness_flag" boolean NOT NULL,
  "pipeline_version" text NOT NULL,
  "schema_version" text NOT NULL,
  "analyzed_at" timestamptz NOT NULL,
  "correlation_id" text NOT NULL,
  "confidence_score" real,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "product_analyses_cache_lookup_idx"
  ON "product_analyses" ("site_id", "retailer_product_id", "url_hash");

CREATE TABLE IF NOT EXISTS "product_analysis_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL REFERENCES "product_analyses"("id") ON DELETE CASCADE,
  "raw_token" text NOT NULL,
  "normalized_ingredient_id" uuid REFERENCES "canonical_ingredients"("id") ON DELETE SET NULL,
  "tier_used" "ingredient_tier" NOT NULL,
  "order_index" integer NOT NULL,
  "provenance" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
