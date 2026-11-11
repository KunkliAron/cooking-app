-- Per-serving nutrition as JSON: { calories, protein_g, carbs_g, fat_g }. NULL when unknown.
ALTER TABLE recipes ADD COLUMN nutrition TEXT;
