-- Recipes. `ingredients` and `steps` are JSON arrays:
--   ingredients: [{ name, quantity, unit, aisle, note, substitutes: [{ name, note }] }]
--   steps:       [{ text, timer_seconds, ingredients: [name, ...] }]
CREATE TABLE recipes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  source_url    TEXT,
  servings      INTEGER,
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  ingredients   TEXT NOT NULL DEFAULT '[]',
  steps         TEXT NOT NULL DEFAULT '[]',
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
CREATE INDEX recipe_tags_tag ON recipe_tags(tag);

CREATE TABLE grocery_items (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  quantity   REAL,
  unit       TEXT,
  aisle      TEXT,
  checked    INTEGER NOT NULL DEFAULT 0,
  recipe_id  TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

-- Failed logins, used to throttle password guessing.
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_attempts_ip_at ON login_attempts(ip, at);
