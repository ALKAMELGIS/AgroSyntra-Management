-- Migration 032: PPP Product Data Sheet columns + seed 88 products
-- Adds columns matching the company PPP Data Sheet Excel template

-- Step 1: Add new columns (safe - IF NOT EXISTS)
ALTER TABLE pesticide_products
  ADD COLUMN IF NOT EXISTS target_crops TEXT,
  ADD COLUMN IF NOT EXISTS max_individual_dose VARCHAR(200),
  ADD COLUMN IF NOT EXISTS max_total_dose VARCHAR(200),
  ADD COLUMN IF NOT EXISTS max_applications VARCHAR(100),
  ADD COLUMN IF NOT EXISTS growth_stage VARCHAR(200),
  ADD COLUMN IF NOT EXISTS spray_interval VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phi_text TEXT,
  ADD COLUMN IF NOT EXISTS re_entry_interval VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bumble_bee_interval VARCHAR(200),
  ADD COLUMN IF NOT EXISTS chemical_category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS has_label_msds BOOLEAN DEFAULT false;

-- Step 2: Seed 88 products (update existing, insert new)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Acaristop
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Acaristop';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Clofentazine 500 g/l',
      target_pests = '["Mites"]',
      phi_days = 3,
      target_crops = 'Tomato, Strawberries,  Vegetables, Fruit trees & Ornamental plants',
      max_individual_dose = '0.3 ml / l',
      max_total_dose = '1500L/Ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days veg, 4 week fruit',
      re_entry_interval = '',
      bumble_bee_interval = '2 days out',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Acaristop';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Acaristop', 'Clofentazine 500 g/l', '["Mites"]', 3, 'Tomato, Strawberries,  Vegetables, Fruit trees & Ornamental plants', '0.3 ml / l', '1500L/Ha', 'N/A', 'All Stages', '7-10 days', '3 days veg, 4 week fruit', '', '2 days out', 'Acaricide', true, true);
  END IF;

  -- Actara
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Actara';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Thiamethoxam 25%',
      target_pests = '["white fly","Aphid","colorado beetls","bugs"]',
      phi_days = 0,
      target_crops = 'Tomato , Pepper, Egg Plant,   Cucumber',
      max_individual_dose = '125-250 g/ha.',
      max_total_dose = '1 kg/ha/season',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '0 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '>30 days out',
      chemical_category = '4A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Actara';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Actara', 'Thiamethoxam 25%', '["white fly","Aphid","colorado beetls","bugs"]', 0, 'Tomato , Pepper, Egg Plant,   Cucumber', '125-250 g/ha.', '1 kg/ha/season', 'N/A', 'All Stages', '7-10 days', '0 day', 'when the field is dry', '>30 days out', '4A', true, true);
  END IF;

  -- Affet
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Affet';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Penthiopyrad 20%,',
      target_pests = '["Gray mold","powdery mildew","Early blight","stem blight","leaf spots","botrytis blight","leaf spot","rust"]',
      phi_days = 1,
      target_crops = 'Tomato ,Eggplant,Pepper',
      max_individual_dose = '0.5ML/1 Lt',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 Days',
      phi_text = '1 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'Unknown Effects',
      chemical_category = 'Insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Affet';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Affet', 'Penthiopyrad 20%,', '["Gray mold","powdery mildew","Early blight","stem blight","leaf spots","botrytis blight","leaf spot","rust"]', 1, 'Tomato ,Eggplant,Pepper', '0.5ML/1 Lt', 'N/A', 'N/A', 'All Stages', '7 Days', '1 Day', 'when the field is dry', 'Unknown Effects', 'Insectcide', true, true);
  END IF;

  -- Agri - Flex
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Agri - Flex';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Thiamethoxam 13.9 %, Abamectin 3%',
      target_pests = '["Broud spider mites","whitefly","trips","aphids","boarers of vegetables"]',
      phi_days = 3,
      target_crops = 'Tomato, pepper, cucumber, wtermelon',
      max_individual_dose = '0.6 - 1 ml / 1 lit',
      max_total_dose = '2000 ml / ha',
      max_applications = '2',
      growth_stage = 'Early Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '>30 days out',
      chemical_category = '√',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Agri - Flex';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Agri - Flex', 'Thiamethoxam 13.9 %, Abamectin 3%', '["Broud spider mites","whitefly","trips","aphids","boarers of vegetables"]', 3, 'Tomato, pepper, cucumber, wtermelon', '0.6 - 1 ml / 1 lit', '2000 ml / ha', '2', 'Early Stages', '7 days', '3 days', 'when the field is dry', '>30 days out', '√', true, true);
  END IF;

  -- Aliette Express
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Aliette Express';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Fosetyl -al 80%',
      target_pests = '["Foliar Spray Of Drench Treatment"]',
      phi_days = 7,
      target_crops = 'Toamto ,Cucumber,Pepper,Eggplant',
      max_individual_dose = '2-3 GM/L Fo Water',
      max_total_dose = 'Ha/4 KG',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '14 Days',
      phi_text = '7-14 days',
      re_entry_interval = '14 Day',
      bumble_bee_interval = 'when the field is dry',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Aliette Express';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Aliette Express', 'Fosetyl -al 80%', '["Foliar Spray Of Drench Treatment"]', 7, 'Toamto ,Cucumber,Pepper,Eggplant', '2-3 GM/L Fo Water', 'Ha/4 KG', 'N/A', 'All Stages', '14 Days', '7-14 days', '14 Day', 'when the field is dry', '', true, true);
  END IF;

  -- Aliette express 80 wg
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Aliette express 80 wg';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'fosetyl-al 80%',
      target_pests = '["Pythium","Late blight","downey mildew"]',
      phi_days = 7,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.75ml-2ml',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '14 Days',
      phi_text = '07 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '33',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Aliette express 80 wg';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Aliette express 80 wg', 'fosetyl-al 80%', '["Pythium","Late blight","downey mildew"]', 7, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.75ml-2ml', 'N/A', 'N/A', 'All Stages', '14 Days', '07 days', 'when the field is dry', '2 days out', '33', true, true);
  END IF;

  -- Amistar Top
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Amistar Top';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '200gm/l azoxystrobin+125g/l difenoconazole',
      target_pests = '["Broad spectrum","Late blght","Early blight","powdery mildew"]',
      phi_days = 3,
      target_crops = 'Tomato',
      max_individual_dose = '0.5-0.7 l/ha',
      max_total_dose = '1500-2100 ml/ha',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '0 Day (cover)',
      chemical_category = '11 & 3',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Amistar Top';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Amistar Top', '200gm/l azoxystrobin+125g/l difenoconazole', '["Broad spectrum","Late blght","Early blight","powdery mildew"]', 3, 'Tomato', '0.5-0.7 l/ha', '1500-2100 ml/ha', '3', 'All Stages', '7 days', '3 days', 'when the field is dry', '0 Day (cover)', '11 & 3', true, true);
  END IF;

  -- Anvir
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Anvir';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Fongous Proteoglycal 1% Inert 99 %',
      target_pests = '["Mosclic virus Disease Leaf Curl Virus Other Virus"]',
      phi_days = 1,
      target_crops = 'Tomato ,Cucumber,Melon,Pepper Leafy Vegetable',
      max_individual_dose = '',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 To 3 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Anvir';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Anvir', 'Fongous Proteoglycal 1% Inert 99 %', '["Mosclic virus Disease Leaf Curl Virus Other Virus"]', 1, 'Tomato ,Cucumber,Melon,Pepper Leafy Vegetable', '', 'N/A', 'N/A', 'All Stages', '7 days', '1 To 3 Day', 'when the field is dry', 'No result', '', true, true);
  END IF;

  -- Apollo
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Apollo';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Clofentazine 500 g/l',
      target_pests = '["Spider mite ( Eggs)"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.4 litres/hectare',
      max_total_dose = '0.4 litres/hectare',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = 'N/A',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '10A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Apollo';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Apollo', 'Clofentazine 500 g/l', '["Spider mite ( Eggs)"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.4 litres/hectare', '0.4 litres/hectare', '1', 'All Stages', 'N/A', '3 days', 'when the field is dry', 'cover', '10A', true, true);
  END IF;

  -- Baiclean
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Baiclean';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'oligo saccharin 5 %,organic matter 15 %,  total nitrogen 8 %',
      target_pests = '["Downy mildew","Early blight","Anthracnose","Angular leaf spot","soft rot","Fusarium wilt"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1 ml/L',
      max_total_dose = '4 L/ha',
      max_applications = '4',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Baiclean';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Baiclean', 'oligo saccharin 5 %,organic matter 15 %,  total nitrogen 8 %', '["Downy mildew","Early blight","Anthracnose","Angular leaf spot","soft rot","Fusarium wilt"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1 ml/L', '4 L/ha', '4', 'All Stages', '7-10 days', '3 days', 'when the field is dry', 'No result', 'Acaricide', true, true);
  END IF;

  -- Benevia
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Benevia';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cyantraniliprole 10.26 % Inert Ingerdient 89.74 %',
      target_pests = '["Beet Army Worm Potato Tuber  Worm","thrips"]',
      phi_days = 1,
      target_crops = 'Tuberous And  Cron Vegetable',
      max_individual_dose = '0.5-1Ml/Ltr',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 Days',
      phi_text = '1 Day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '0 days',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Benevia';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Benevia', 'Cyantraniliprole 10.26 % Inert Ingerdient 89.74 %', '["Beet Army Worm Potato Tuber  Worm","thrips"]', 1, 'Tuberous And  Cron Vegetable', '0.5-1Ml/Ltr', 'N/A', 'N/A', 'All Stages', '7 Days', '1 Day', '12 hours', '0 days', 'Acaricide', true, true);
  END IF;

  -- Bitam 25 EC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Bitam 25 EC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Deltamethrin 2.5%',
      target_pests = '["worm"]',
      phi_days = 2,
      target_crops = 'Tomato',
      max_individual_dose = '0.5-0.75 ml/l',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '2 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '3A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Bitam 25 EC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Bitam 25 EC', 'Deltamethrin 2.5%', '["worm"]', 2, 'Tomato', '0.5-0.75 ml/l', 'N/A', 'N/A', 'All Stages', '7 days', '2 days', 'when the field is dry', '2 days out', '3A', true, true);
  END IF;

  -- Bizantion 240 Sc
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Bizantion 240 Sc';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '240 g/l Spiromesifen',
      target_pests = '["Whitefly","Spidermite"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.5 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '23A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Bizantion 240 Sc';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Bizantion 240 Sc', '240 g/l Spiromesifen', '["Whitefly","Spidermite"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.5 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '3 days', 'when the field is dry', 'cover', '23A', true, true);
  END IF;

  -- Bolton EC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Bolton EC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Gamma-Cyhalothrin10g/l,Chlorpyyrifos300g/l',
      target_pests = '["worm"]',
      phi_days = 3,
      target_crops = '',
      max_individual_dose = '1 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Bolton EC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Bolton EC', 'Gamma-Cyhalothrin10g/l,Chlorpyyrifos300g/l', '["worm"]', 3, '', '1 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '3 days', 'when the field is dry', 'No result', 'Acaricide', true, true);
  END IF;

  -- Calypso
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Calypso';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Thiaclopri 480 g/l',
      target_pests = '["Aphid","Thrips"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.2-0.3 g/ltr',
      max_total_dose = '400-600 g/ha',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '4A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Calypso';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Calypso', 'Thiaclopri 480 g/l', '["Aphid","Thrips"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.2-0.3 g/ltr', '400-600 g/ha', '3', 'All Stages', '7 days', '3 days', '12 hours', '1 day out', '4A', true, true);
  END IF;

  -- Carial Star
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Carial Star';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Mandipropgmid 21.9 % Difeno Conazole 21.9 % Inert Ingredient 56.2 %',
      target_pests = '["Phytophihora Insfestans"]',
      phi_days = 3,
      target_crops = 'Tomato Potato',
      max_individual_dose = '0.8l/Ha',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '3 days',
      phi_text = '3 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'Unknown Effects',
      chemical_category = 'Insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Carial Star';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Carial Star', 'Mandipropgmid 21.9 % Difeno Conazole 21.9 % Inert Ingredient 56.2 %', '["Phytophihora Insfestans"]', 3, 'Tomato Potato', '0.8l/Ha', 'N/A', 'N/A', 'All Stages', '3 days', '3 Day', 'when the field is dry', 'Unknown Effects', 'Insectcide', true, true);
  END IF;

  -- Chess
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Chess';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'pymetrozine 500 gr/ltr',
      target_pests = '["white fly","Aphid"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,',
      max_individual_dose = '200 gr/ha',
      max_total_dose = '600-1200 gr/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'cover',
      chemical_category = '9B',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Chess';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Chess', 'pymetrozine 500 gr/ltr', '["white fly","Aphid"]', 3, 'Tomato , Pepper, Egg Plant,', '200 gr/ha', '600-1200 gr/ha', '2', 'All Stages', '7 days', '3 days', '12 hours', 'cover', '9B', true, true);
  END IF;

  -- Closer
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Closer';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Sulfoxaflor 240g/l+ inert ingredient 760g/l',
      target_pests = '["Aphids","white fly"]',
      phi_days = 1,
      target_crops = 'pepper, tomato , eggplant,melon, watermelon',
      max_individual_dose = '100-150ml/ha',
      max_total_dose = '300ml/ha/season',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'No result',
      chemical_category = '4C',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Closer';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Closer', 'Sulfoxaflor 240g/l+ inert ingredient 760g/l', '["Aphids","white fly"]', 1, 'pepper, tomato , eggplant,melon, watermelon', '100-150ml/ha', '300ml/ha/season', '2', 'All Stages', '7 days', '1 day', '12 hours', 'No result', '4C', true, true);
  END IF;

  -- Cobre Key
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Cobre Key';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Copper Oxychloride 50 %',
      target_pests = '["Early and Late Blight","Septoria leaf spot","Bacterial Spot"]',
      phi_days = 0,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '3-4 kg/ha',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '0',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = 'M1(Inorganic)',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Cobre Key';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Cobre Key', 'Copper Oxychloride 50 %', '["Early and Late Blight","Septoria leaf spot","Bacterial Spot"]', 0, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '3-4 kg/ha', 'N/A', 'N/A', 'All Stages', '7-10 days', '0', 'when the field is dry', 'cover', 'M1(Inorganic)', true, true);
  END IF;

  -- consento sc 450
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'consento sc 450';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'fenamidone+propamocarb hydrochloride(75+375)g/l',
      target_pests = '["late blight","early blight","downy mildew"]',
      phi_days = 3,
      target_crops = 'potato,tomato,cucumber,melon,onion,leek,lettuce',
      max_individual_dose = '25-40ml/20L of water',
      max_total_dose = '3.75L-6L/ha/season',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'N/A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'consento sc 450';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('consento sc 450', 'fenamidone+propamocarb hydrochloride(75+375)g/l', '["late blight","early blight","downy mildew"]', 3, 'potato,tomato,cucumber,melon,onion,leek,lettuce', '25-40ml/20L of water', '3.75L-6L/ha/season', '3', 'All Stages', '7 days', '3 days', 'when the field is dry', 'No result', 'N/A', true, true);
  END IF;

  -- Coragen
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Coragen';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Chlorantraniliprole 200 g/l',
      target_pests = '["Tuta","Fruit worm","cut worm"]',
      phi_days = 0,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.25 ml/l',
      max_total_dose = '1.25 ml/ha/season',
      max_applications = '4',
      growth_stage = 'All Stages',
      spray_interval = '5 days',
      phi_text = '0 day ( Cover )',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'cover',
      chemical_category = '28 Insicide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Coragen';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Coragen', 'Chlorantraniliprole 200 g/l', '["Tuta","Fruit worm","cut worm"]', 0, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.25 ml/l', '1.25 ml/ha/season', '4', 'All Stages', '5 days', '0 day ( Cover )', '12 hours', 'cover', '28 Insicide', true, true);
  END IF;

  -- Danisaraba
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Danisaraba';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cyflumetofen 20% SC',
      target_pests = '["Spider mites","broad mites"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant, Squash, water melon Water Melon , Cucumber',
      max_individual_dose = '1 ml / 1 lit',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = 'when the filed dry',
      bumble_bee_interval = 'cover',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Danisaraba';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Danisaraba', 'Cyflumetofen 20% SC', '["Spider mites","broad mites"]', 1, 'Tomato , Pepper, Egg Plant, Squash, water melon Water Melon , Cucumber', '1 ml / 1 lit', 'N/A', 'N/A', 'All Stages', '7 days', '1 day', 'when the filed dry', 'cover', 'Acaricide', true, true);
  END IF;

  -- Decis
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Decis';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Deltamethrin 2.5% Additeves 97.5 %',
      target_pests = '["Aphids","Whitefly"]',
      phi_days = 3,
      target_crops = 'Cucumber,Pepper ,Tomato ,Laf,Fruit,',
      max_individual_dose = '',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3Day',
      re_entry_interval = 'when the filed dry',
      bumble_bee_interval = '3 days out',
      chemical_category = 'Insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Decis';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Decis', 'Deltamethrin 2.5% Additeves 97.5 %', '["Aphids","Whitefly"]', 3, 'Cucumber,Pepper ,Tomato ,Laf,Fruit,', '', 'N/A', 'N/A', 'All Stages', '7 days', '3Day', 'when the filed dry', '3 days out', 'Insectcide', true, true);
  END IF;

  -- Demon Max
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Demon Max';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cypermethrin25.3% ( W/w) inert ingerdient 74.7%1 W/W',
      target_pests = '[]',
      phi_days = 0,
      target_crops = '',
      max_individual_dose = '',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '',
      phi_text = '',
      re_entry_interval = '',
      bumble_bee_interval = '',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Demon Max';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Demon Max', 'Cypermethrin25.3% ( W/w) inert ingerdient 74.7%1 W/W', '[]', 0, '', '', 'N/A', 'N/A', 'All Stages', '', '', '', '', '', true, true);
  END IF;

  -- Diaflex
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Diaflex';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'sulfur 80%',
      target_pests = '["powdery mildew"]',
      phi_days = 7,
      target_crops = 'pepper, tomato , eggplant,melon, watermelon',
      max_individual_dose = '4g/l',
      max_total_dose = '20kg-24kg/season',
      max_applications = '5-6 times',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = 'M2',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Diaflex';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Diaflex', 'sulfur 80%', '["powdery mildew"]', 7, 'pepper, tomato , eggplant,melon, watermelon', '4g/l', '20kg-24kg/season', '5-6 times', 'All Stages', '7 days', '7 days', 'when the field is dry', '2 days out', 'M2', true, true);
  END IF;

  -- Endigo ZC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Endigo ZC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Lambda-cyhalothrin 9.48%',
      target_pests = '["Mite","thrips","tuta","aphids","whitefly"]',
      phi_days = 5,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7days',
      phi_text = '5 days fo tomato & pepper & 1 day for watermelon & cucumber',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '15 days',
      chemical_category = '3A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Endigo ZC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Endigo ZC', 'Lambda-cyhalothrin 9.48%', '["Mite","thrips","tuta","aphids","whitefly"]', 5, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1 ml/L', 'N/A', 'N/A', 'All Stages', '7days', '5 days fo tomato & pepper & 1 day for watermelon & cucumber', 'when the field is dry', '15 days', '3A', true, true);
  END IF;

  -- Equation Pro
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Equation Pro';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Famoxadone 200 g/kg + cymoxanil 300 g/kg',
      target_pests = '["Doweny mildew/ early and late blight"]',
      phi_days = 3,
      target_crops = 'Grapes/ vegetable',
      max_individual_dose = '0.4 g/L',
      max_total_dose = '2500 g/ha',
      max_applications = '5',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 /(28)days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover/no result',
      chemical_category = '27 &11',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Equation Pro';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Equation Pro', 'Famoxadone 200 g/kg + cymoxanil 300 g/kg', '["Doweny mildew/ early and late blight"]', 3, 'Grapes/ vegetable', '0.4 g/L', '2500 g/ha', '5', 'All Stages', '7-10 days', '3 /(28)days', 'when the field is dry', 'cover/no result', '27 &11', true, true);
  END IF;

  -- Equation Pro
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Equation Pro';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cymoxanil30% Famoxadone 22.5 % Inert Ingredient 47.5 %',
      target_pests = '["Blight"]',
      phi_days = 3,
      target_crops = 'Tomato,Cherry Tomato',
      max_individual_dose = '0.4Ml/1 Ha',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '',
      phi_text = '3 Day',
      re_entry_interval = '',
      bumble_bee_interval = '',
      chemical_category = '27 & 11',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Equation Pro';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Equation Pro', 'Cymoxanil30% Famoxadone 22.5 % Inert Ingredient 47.5 %', '["Blight"]', 3, 'Tomato,Cherry Tomato', '0.4Ml/1 Ha', 'N/A', 'N/A', 'All Stages', '', '3 Day', '', '', '27 & 11', true, true);
  END IF;

  -- Flint 50 WG
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Flint 50 WG';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'trifloxystrobin 500g/kg',
      target_pests = '["Leaf Rust","Anthracnose","bacterial spot","bacterial kanker","powdery mildew"]',
      phi_days = 3,
      target_crops = 'Root vegetables',
      max_individual_dose = '0.25-0.5 g/l',
      max_total_dose = '1250-2500 g/ha',
      max_applications = '5',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover/no result',
      chemical_category = '11',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Flint 50 WG';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Flint 50 WG', 'trifloxystrobin 500g/kg', '["Leaf Rust","Anthracnose","bacterial spot","bacterial kanker","powdery mildew"]', 3, 'Root vegetables', '0.25-0.5 g/l', '1250-2500 g/ha', '5', 'All Stages', '7-10 days', '3 days', 'when the field is dry', 'cover/no result', '11', true, true);
  END IF;

  -- Floramite
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Floramite';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Bifenazate 22.6%',
      target_pests = '["Spider mite(Adult stage)"]',
      phi_days = 0,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '600 ml/ha',
      max_total_dose = '1200 ml/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = 'twice per year',
      phi_text = '0 day for tomato & 1 day, for others',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'No action(0 day)',
      chemical_category = '20D',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Floramite';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Floramite', 'Bifenazate 22.6%', '["Spider mite(Adult stage)"]', 0, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '600 ml/ha', '1200 ml/ha', '2', 'All Stages', 'twice per year', '0 day for tomato & 1 day, for others', '12 hours', 'No action(0 day)', '20D', true, true);
  END IF;

  -- Folicur 250 EW
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Folicur 250 EW';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Tebuconazole 250 g/l',
      target_pests = '["Early bligh"]',
      phi_days = 7,
      target_crops = 'Tomato',
      max_individual_dose = '0.75 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '7 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '3',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Folicur 250 EW';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Folicur 250 EW', 'Tebuconazole 250 g/l', '["Early bligh"]', 7, 'Tomato', '0.75 ml/L', 'N/A', 'N/A', 'All Stages', '7-10 days', '7 days', 'when the field is dry', '2 days out', '3', true, true);
  END IF;

  -- Fungistop
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Fungistop';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'sulphur 72%',
      target_pests = '["powdery mildew","Spider mite (secondary miticidal activity)"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '2 -6 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '21 days',
      phi_text = '3 days',
      re_entry_interval = 'when the  field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = 'M2(Inorganic)',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Fungistop';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Fungistop', 'sulphur 72%', '["powdery mildew","Spider mite (secondary miticidal activity)"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '2 -6 ml/L', 'N/A', 'N/A', 'All Stages', '21 days', '3 days', 'when the  field is dry', '2 days out', 'M2(Inorganic)', true, true);
  END IF;

  -- Gracia EC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Gracia EC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Fluxametamide 10%',
      target_pests = '["Thrips","Mite","Whitefliy","Spider mite`Worm","Tuta"]',
      phi_days = 1,
      target_crops = 'Tomato ,Eggplant,Pepper',
      max_individual_dose = '0.5/1Ltr',
      max_total_dose = '11/Ha',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = '30 days',
      phi_text = '1 Day ( Lettus 3 days )',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'Unknown Effects',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Gracia EC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Gracia EC', 'Fluxametamide 10%', '["Thrips","Mite","Whitefliy","Spider mite`Worm","Tuta"]', 1, 'Tomato ,Eggplant,Pepper', '0.5/1Ltr', '11/Ha', '1', 'All Stages', '30 days', '1 Day ( Lettus 3 days )', '12 hours', 'Unknown Effects', 'Acaricide', true, true);
  END IF;

  -- Imaxi
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Imaxi';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Imidacloprid 350 g/l SC',
      target_pests = '["Aphids","Worms","White fly","leafminer"]',
      phi_days = 7,
      target_crops = 'Tomato, Cabbage, Apple, Potato, Eggplant, Beans, Okra, Citrus',
      max_individual_dose = '0.4 ml / lit',
      max_total_dose = '',
      max_applications = '',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 days',
      re_entry_interval = '24 hour',
      bumble_bee_interval = '30 days',
      chemical_category = 'Acaricide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Imaxi';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Imaxi', 'Imidacloprid 350 g/l SC', '["Aphids","Worms","White fly","leafminer"]', 7, 'Tomato, Cabbage, Apple, Potato, Eggplant, Beans, Okra, Citrus', '0.4 ml / lit', '', '', 'All Stages', '7 days', '7 days', '24 hour', '30 days', 'Acaricide', true, true);
  END IF;

  -- Kanemite SC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Kanemite SC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Acequinocyl 15 %',
      target_pests = '["Two Spoted  Spider mite ( mainly for nymphs and  slightly for Adult)","but is not effective against rust mites."]',
      phi_days = 1,
      target_crops = 'Eggplant',
      max_individual_dose = '2.1 l/ha',
      max_total_dose = '1340-2000 ml/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '3 weeks',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '20B',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Kanemite SC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Kanemite SC', 'Acequinocyl 15 %', '["Two Spoted  Spider mite ( mainly for nymphs and  slightly for Adult)","but is not effective against rust mites."]', 1, 'Eggplant', '2.1 l/ha', '1340-2000 ml/ha', '2', 'All Stages', '3 weeks', '1 day', '12 hours', '1 day out', '20B', true, true);
  END IF;

  -- Kingbo
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Kingbo';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Matrine 0.6 %',
      target_pests = '["Spider mite(Adult stage)","Aphids","whitefly"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1.5-2 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = 'when the  field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'organic',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Kingbo';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Kingbo', 'Matrine 0.6 %', '["Spider mite(Adult stage)","Aphids","whitefly"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1.5-2 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '1 day', 'when the  field is dry', 'No result', 'organic', true, true);
  END IF;

  -- Kocide
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Kocide';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Copper hydroxide 53.8% metallic copper 35% inerts 46.2%',
      target_pests = '["Broad sepectum","Botrytis","Early blight","Late blight","BacteriaL spot","Anthracose"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '2.24 - 2.5 g/L',
      max_total_dose = '22.4-25kg/ha',
      max_applications = '10',
      growth_stage = 'All Stages',
      spray_interval = '7-14 Ddays',
      phi_text = '1 days',
      re_entry_interval = '4 hours',
      bumble_bee_interval = '2 days out',
      chemical_category = 'M1(Inorganic)',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Kocide';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Kocide', 'Copper hydroxide 53.8% metallic copper 35% inerts 46.2%', '["Broad sepectum","Botrytis","Early blight","Late blight","BacteriaL spot","Anthracose"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '2.24 - 2.5 g/L', '22.4-25kg/ha', '10', 'All Stages', '7-14 Ddays', '1 days', '4 hours', '2 days out', 'M1(Inorganic)', true, true);
  END IF;

  -- laotta
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'laotta';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'abamectin1.8%',
      target_pests = '["mites","liryomiza"]',
      phi_days = 3,
      target_crops = 'pepper, tomato',
      max_individual_dose = '0.5-1ml/L',
      max_total_dose = '1.5-3L/ha/season',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '6',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'laotta';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('laotta', 'abamectin1.8%', '["mites","liryomiza"]', 3, 'pepper, tomato', '0.5-1ml/L', '1.5-3L/ha/season', '3', 'All Stages', '7 days', '3 days', 'when the field is dry', '2 days out', '6', true, true);
  END IF;

  -- Leafdrip-sil 21
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Leafdrip-sil 21';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'water soluble potash as k20 ,si20',
      target_pests = '["preventive for pesticide and diseases"]',
      phi_days = 0,
      target_crops = 'vegetables ,',
      max_individual_dose = '200-300ml/100L of water',
      max_total_dose = '2-3L/ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '0 days',
      phi_text = 'N/A',
      re_entry_interval = 'N/A',
      bumble_bee_interval = 'No result',
      chemical_category = 'N/A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Leafdrip-sil 21';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Leafdrip-sil 21', 'water soluble potash as k20 ,si20', '["preventive for pesticide and diseases"]', 0, 'vegetables ,', '200-300ml/100L of water', '2-3L/ha', 'N/A', 'All Stages', '0 days', 'N/A', 'N/A', 'No result', 'N/A', true, true);
  END IF;

  -- Match 050 EC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Match 050 EC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Lufenuron',
      target_pests = '["Tuta","Thrips","cut worm","leaf miner","fruit worm"]',
      phi_days = 7,
      target_crops = 'Tomato , Pepper, Egg Plant,',
      max_individual_dose = '0.4 -0.6 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 days for tomato',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '2-3 days out',
      chemical_category = '15',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Match 050 EC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Match 050 EC', 'Lufenuron', '["Tuta","Thrips","cut worm","leaf miner","fruit worm"]', 7, 'Tomato , Pepper, Egg Plant,', '0.4 -0.6 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '7 days for tomato', '12 hours', '2-3 days out', '15', true, true);
  END IF;

  -- Milbeknock
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Milbeknock';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Milbemectin 1%',
      target_pests = '["Spider mite","broad mite","white fly","Aphids"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1-1.5ml/L',
      max_total_dose = '2500 ml/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '14 days interval',
      phi_text = '1 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '6',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Milbeknock';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Milbeknock', 'Milbemectin 1%', '["Spider mite","broad mite","white fly","Aphids"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1-1.5ml/L', '2500 ml/ha', '2', 'All Stages', '14 days interval', '1 day', 'when the field is dry', 'cover', '6', true, true);
  END IF;

  -- Mimic
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Mimic';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Tebufenozide-20% Water,Surfactant-80 %',
      target_pests = '["Common Cut Worm","TutaAbsuluta","Spodoptera","Spp","Army Worm","Mamestra Spp","Commo Cut Worm","Aedia"]',
      phi_days = 1,
      target_crops = 'Tomato,Pepper,Eggplant Cabbage,Sweet Potato',
      max_individual_dose = 'Ml/100L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 Day',
      re_entry_interval = '12',
      bumble_bee_interval = 'close and cover',
      chemical_category = 'insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Mimic';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Mimic', 'Tebufenozide-20% Water,Surfactant-80 %', '["Common Cut Worm","TutaAbsuluta","Spodoptera","Spp","Army Worm","Mamestra Spp","Commo Cut Worm","Aedia"]', 1, 'Tomato,Pepper,Eggplant Cabbage,Sweet Potato', 'Ml/100L', 'N/A', 'N/A', 'All Stages', '7 days', '1 Day', '12', 'close and cover', 'insectcide', true, true);
  END IF;

  -- Miteclean SC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Miteclean SC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'pyrimidifen  4%',
      target_pests = '["two spoted","red","rust mites","leaf roller"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = 'N/A',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'No result',
      chemical_category = '21A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Miteclean SC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Miteclean SC', 'pyrimidifen  4%', '["two spoted","red","rust mites","leaf roller"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1ml/L', 'N/A', 'N/A', 'All Stages', 'N/A', '1 day', '12 hours', 'No result', '21A', true, true);
  END IF;

  -- Mospilan
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Mospilan';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Acetamiprid 20%',
      target_pests = '["white fly and american Leaf miner"]',
      phi_days = 1,
      target_crops = 'Tomato',
      max_individual_dose = '0.5 g/l',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '0 day',
      chemical_category = '4A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Mospilan';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Mospilan', 'Acetamiprid 20%', '["white fly and american Leaf miner"]', 1, 'Tomato', '0.5 g/l', 'N/A', 'N/A', 'All Stages', '7 days', '1 days', 'when the field is dry', '0 day', '4A', true, true);
  END IF;

  -- Movento
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Movento';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'spirotetramat 240 g/L',
      target_pests = '["white fly and Aphid"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.25-0.365 ml/ha',
      max_total_dose = '730 ml/ha',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '23',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Movento';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Movento', 'spirotetramat 240 g/L', '["white fly and Aphid"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.25-0.365 ml/ha', '730 ml/ha', '3', 'All Stages', '7 days', '1 day', '12 hours', '1 day out', '23', true, true);
  END IF;

  -- Nema Kill
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Nema Kill';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cinnamaidehyde, Saponin',
      target_pests = '["Root knot nematode","root lesion nematod","other nematodes"]',
      phi_days = 1,
      target_crops = 'All vegetabels and crops and dates and fruit trees',
      max_individual_dose = '1 ml / 1 lit, drenching',
      max_total_dose = '4000 ml / ha',
      max_applications = '4',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day veg, 3 days fruit',
      re_entry_interval = '4 hours',
      bumble_bee_interval = 'close',
      chemical_category = 'Nematicide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Nema Kill';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Nema Kill', 'Cinnamaidehyde, Saponin', '["Root knot nematode","root lesion nematod","other nematodes"]', 1, 'All vegetabels and crops and dates and fruit trees', '1 ml / 1 lit, drenching', '4000 ml / ha', '4', 'All Stages', '7 days', '1 day veg, 3 days fruit', '4 hours', 'close', 'Nematicide', true, true);
  END IF;

  -- Nissorun
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Nissorun';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Hexythiazox',
      target_pests = '["S.mite ovicidal","lavicidal and  nymphicidal activity"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.3-0.5 g/L',
      max_total_dose = '1Ltr',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '10 days',
      phi_text = '1 Day',
      re_entry_interval = '4 hours',
      bumble_bee_interval = 'cover',
      chemical_category = '10A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Nissorun';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Nissorun', 'Hexythiazox', '["S.mite ovicidal","lavicidal and  nymphicidal activity"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.3-0.5 g/L', '1Ltr', 'N/A', 'All Stages', '10 days', '1 Day', '4 hours', 'cover', '10A', true, true);
  END IF;

  -- Noctrun
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Noctrun';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Pyridalyl',
      target_pests = '["Thrips"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1 ml / 1 lit',
      max_total_dose = '1000 ml/heactor',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover and out',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Noctrun';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Noctrun', 'Pyridalyl', '["Thrips"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1 ml / 1 lit', '1000 ml/heactor', '2', 'All Stages', '7 days', '3 days', 'when the field is dry', 'cover and out', '', true, true);
  END IF;

  -- Novamite Sc
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Novamite Sc';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Etoxazole 110g/l inerts UP To 100%',
      target_pests = '["two spotted Mite ( Eggs","Larvea and Nymph Stages)"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper,  Water Melon',
      max_individual_dose = '0.35 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '3 days out',
      chemical_category = '10B',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Novamite Sc';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Novamite Sc', 'Etoxazole 110g/l inerts UP To 100%', '["two spotted Mite ( Eggs","Larvea and Nymph Stages)"]', 3, 'Tomato , Pepper,  Water Melon', '0.35 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '3days', 'when the field is dry', '3 days out', '10B', true, true);
  END IF;

  -- Oberon
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Oberon';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '240 g a.i/L Spiromesifen',
      target_pests = '["whitefly","Spidermite","thrips"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.4 - 0.6 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '0 Day',
      chemical_category = '23',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Oberon';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Oberon', '240 g a.i/L Spiromesifen', '["whitefly","Spidermite","thrips"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.4 - 0.6 ml/L', 'N/A', 'N/A', 'All Stages', '7 days', '3 days', 'when the field is dry', '0 Day', '23', true, true);
  END IF;

  -- Oberon Speed
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Oberon Speed';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Spiromesifen 21.57%,Abamectin 1.08%',
      target_pests = '["Whitefly","Broad mite","Spider mite"]',
      phi_days = 7,
      target_crops = 'Tomato ,Eggplant,Pepper',
      max_individual_dose = '0.5-0.6ml/l',
      max_total_dose = '1 Ltr - 1.2Ltr/Ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 Day',
      re_entry_interval = '',
      bumble_bee_interval = '0 Day',
      chemical_category = 'Insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Oberon Speed';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Oberon Speed', 'Spiromesifen 21.57%,Abamectin 1.08%', '["Whitefly","Broad mite","Spider mite"]', 7, 'Tomato ,Eggplant,Pepper', '0.5-0.6ml/l', '1 Ltr - 1.2Ltr/Ha', 'N/A', 'All Stages', '7 days', '7 Day', '', '0 Day', 'Insectcide', true, true);
  END IF;

  -- Ortiva
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Ortiva';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Azoxystrobin 250g/L Inerts 750g/L',
      target_pests = '["Powdery Mildew","Downy Mildew"]',
      phi_days = 3,
      target_crops = 'Tomato ,Cucumber,Squash,Melon',
      max_individual_dose = '0.5ml/l',
      max_total_dose = '1ltr/Ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '14 days',
      phi_text = '3 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '0 days ( cover )',
      chemical_category = '11 ( fungicide )',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Ortiva';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Ortiva', 'Azoxystrobin 250g/L Inerts 750g/L', '["Powdery Mildew","Downy Mildew"]', 3, 'Tomato ,Cucumber,Squash,Melon', '0.5ml/l', '1ltr/Ha', '2', 'All Stages', '14 days', '3 Day', 'when the field is dry', '0 days ( cover )', '11 ( fungicide )', true, true);
  END IF;

  -- Persidium
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Persidium';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Zoxamide gm/l 180 Dimethomorph g/l 180 inerts Ingredient  gm/l 640',
      target_pests = '["Phytophihora Insfestans"]',
      phi_days = 7,
      target_crops = 'Potato',
      max_individual_dose = '0.5ml/ltr',
      max_total_dose = '1Ltr/Ha',
      max_applications = '5',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'Unknown Effects',
      chemical_category = 'B3',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Persidium';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Persidium', 'Zoxamide gm/l 180 Dimethomorph g/l 180 inerts Ingredient  gm/l 640', '["Phytophihora Insfestans"]', 7, 'Potato', '0.5ml/ltr', '1Ltr/Ha', '5', 'All Stages', '7 days', '7 Day', 'when the field is dry', 'Unknown Effects', 'B3', true, true);
  END IF;

  -- Previcur
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Previcur';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'propamocarb',
      target_pests = '["Pythium","Fusarium wilt","Late blight","Doweny mildew"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = 'Drench-3L/ha  Floiar- 2.5 L/ha',
      max_total_dose = 'Drench-3L/ha  Floiar- 2.5 L/ha',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '1 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '28',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Previcur';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Previcur', 'propamocarb', '["Pythium","Fusarium wilt","Late blight","Doweny mildew"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', 'Drench-3L/ha  Floiar- 2.5 L/ha', 'Drench-3L/ha  Floiar- 2.5 L/ha', '1', 'All Stages', '7-10 days', '1 day', 'when the field is dry', 'cover', '28', true, true);
  END IF;

  -- Priden Acarricide
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Priden Acarricide';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Pyridaben 20% Additeves 80 %',
      target_pests = '["Two Spotted Red Mite","larveaAdult"]',
      phi_days = 3,
      target_crops = 'Tomato ,Cucumber',
      max_individual_dose = '',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 Day',
      re_entry_interval = '',
      bumble_bee_interval = '1 days out',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Priden Acarricide';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Priden Acarricide', 'Pyridaben 20% Additeves 80 %', '["Two Spotted Red Mite","larveaAdult"]', 3, 'Tomato ,Cucumber', '', 'N/A', 'N/A', 'All Stages', '7 days', '3 Day', '', '1 days out', '', true, true);
  END IF;

  -- Proclaim
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Proclaim';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Emamectin benzoate 5%, inert 95%',
      target_pests = '["Tuta","cut worm","fruit worm and slightly work for Spider Mite"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '250-400 g/ha',
      max_total_dose = '1000-1600 g/ha',
      max_applications = '4',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day tomato  5 days Pepper',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '6A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Proclaim';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Proclaim', 'Emamectin benzoate 5%, inert 95%', '["Tuta","cut worm","fruit worm and slightly work for Spider Mite"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '250-400 g/ha', '1000-1600 g/ha', '4', 'All Stages', '7 days', '1 day tomato  5 days Pepper', '12 hours', '1 day out', '6A', true, true);
  END IF;

  -- Proplant 72.2 sl
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Proplant 72.2 sl';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'propamocarb HLC',
      target_pests = '["Pythium","Fusarium wilt","Late blight","Doweny mildew"]',
      phi_days = 2,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1 ml/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '2 days',
      re_entry_interval = '4 hours',
      bumble_bee_interval = 'cover',
      chemical_category = '28',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Proplant 72.2 sl';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Proplant 72.2 sl', 'propamocarb HLC', '["Pythium","Fusarium wilt","Late blight","Doweny mildew"]', 2, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1 ml/L', 'N/A', 'N/A', 'All Stages', '7-10 days', '2 days', '4 hours', 'cover', '28', true, true);
  END IF;

  -- Quinondo
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Quinondo';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '40% copper 8-Quinolinolate',
      target_pests = '["Early and Late Blight","Septoria leaf spot","Bacterial Spot","botrytis"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '2g/L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = 'N/A',
      phi_text = '1',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'M1(Inorganic)',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Quinondo';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Quinondo', '40% copper 8-Quinolinolate', '["Early and Late Blight","Septoria leaf spot","Bacterial Spot","botrytis"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '2g/L', 'N/A', 'N/A', 'All Stages', 'N/A', '1', 'when the field is dry', 'No result', 'M1(Inorganic)', true, true);
  END IF;

  -- Radiant SC
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Radiant SC';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Spinetoram 120 g/l',
      target_pests = '["Tuta","Thrips","army worm","leaf miner","fruit worm"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '375-750 ml/ha',
      max_total_dose = '2250-4500 ml/ha',
      max_applications = '6',
      growth_stage = 'All Stages',
      spray_interval = '4 days',
      phi_text = '1 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = '5',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Radiant SC';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Radiant SC', 'Spinetoram 120 g/l', '["Tuta","Thrips","army worm","leaf miner","fruit worm"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '375-750 ml/ha', '2250-4500 ml/ha', '6', 'All Stages', '4 days', '1 day', 'when the field is dry', 'No result', '5', true, true);
  END IF;

  -- Revus
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Revus';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '250 g/l mandipropamid',
      target_pests = '["late blight","downy mildew"]',
      phi_days = 3,
      target_crops = 'tomato,cucumber,melon,lettuce,potato',
      max_individual_dose = '0.6ml/L',
      max_total_dose = '0.6L/ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '12 hours',
      bumble_bee_interval = 'No result',
      chemical_category = 'H5',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Revus';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Revus', '250 g/l mandipropamid', '["late blight","downy mildew"]', 3, 'tomato,cucumber,melon,lettuce,potato', '0.6ml/L', '0.6L/ha', 'N/A', 'All Stages', '7 days', '3 days', '12 hours', 'No result', 'H5', true, true);
  END IF;

  -- Ridomil Gold
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Ridomil Gold';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Meltalaxyl M25 g/Kg Copper 400G/Kg Ingerdients 575g/Kg',
      target_pests = '["Powdery mildew"]',
      phi_days = 3,
      target_crops = 'Apple,Peach,Citrus,Strawberry,Tomato,Potato,Grapes,Onions',
      max_individual_dose = '',
      max_total_dose = 'N/A',
      max_applications = '4',
      growth_stage = 'All Stages',
      spray_interval = '14 days',
      phi_text = '3 Day',
      re_entry_interval = '48 Hour',
      bumble_bee_interval = 'Unknown Effects',
      chemical_category = '4 ( Fungicide )',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Ridomil Gold';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Ridomil Gold', 'Meltalaxyl M25 g/Kg Copper 400G/Kg Ingerdients 575g/Kg', '["Powdery mildew"]', 3, 'Apple,Peach,Citrus,Strawberry,Tomato,Potato,Grapes,Onions', '', 'N/A', '4', 'All Stages', '14 days', '3 Day', '48 Hour', 'Unknown Effects', '4 ( Fungicide )', true, true);
  END IF;

  -- Rizolex 50 wp
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Rizolex 50 wp';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'TOLCLOFOS-METHYL 50%',
      target_pests = '["soil born diseases as   Rhizoctonia solani  root rot"]',
      phi_days = 7,
      target_crops = 'vegetables , carnation',
      max_individual_dose = '100gm/100L',
      max_total_dose = '1000gm/da',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '7 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'X',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Rizolex 50 wp';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Rizolex 50 wp', 'TOLCLOFOS-METHYL 50%', '["soil born diseases as   Rhizoctonia solani  root rot"]', 7, 'vegetables , carnation', '100gm/100L', '1000gm/da', 'N/A', 'All Stages', '7 days', '7 days', 'when the field is dry', 'No result', 'X', true, true);
  END IF;

  -- Rovral
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Rovral';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Iprodione',
      target_pests = '["Botrytis"]',
      phi_days = 2,
      target_crops = 'Tomato',
      max_individual_dose = '1g/L for tomato',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '2 days',
      re_entry_interval = '4 hours',
      bumble_bee_interval = 'cover',
      chemical_category = '2',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Rovral';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Rovral', 'Iprodione', '["Botrytis"]', 2, 'Tomato', '1g/L for tomato', 'N/A', 'N/A', 'All Stages', '7 days', '2 days', '4 hours', 'cover', '2', true, true);
  END IF;

  -- Sanmite WP
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Sanmite WP';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Pyridaben 20%',
      target_pests = '["Broad mite","two spotted spider mite and White fly"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '1 gr/lt',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '21A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Sanmite WP';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Sanmite WP', 'Pyridaben 20%', '["Broad mite","two spotted spider mite and White fly"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '1 gr/lt', 'N/A', 'N/A', 'All Stages', '7 days', '3 days', '12 hours', '1 day out', '21A', true, true);
  END IF;

  -- Score
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Score';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'difenoconazole 250 g/l',
      target_pests = '["Early blight"]',
      phi_days = 3,
      target_crops = 'Tomato',
      max_individual_dose = '300-500 ml/ha',
      max_total_dose = '600-1000 ml/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '7-14 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '3',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Score';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Score', 'difenoconazole 250 g/l', '["Early blight"]', 3, 'Tomato', '300-500 ml/ha', '600-1000 ml/ha', '2', 'All Stages', '7-14 days', '3 days', 'when the field is dry', 'cover', '3', true, true);
  END IF;

  -- Siltac
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Siltac';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'silicone polymeric compounds',
      target_pests = '["Mite","Worm","thrips","tuta"]',
      phi_days = 0,
      target_crops = 'Tomato , Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.5-1.5 ml/l',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '5-7 days',
      phi_text = '0 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'No result',
      chemical_category = 'N/A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Siltac';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Siltac', 'silicone polymeric compounds', '["Mite","Worm","thrips","tuta"]', 0, 'Tomato , Egg Plant,  Water Melon , Cucumber', '0.5-1.5 ml/l', 'N/A', 'N/A', 'All Stages', '5-7 days', '0 Day', 'when the field is dry', 'No result', 'N/A', true, true);
  END IF;

  -- Sivanto Prime
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Sivanto Prime';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Flupyradifurone',
      target_pests = '["Aphids","Whitefly"]',
      phi_days = 1,
      target_crops = 'Tomato ,Eggplant,Pepper',
      max_individual_dose = '0.5-0.1ml/ltr',
      max_total_dose = '1-2ltr',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 Day',
      re_entry_interval = 'when the filed dry',
      bumble_bee_interval = '0 Day',
      chemical_category = '4D Insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Sivanto Prime';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Sivanto Prime', 'Flupyradifurone', '["Aphids","Whitefly"]', 1, 'Tomato ,Eggplant,Pepper', '0.5-0.1ml/ltr', '1-2ltr', '3', 'All Stages', '7 days', '1 Day', 'when the filed dry', '0 Day', '4D Insectcide', true, true);
  END IF;

  -- Starkle 20%SG
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Starkle 20%SG';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'dinotefuran 20%',
      target_pests = '["Fruit fly","Aphids","Thrips","worm","Leaf hopper","Leaf Miner"]',
      phi_days = 1,
      target_crops = 'cotton',
      max_individual_dose = '0.3-0.5 g/L',
      max_total_dose = 'N/A',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'Not compatible',
      chemical_category = '4A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Starkle 20%SG';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Starkle 20%SG', 'dinotefuran 20%', '["Fruit fly","Aphids","Thrips","worm","Leaf hopper","Leaf Miner"]', 1, 'cotton', '0.3-0.5 g/L', 'N/A', '1', 'All Stages', '7 days', '1 day', 'when the field is dry', 'Not compatible', '4A', true, true);
  END IF;

  -- Steward
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Steward';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Indoxacarb',
      target_pests = '["Tuta","Fruit worm","cut worm"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.5 ml/L',
      max_total_dose = 'N/A',
      max_applications = '6',
      growth_stage = 'All Stages',
      spray_interval = '8-14 days',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '3 days out',
      chemical_category = '22A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Steward';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Steward', 'Indoxacarb', '["Tuta","Fruit worm","cut worm"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.5 ml/L', 'N/A', '6', 'All Stages', '8-14 days', '1 day', '12 hours', '3 days out', '22A', true, true);
  END IF;

  -- Switch 62.5 WG
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Switch 62.5 WG';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '375 g/kg Cyprodinil,  250 g/kg Fludioxonil',
      target_pests = '["Botrytis"]',
      phi_days = 3,
      target_crops = 'Grapes',
      max_individual_dose = '600-1000 g/L',
      max_total_dose = '1200-2000 g/ha',
      max_applications = '2',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '9 & 12',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Switch 62.5 WG';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Switch 62.5 WG', '375 g/kg Cyprodinil,  250 g/kg Fludioxonil', '["Botrytis"]', 3, 'Grapes', '600-1000 g/L', '1200-2000 g/ha', '2', 'All Stages', '7-10 days', '3 days', 'when the field is dry', 'cover', '9 & 12', true, true);
  END IF;

  -- Thiovit Jet
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Thiovit Jet';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Sulfur 80%',
      target_pests = '["Powdery mildew"]',
      phi_days = 3,
      target_crops = 'Cucurbits, tomato, strawberry, fruit trees (apple),',
      max_individual_dose = '2 gm / lit vegetable, 4 gm /lit for fruits',
      max_total_dose = '4kg/Ha',
      max_applications = 'unlimited',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days tomato & cucurbit, used befor flowering on fruit trres (apple)',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'close and remove',
      chemical_category = 'M2 Fungicide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Thiovit Jet';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Thiovit Jet', 'Sulfur 80%', '["Powdery mildew"]', 3, 'Cucurbits, tomato, strawberry, fruit trees (apple),', '2 gm / lit vegetable, 4 gm /lit for fruits', '4kg/Ha', 'unlimited', 'All Stages', '7-10 days', '3 days tomato & cucurbit, used befor flowering on fruit trres (apple)', 'when the field is dry', 'close and remove', 'M2 Fungicide', true, true);
  END IF;

  -- Topsin
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Topsin';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'thiophanate methyl 70%, inerts 30%',
      target_pests = '["Anthracnose","Septoria/target spot","pwodery mildew"]',
      phi_days = 1,
      target_crops = 'Cucurbits',
      max_individual_dose = '50-70 g/100 L',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 day',
      re_entry_interval = 'when the  field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = '1',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Topsin';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Topsin', 'thiophanate methyl 70%, inerts 30%', '["Anthracnose","Septoria/target spot","pwodery mildew"]', 1, 'Cucurbits', '50-70 g/100 L', 'N/A', 'N/A', 'All Stages', '7 days', '1 day', 'when the  field is dry', 'cover', '1', true, true);
  END IF;

  -- Tracer
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Tracer';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Spinosad 480 g/l',
      target_pests = '["Tuta","Thrips","cut worm","leaf miner","fruit worm"]',
      phi_days = 1,
      target_crops = 'Tomato',
      max_individual_dose = '150 -300ml/ha',
      max_total_dose = '900-1800 ml/ha',
      max_applications = '6',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '1 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1days out',
      chemical_category = '5',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Tracer';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Tracer', 'Spinosad 480 g/l', '["Tuta","Thrips","cut worm","leaf miner","fruit worm"]', 1, 'Tomato', '150 -300ml/ha', '900-1800 ml/ha', '6', 'All Stages', '7-10 days', '1 day', '12 hours', '1days out', '5', true, true);
  END IF;

  -- Traxi
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Traxi';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Copper Oxychloride 50 %',
      target_pests = '["Early Blight","athracnose","Bacterial Spot"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '3-4 kg/ha',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7-10 days',
      phi_text = '3 days for tomato & eggplant',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'cover',
      chemical_category = 'M1(Inorganic)',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Traxi';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Traxi', 'Copper Oxychloride 50 %', '["Early Blight","athracnose","Bacterial Spot"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '3-4 kg/ha', 'N/A', 'N/A', 'All Stages', '7-10 days', '3 days for tomato & eggplant', 'when the field is dry', 'cover', 'M1(Inorganic)', true, true);
  END IF;

  -- Trigard
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Trigard';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Cyromazine',
      target_pests = '["Leaf miner"]',
      phi_days = 0,
      target_crops = 'Tomato & Pepper',
      max_individual_dose = '0.15-0.3 g/L',
      max_total_dose = '900-1800 g/ha',
      max_applications = '6',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '0 day',
      re_entry_interval = '12 hours',
      bumble_bee_interval = '1 day out',
      chemical_category = '17',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Trigard';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Trigard', 'Cyromazine', '["Leaf miner"]', 0, 'Tomato & Pepper', '0.15-0.3 g/L', '900-1800 g/ha', '6', 'All Stages', '7 days', '0 day', '12 hours', '1 day out', '17', true, true);
  END IF;

  -- Uniform
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Uniform';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Azoxystrobin 28.2%,Metalaxyl 10.9%',
      target_pests = '["Pythium","root rot"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.5-0.75/ha',
      max_total_dose = 'N/A',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = 'N/A',
      phi_text = '3 days',
      re_entry_interval = 'immediatey after appl.',
      bumble_bee_interval = 'cover',
      chemical_category = '4 &11',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Uniform';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Uniform', 'Azoxystrobin 28.2%,Metalaxyl 10.9%', '["Pythium","root rot"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.5-0.75/ha', 'N/A', 'N/A', 'All Stages', 'N/A', '3 days', 'immediatey after appl.', 'cover', '4 &11', true, true);
  END IF;

  -- Velum Prime
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Velum Prime';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Fluopyram 400 gr/l',
      target_pests = '["Nematodes"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Cucumber',
      max_individual_dose = '0.625 l/ha',
      max_total_dose = '1.25 l/ha',
      max_applications = '2',
      growth_stage = 'All Atage',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = 'immediatey after appl.',
      bumble_bee_interval = 'No result',
      chemical_category = 'N/A',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Velum Prime';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Velum Prime', 'Fluopyram 400 gr/l', '["Nematodes"]', 3, 'Tomato , Pepper, Egg Plant,  Cucumber', '0.625 l/ha', '1.25 l/ha', '2', 'All Atage', '7 days', '3 days', 'immediatey after appl.', 'No result', 'N/A', true, true);
  END IF;

  -- Vertimec
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Vertimec';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '18 g/L ABAMECTIN',
      target_pests = '["Mite","thrips","leaf miner"]',
      phi_days = 3,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '0.6-0.9 ml/lt',
      max_total_dose = 'N/A',
      max_applications = '2 or 5',
      growth_stage = 'All Stages',
      spray_interval = '28 days',
      phi_text = '3 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '6',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Vertimec';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Vertimec', '18 g/L ABAMECTIN', '["Mite","thrips","leaf miner"]', 3, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '0.6-0.9 ml/lt', 'N/A', '2 or 5', 'All Stages', '28 days', '3 days', 'when the field is dry', '2 days out', '6', true, true);
  END IF;

  -- Voliam Flex
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Voliam Flex';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'thiamethoxam 200g/l + chlorantraniliprole 100g/l',
      target_pests = '["Aphids","thrips","white fly","fruit worm","leaf miner"]',
      phi_days = 1,
      target_crops = 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber',
      max_individual_dose = '250-00 g/ha.',
      max_total_dose = '2.5 kg/ha/season',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '5 days',
      phi_text = '1 day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = 'Not compatible',
      chemical_category = '4A & 28',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Voliam Flex';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Voliam Flex', 'thiamethoxam 200g/l + chlorantraniliprole 100g/l', '["Aphids","thrips","white fly","fruit worm","leaf miner"]', 1, 'Tomato , Pepper, Egg Plant,  Water Melon , Cucumber', '250-00 g/ha.', '2.5 kg/ha/season', 'N/A', 'All Stages', '5 days', '1 day', 'when the field is dry', 'Not compatible', '4A & 28', true, true);
  END IF;

  -- Voliam Targo
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Voliam Targo';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '4.5%Chloranttraniliprole ( W/V)1.8% Abamectin ( W/V) 93.7 % Inerts',
      target_pests = '["Trips","mites","leaf miners","Coding moth larva","Leafrollers","broad spectrom insecticide"]',
      phi_days = 7,
      target_crops = 'Vegetebles, melon, Apple, Pears',
      max_individual_dose = '37.5 ml / 100 lit',
      max_total_dose = '750 ml / Ha',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = 'One time /season',
      phi_text = '7 days',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '2 days out',
      chemical_category = '6-28 insecticide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Voliam Targo';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Voliam Targo', '4.5%Chloranttraniliprole ( W/V)1.8% Abamectin ( W/V) 93.7 % Inerts', '["Trips","mites","leaf miners","Coding moth larva","Leafrollers","broad spectrom insecticide"]', 7, 'Vegetebles, melon, Apple, Pears', '37.5 ml / 100 lit', '750 ml / Ha', '1', 'All Stages', 'One time /season', '7 days', 'when the field is dry', '2 days out', '6-28 insecticide', true, true);
  END IF;

  -- Eco -Oil
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Eco -Oil';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = '850g/l Emulsifiable Botanical Oils inert upto 100%/100%(W/V)',
      target_pests = '["Whitefli","Aphids","Spider Mite"]',
      phi_days = 0,
      target_crops = 'Tomato,Pepper,Eggplant',
      max_individual_dose = '5ML/1 Lt',
      max_total_dose = '10ltr/Ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '',
      phi_text = '0 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Eco -Oil';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Eco -Oil', '850g/l Emulsifiable Botanical Oils inert upto 100%/100%(W/V)', '["Whitefli","Aphids","Spider Mite"]', 0, 'Tomato,Pepper,Eggplant', '5ML/1 Lt', '10ltr/Ha', 'N/A', 'All Stages', '', '0 Day', 'when the field is dry', '', '', true, true);
  END IF;

  -- Nachino Hachi-Hachi
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Nachino Hachi-Hachi';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Tolfenpyrad % 15',
      target_pests = '["Thrips","Whitefly","Worm","Tuta","Aphids"]',
      phi_days = 1,
      target_crops = 'Tomato,Pepper,Eggplant,Sweet Corn',
      max_individual_dose = '1-2 ML/1 Lt',
      max_total_dose = '4ltr/Ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1 Day',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '3 days out',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Nachino Hachi-Hachi';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Nachino Hachi-Hachi', 'Tolfenpyrad % 15', '["Thrips","Whitefly","Worm","Tuta","Aphids"]', 1, 'Tomato,Pepper,Eggplant,Sweet Corn', '1-2 ML/1 Lt', '4ltr/Ha', 'N/A', 'All Stages', '7 days', '1 Day', 'when the field is dry', '3 days out', '', true, true);
  END IF;

  -- Finesave
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Finesave';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Flometoquin 10%',
      target_pests = '["Thrips","mite"]',
      phi_days = 1,
      target_crops = 'Tomato,Pepper,Eggplant',
      max_individual_dose = '0.5ML/1 Lt',
      max_total_dose = '1ltr/ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '',
      phi_text = '1 Day',
      re_entry_interval = '',
      bumble_bee_interval = '',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Finesave';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Finesave', 'Flometoquin 10%', '["Thrips","mite"]', 1, 'Tomato,Pepper,Eggplant', '0.5ML/1 Lt', '1ltr/ha', 'N/A', 'All Stages', '', '1 Day', '', '', '', true, true);
  END IF;

  -- Demetrine 25%
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Demetrine 25%';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Deltamethrin',
      target_pests = '["Cuterpiller","whitefly","Thrips","Scale"]',
      phi_days = 3,
      target_crops = 'Tomato,Pepper,Eggplant,cucuber,melon,corn,Squash',
      max_individual_dose = '0.5ml/L',
      max_total_dose = '1L/Ha',
      max_applications = 'N/A',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days ( Corn 14 )',
      re_entry_interval = '',
      bumble_bee_interval = '3 days out',
      chemical_category = 'insectcide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Demetrine 25%';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Demetrine 25%', 'Deltamethrin', '["Cuterpiller","whitefly","Thrips","Scale"]', 3, 'Tomato,Pepper,Eggplant,cucuber,melon,corn,Squash', '0.5ml/L', '1L/Ha', 'N/A', 'All Stages', '7 days', '3 days ( Corn 14 )', '', '3 days out', 'insectcide', true, true);
  END IF;

  -- Vapcomore 20%
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Vapcomore 20%';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Acetamiprid',
      target_pests = '["Aphids","Thrips","Whitefly","Mealybug","Cutwork"]',
      phi_days = 3,
      target_crops = 'Tomato,Pepper,Eggplant,cucuber,melon,corn,Squash',
      max_individual_dose = '1 Ml/L',
      max_total_dose = '2 L/Ha',
      max_applications = '0.2',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '',
      bumble_bee_interval = '24 hour',
      chemical_category = '',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Vapcomore 20%';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Vapcomore 20%', 'Acetamiprid', '["Aphids","Thrips","Whitefly","Mealybug","Cutwork"]', 3, 'Tomato,Pepper,Eggplant,cucuber,melon,corn,Squash', '1 Ml/L', '2 L/Ha', '0.2', 'All Stages', '7 days', '3 days', '', '24 hour', '', true, true);
  END IF;

  -- Miravis
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Miravis';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Pydiflumetofen 75 G/L,Difenoconazole 125 G/l',
      target_pests = '["Powdery mildew","Early Bligfht","Leaf spot","Leaf Mold","Alternamrira"]',
      phi_days = 3,
      target_crops = 'Tomato,Pepper,Eggplant,cucuber,corn,Melon,S',
      max_individual_dose = '0.6ml- 100L',
      max_total_dose = '0.8-1.2L/Ha',
      max_applications = '1',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days, Letteus 7 days, Cabbage 14 days',
      re_entry_interval = '',
      bumble_bee_interval = '',
      chemical_category = 'fungicide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Miravis';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Miravis', 'Pydiflumetofen 75 G/L,Difenoconazole 125 G/l', '["Powdery mildew","Early Bligfht","Leaf spot","Leaf Mold","Alternamrira"]', 3, 'Tomato,Pepper,Eggplant,cucuber,corn,Melon,S', '0.6ml- 100L', '0.8-1.2L/Ha', '1', 'All Stages', '7 days', '3 days, Letteus 7 days, Cabbage 14 days', '', '', 'fungicide', true, true);
  END IF;

  -- Luna Sensation
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Luna Sensation';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Fluopyram 250g/l(w/v) Trifloxystrobin 250 g/l (w/v)',
      target_pests = '["Powdery mildew","Early Bligfht","botrytist","Leaf spot"]',
      phi_days = 3,
      target_crops = 'Tomato,Pepper,Eggplant,cucuber,corn',
      max_individual_dose = '0.5ml- 1.5mL',
      max_total_dose = '500ml-1200ml/Ha',
      max_applications = '2-3 days',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '3 days',
      re_entry_interval = '',
      bumble_bee_interval = '',
      chemical_category = '7.3 fungicide',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Luna Sensation';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Luna Sensation', 'Fluopyram 250g/l(w/v) Trifloxystrobin 250 g/l (w/v)', '["Powdery mildew","Early Bligfht","botrytist","Leaf spot"]', 3, 'Tomato,Pepper,Eggplant,cucuber,corn', '0.5ml- 1.5mL', '500ml-1200ml/Ha', '2-3 days', 'All Stages', '7 days', '3 days', '', '', '7.3 fungicide', true, true);
  END IF;

  -- Spectrum
  SELECT COUNT(*) INTO v_count FROM pesticide_products WHERE name = 'Spectrum';
  IF v_count > 0 THEN
    UPDATE pesticide_products SET
      active_ingredient = 'Azoxystrobin 250g/L',
      target_pests = '["Early blight","Late Blight","Leaf spot","Powdery mildew"]',
      phi_days = 1,
      target_crops = 'Tomato,cucubits,potato',
      max_individual_dose = '0.6-1.2ml/ltr',
      max_total_dose = '600ml-1200ml/Ha',
      max_applications = '3',
      growth_stage = 'All Stages',
      spray_interval = '7 days',
      phi_text = '1',
      re_entry_interval = 'when the field is dry',
      bumble_bee_interval = '0',
      chemical_category = '11',
      has_label_msds = true,
      updated_at = NOW()
    WHERE name = 'Spectrum';
  ELSE
    INSERT INTO pesticide_products (name, active_ingredient, target_pests, phi_days, target_crops, max_individual_dose, max_total_dose, max_applications, growth_stage, spray_interval, phi_text, re_entry_interval, bumble_bee_interval, chemical_category, has_label_msds, is_active)
    VALUES ('Spectrum', 'Azoxystrobin 250g/L', '["Early blight","Late Blight","Leaf spot","Powdery mildew"]', 1, 'Tomato,cucubits,potato', '0.6-1.2ml/ltr', '600ml-1200ml/Ha', '3', 'All Stages', '7 days', '1', 'when the field is dry', '0', '11', true, true);
  END IF;

  RAISE NOTICE 'PPP Product seed complete: 88 products processed';
END;
$$;
