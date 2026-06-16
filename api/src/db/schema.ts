import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const ingredientTierEnum = pgEnum("ingredient_tier", [
  "GREEN",
  "BLUE",
  "RED",
  "BLACK",
]);

export const regulatoryStatusEnum = pgEnum("regulatory_status", [
  "allowed",
  "restricted",
  "banned",
]);

export const ingredientReviewStatusEnum = pgEnum("ingredient_review_status", [
  "draft",
  "published",
  "deprecated",
]);

export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "pubchem",
  "regulation",
  "llm_summary",
  "manual",
]);

export const ingredientNoteAuthorEnum = pgEnum("ingredient_note_author", [
  "llm",
  "human",
  "import",
]);

export const productClassificationEnum = pgEnum("product_classification", [
  "GREEN",
  "BLUE",
  "RED",
  "BLACK",
  "YELLOW",
]);

/** Retailer / channel dimension (site_id matches extension strategies, e.g. amazon_in). */
export const retailers = pgTable("retailers", {
  siteId: text("site_id").primaryKey(),
  label: text("label").notNull(),
  country: text("country"),
  baseUrl: text("base_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const canonicalIngredients = pgTable("canonical_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  normalizedName: text("normalized_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  tier: ingredientTierEnum("tier").notNull(),
  description: text("description"),
  inciName: text("inci_name"),
  casNumber: text("cas_number"),
  functionDescription: text("function_description"),
  countryRestrictions: text("country_restrictions"),
  reviewNotes: text("review_notes"),
  dataSource: text("data_source"),
  reviewStatus: ingredientReviewStatusEnum("review_status").notNull().default("published"),
  confidence: real("confidence"),
  lastLlmRunAt: timestamp("last_llm_run_at", { withTimezone: true }),
  llmModel: text("llm_model"),
  humanReviewedAt: timestamp("human_reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
});

export const ingredientSynonyms = pgTable(
  "ingredient_synonyms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => canonicalIngredients.id, { onDelete: "cascade" }),
    synonym: text("synonym").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    synonymIngredientUq: uniqueIndex("ingredient_synonyms_synonym_uq").on(t.synonym),
  }),
);

export const ingredientRegulatoryStatus = pgTable("ingredient_regulatory_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => canonicalIngredients.id, { onDelete: "cascade" }),
  countryCode: text("country_code").notNull(),
  status: regulatoryStatusEnum("status").notNull(),
  notes: text("notes"),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trust-weighted provenance rows (PubChem, regulation excerpts, LLM summaries, manual). */
export const ingredientEvidence = pgTable(
  "ingredient_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => canonicalIngredients.id, { onDelete: "cascade" }),
    sourceType: evidenceSourceTypeEnum("source_type").notNull(),
    url: text("url"),
    title: text("title"),
    excerpt: text("excerpt"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    trustWeight: real("trust_weight"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ingredientEvidenceIdx: index("ingredient_evidence_ingredient_id_idx").on(t.ingredientId),
  }),
);

/** Multiple dated notes (LLM vs human vs import) per canonical ingredient. */
export const ingredientNotes = pgTable(
  "ingredient_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => canonicalIngredients.id, { onDelete: "cascade" }),
    authorType: ingredientNoteAuthorEnum("author_type").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ingredientNotesIdx: index("ingredient_notes_ingredient_id_idx").on(t.ingredientId),
  }),
);

export const productAnalyses = pgTable(
  "product_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => retailers.siteId),
    retailerProductId: text("retailer_product_id").notNull(),
    productName: text("product_name").notNull(),
    productUrl: text("product_url").notNull(),
    urlHash: text("url_hash").notNull(),
    provenance: text("provenance").notNull(),
    completenessFlag: boolean("completeness_flag").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull(),
    correlationId: text("correlation_id").notNull(),
    /** Used for cache gating per spec (OCR-backed or confidence threshold). */
    confidenceScore: real("confidence_score"),
    /** Persisted product banner (GREEN / BLUE / … / YELLOW) for cache reads. */
    productClassification: productClassificationEnum("product_classification"),
    /** Snapshot of ingredient text used for this run (DOM/OCR-resolved). */
    rawIngredientText: text("raw_ingredient_text"),
    /** Optional PDP / marketing description when available. */
    productDescription: text("product_description"),
    /** Denormalized summary: winningReasonCode, tierCounts, etc. */
    analysisSummaryJson: jsonb("analysis_summary_json").$type<{
      winningReasonCode?: string;
      tierCounts?: { GREEN: number; BLUE: number; RED: number; BLACK: number };
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cacheLookupIdx: index("product_analyses_cache_lookup_idx").on(
      t.siteId,
      t.retailerProductId,
      t.urlHash,
    ),
    cachePipelineIdx: index("product_analyses_cache_pipeline_idx").on(
      t.siteId,
      t.retailerProductId,
      t.urlHash,
      t.pipelineVersion,
      t.schemaVersion,
      t.analyzedAt,
    ),
  }),
);

export const productAnalysisIngredients = pgTable("product_analysis_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => productAnalyses.id, { onDelete: "cascade" }),
  rawToken: text("raw_token").notNull(),
  normalizedIngredientId: uuid("normalized_ingredient_id").references(
    () => canonicalIngredients.id,
    { onDelete: "set null" },
  ),
  tierUsed: ingredientTierEnum("tier_used").notNull(),
  orderIndex: integer("order_index").notNull(),
  provenance: text("provenance").notNull(),
  displayNameSnapshot: text("display_name_snapshot"),
  matchConfidence: real("match_confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
