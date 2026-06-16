INSERT INTO canonical_ingredients (
  normalized_name, display_name, tier, description, function_description, data_source
) VALUES
  ('water', 'Water', 'GREEN', 'Universal solvent and base for many formulas.', 'Solvent', 'seed'),
  ('aqua', 'Aqua', 'GREEN', 'INCI name for water.', 'Solvent', 'seed'),
  ('glycerin', 'Glycerin', 'GREEN', 'Humectant commonly used in skincare.', 'Humectant', 'seed'),
  ('glycerol', 'Glycerol', 'GREEN', 'Alternate name for glycerin.', 'Humectant', 'seed'),
  ('aloe barbadensis leaf extract', 'Aloe Barbadensis Leaf Extract', 'GREEN', 'Botanical extract from aloe.', 'Skin conditioning', 'seed'),
  ('oat extract', 'Oat Extract', 'GREEN', 'Soothing botanical extract.', 'Skin conditioning', 'seed'),
  ('niacinamide', 'Niacinamide', 'GREEN', 'Form of vitamin B3 used widely in skincare.', 'Skin conditioning', 'seed'),
  ('citric acid', 'Citric Acid', 'GREEN', 'pH adjuster and chelating agent.', 'pH adjuster', 'seed'),
  ('tocopherol', 'Tocopherol', 'GREEN', 'Vitamin E antioxidant.', 'Antioxidant', 'seed'),
  ('phenoxyethanol', 'Phenoxyethanol', 'RED', 'Common preservative; may irritate sensitive skin.', 'Preservative', 'seed'),
  ('fragrance', 'Fragrance', 'BLUE', 'Fragrance blends can vary; some individuals are sensitive.', 'Fragrance', 'seed'),
  ('parfum', 'Parfum', 'BLUE', 'INCI term for fragrance.', 'Fragrance', 'seed'),
  ('formaldehyde', 'Formaldehyde', 'BLACK', 'Formaldehyde is a severe concern ingredient in many regulatory frameworks.', 'Preservative (legacy)', 'seed')
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'aqua' FROM canonical_ingredients WHERE normalized_name = 'water'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'glycerol' FROM canonical_ingredients WHERE normalized_name = 'glycerin'
ON CONFLICT (synonym) DO NOTHING;
