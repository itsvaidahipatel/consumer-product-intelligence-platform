-- Common INCI ingredients (hairspray / fragrance allergen set) + slash-alias synonyms.

INSERT INTO canonical_ingredients (
  normalized_name, display_name, tier, description, function_description, data_source
) VALUES
  (
    'alcohol denat',
    'Alcohol Denat.',
    'BLUE',
    'Denatured ethyl alcohol; common solvent and carrier in aerosol hair products. Can be drying on skin.',
    'Solvent',
    'seed'
  ),
  (
    'dimethyl ether',
    'Dimethyl Ether',
    'BLUE',
    'Aerosol propellant used in spray hair and cosmetic products.',
    'Propellant',
    'seed'
  ),
  (
    'va/crotonates/vinyl neodecanoate copolymer',
    'VA/Crotonates/Vinyl Neodecanoate Copolymer',
    'BLUE',
    'Film-forming polymer that helps hold hairstyle in place.',
    'Film former',
    'seed'
  ),
  (
    'aminomethyl propanol',
    'Aminomethyl Propanol',
    'BLUE',
    'pH adjuster and buffering agent in cosmetic formulas.',
    'pH adjuster',
    'seed'
  ),
  (
    'triethyl citrate',
    'Triethyl Citrate',
    'GREEN',
    'Plasticizer and solvent; generally well tolerated in rinse-off and leave-on cosmetics.',
    'Plasticizer',
    'seed'
  ),
  (
    'benzyl salicylate',
    'Benzyl Salicylate',
    'BLUE',
    'Fragrance compound; listed fragrance allergen in EU cosmetics labeling.',
    'Fragrance',
    'seed'
  ),
  (
    'linalool',
    'Linalool',
    'BLUE',
    'Common fragrance terpene; frequent contact allergen in sensitive individuals.',
    'Fragrance',
    'seed'
  ),
  (
    'benzyl alcohol',
    'Benzyl Alcohol',
    'BLUE',
    'Preservative and fragrance component; may irritate very sensitive skin.',
    'Preservative',
    'seed'
  ),
  (
    'alpha-isomethyl ionone',
    'Alpha-Isomethyl Ionone',
    'BLUE',
    'Fragrance allergen; EU requires disclosure when present above labeling thresholds.',
    'Fragrance',
    'seed'
  ),
  (
    'octylacrylamide/acrylates/butylaminoethyl methacrylate copolymer',
    'Octylacrylamide/Acrylates/Butylaminoethyl Methacrylate Copolymer',
    'BLUE',
    'Polymer film former used in hair styling and hold products.',
    'Film former',
    'seed'
  ),
  (
    'citronellol',
    'Citronellol',
    'BLUE',
    'Fragrance alcohol common in floral scents; potential allergen.',
    'Fragrance',
    'seed'
  ),
  (
    'hexyl cinnamal',
    'Hexyl Cinnamal',
    'BLUE',
    'Fragrance allergen associated with floral and jasmine-like scents.',
    'Fragrance',
    'seed'
  )
ON CONFLICT (normalized_name) DO NOTHING;

-- Slash-alias and punctuation variants → existing or new canonical rows.
INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'aqua / water' FROM canonical_ingredients WHERE normalized_name = 'water'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'parfum / fragrance' FROM canonical_ingredients WHERE normalized_name = 'parfum'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'alcohol denat.' FROM canonical_ingredients WHERE normalized_name = 'alcohol denat'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'denatured alcohol' FROM canonical_ingredients WHERE normalized_name = 'alcohol denat'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'sd alcohol' FROM canonical_ingredients WHERE normalized_name = 'alcohol denat'
ON CONFLICT (synonym) DO NOTHING;
