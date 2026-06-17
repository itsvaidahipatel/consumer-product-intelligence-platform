-- Common skincare INCI entries (CeraVe-style cleansers, serums, moisturizers).
INSERT INTO canonical_ingredients (
  normalized_name, display_name, tier, description, function_description, data_source
) VALUES
  ('hyaluronic acid', 'Hyaluronic Acid', 'GREEN', 'Humectant that helps skin retain moisture.', 'Humectant', 'seed'),
  ('sodium hyaluronate', 'Sodium Hyaluronate', 'GREEN', 'Salt form of hyaluronic acid; strong humectant.', 'Humectant', 'seed'),
  ('ceramide np', 'Ceramide NP', 'GREEN', 'Ceramide that supports the skin barrier.', 'Skin conditioning', 'seed'),
  ('ceramide ap', 'Ceramide AP', 'GREEN', 'Ceramide that supports the skin barrier.', 'Skin conditioning', 'seed'),
  ('ceramide eop', 'Ceramide EOP', 'GREEN', 'Ceramide that supports the skin barrier.', 'Skin conditioning', 'seed'),
  ('cholesterol', 'Cholesterol', 'GREEN', 'Lipid that supports barrier repair in moisturizers.', 'Skin conditioning', 'seed'),
  ('caprylic capric triglyceride', 'Caprylic/Capric Triglyceride', 'GREEN', 'Emollient derived from coconut/palm oils.', 'Emollient', 'seed'),
  ('cetearyl alcohol', 'Cetearyl Alcohol', 'GREEN', 'Fatty alcohol emulsifier and emollient.', 'Emollient', 'seed'),
  ('ceteareth 20', 'Ceteareth-20', 'BLUE', 'Emulsifier; generally well tolerated.', 'Emulsifier', 'seed'),
  ('dimethicone', 'Dimethicone', 'GREEN', 'Silicone emollient that reduces transepidermal water loss.', 'Emollient', 'seed'),
  ('carbomer', 'Carbomer', 'GREEN', 'Polymer thickener and stabilizer.', 'Viscosity controlling', 'seed'),
  ('xanthan gum', 'Xanthan Gum', 'GREEN', 'Natural polysaccharide thickener.', 'Viscosity controlling', 'seed'),
  ('disodium edta', 'Disodium EDTA', 'GREEN', 'Chelating agent that stabilizes formulas.', 'Chelating', 'seed'),
  ('sodium lauroyl lactylate', 'Sodium Lauroyl Lactylate', 'GREEN', 'Mild surfactant/emulsifier often used with ceramides.', 'Surfactant', 'seed'),
  ('phytosphingosine', 'Phytosphingosine', 'GREEN', 'Lipid precursor that supports barrier function.', 'Skin conditioning', 'seed')
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'sodium hyaluronate' FROM canonical_ingredients WHERE normalized_name = 'hyaluronic acid'
ON CONFLICT (synonym) DO NOTHING;

INSERT INTO ingredient_synonyms (ingredient_id, synonym)
SELECT id, 'ceramide 3' FROM canonical_ingredients WHERE normalized_name = 'ceramide np'
ON CONFLICT (synonym) DO NOTHING;
