import type {
  GroceryItem,
  GroceryItemInput,
  Nutrition,
  Recipe,
  RecipeInput,
  RecipePatch,
  RecipeSummary,
  TagCount,
} from "../shared/schema";

interface RecipeRow {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: string;
  steps: string;
  nutrition: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  tags: string | null;
}

const TAGS_SUBQUERY = "(SELECT json_group_array(tag) FROM recipe_tags t WHERE t.recipe_id = r.id) AS tags";

function normaliseTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
}

function parseTags(json: string | null): string[] {
  return json ? (JSON.parse(json) as string[]).sort() : [];
}

/** Stored as JSON; null when no value is known, so an empty object never reaches the page. */
function nutritionJson(n: Nutrition | null | undefined): string | null {
  if (!n) return null;
  const known = Object.fromEntries(Object.entries(n).filter(([, v]) => v != null));
  return Object.keys(known).length ? JSON.stringify(known) : null;
}

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source_url: row.source_url,
    servings: row.servings,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    ingredients: JSON.parse(row.ingredients),
    steps: JSON.parse(row.steps),
    nutrition: row.nutrition ? JSON.parse(row.nutrition) : null,
    notes: row.notes,
    tags: parseTags(row.tags),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Every word of `q` must match the title, description, an ingredient or a tag. Every tag in `tags` must be present. */
export async function listRecipes(
  db: D1Database,
  opts: { q?: string; tags?: string[] } = {},
): Promise<RecipeSummary[]> {
  const where: string[] = [];
  const params: string[] = [];

  for (const term of (opts.q ?? "").split(/\s+/).filter(Boolean).slice(0, 8)) {
    const p = likePattern(term);
    where.push(
      `(r.title LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\' OR r.ingredients LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM recipe_tags t WHERE t.recipe_id = r.id AND t.tag LIKE ? ESCAPE '\\'))`,
    );
    params.push(p, p, p, p);
  }
  for (const tag of normaliseTags(opts.tags ?? [])) {
    where.push("EXISTS (SELECT 1 FROM recipe_tags t WHERE t.recipe_id = r.id AND t.tag = ?)");
    params.push(tag);
  }

  const { results } = await db
    .prepare(
      `SELECT r.id, r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes, r.nutrition, ${TAGS_SUBQUERY}
       FROM recipes r ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.created_at DESC`,
    )
    .bind(...params)
    .all<Omit<RecipeSummary, "tags" | "nutrition"> & { tags: string | null; nutrition: string | null }>();

  return results.map((r) => ({ ...r, nutrition: r.nutrition ? JSON.parse(r.nutrition) : null, tags: parseTags(r.tags) }));
}

export async function listTags(db: D1Database): Promise<TagCount[]> {
  const { results } = await db
    .prepare("SELECT tag, COUNT(*) AS count FROM recipe_tags GROUP BY tag ORDER BY count DESC, tag")
    .all<TagCount>();
  return results;
}

export async function getRecipe(db: D1Database, id: string): Promise<Recipe | null> {
  const row = await db
    .prepare(`SELECT r.*, ${TAGS_SUBQUERY} FROM recipes r WHERE r.id = ?`)
    .bind(id)
    .first<RecipeRow>();
  return row ? toRecipe(row) : null;
}

function tagInserts(db: D1Database, id: string, tags: string[]) {
  return normaliseTags(tags).map((tag) =>
    db.prepare("INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)").bind(id, tag),
  );
}

export async function createRecipe(db: D1Database, input: RecipeInput): Promise<Recipe> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO recipes (id, title, description, source_url, servings, prep_minutes, cook_minutes,
                              ingredients, steps, nutrition, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.title,
        input.description || null,
        input.source_url || null,
        input.servings ?? null,
        input.prep_minutes ?? null,
        input.cook_minutes ?? null,
        JSON.stringify(input.ingredients),
        JSON.stringify(input.steps),
        nutritionJson(input.nutrition),
        input.notes || null,
        now,
        now,
      ),
    ...tagInserts(db, id, input.tags),
  ]);
  return (await getRecipe(db, id))!;
}

/** Only the fields present in `patch` change. Returns null when the recipe does not exist. */
export async function updateRecipe(db: D1Database, id: string, patch: RecipePatch): Promise<Recipe | null> {
  const current = await getRecipe(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };

  const statements = [
    db
      .prepare(
        `UPDATE recipes SET title = ?, description = ?, source_url = ?, servings = ?, prep_minutes = ?,
                            cook_minutes = ?, ingredients = ?, steps = ?, nutrition = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        next.title,
        next.description || null,
        next.source_url || null,
        next.servings ?? null,
        next.prep_minutes ?? null,
        next.cook_minutes ?? null,
        JSON.stringify(next.ingredients),
        JSON.stringify(next.steps),
        nutritionJson(next.nutrition),
        next.notes || null,
        Date.now(),
        id,
      ),
  ];
  if (patch.tags) {
    statements.push(db.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(id), ...tagInserts(db, id, patch.tags));
  }
  await db.batch(statements);
  return getRecipe(db, id);
}

export async function deleteRecipe(db: D1Database, id: string): Promise<boolean> {
  // D1 enforces foreign keys, so the tags go with the recipe and grocery items keep their rows.
  const result = await db.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
  return result.meta.changes > 0;
}

export async function listGrocery(db: D1Database): Promise<GroceryItem[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name, g.quantity, g.unit, g.aisle, g.checked, g.recipe_id, r.title AS recipe_title
       FROM grocery_items g LEFT JOIN recipes r ON r.id = g.recipe_id
       ORDER BY g.checked, g.created_at, g.rowid`,
    )
    .all<Omit<GroceryItem, "checked"> & { checked: number }>();
  return results.map((g) => ({ ...g, checked: g.checked === 1 }));
}

/**
 * Adds items, folding each into an existing unticked item with the same name and
 * unit: quantities are summed, and an exact repeat without a quantity is skipped.
 */
export async function addGroceryItems(
  db: D1Database,
  items: GroceryItemInput[],
  recipeId: string | null = null,
): Promise<number> {
  let added = 0;
  for (const item of items) {
    const unit = item.unit || null;
    const quantity = item.quantity ?? null;
    const existing = await db
      .prepare(
        `SELECT id, quantity FROM grocery_items
         WHERE checked = 0 AND lower(name) = lower(?) AND coalesce(lower(unit), '') = coalesce(lower(?), '')
         LIMIT 1`,
      )
      .bind(item.name, unit)
      .first<{ id: string; quantity: number | null }>();

    if (existing && existing.quantity != null && quantity != null) {
      await db
        .prepare("UPDATE grocery_items SET quantity = ? WHERE id = ?")
        .bind(existing.quantity + quantity, existing.id)
        .run();
    } else if (existing && existing.quantity == null && quantity == null) {
      continue;
    } else {
      await db
        .prepare(
          `INSERT INTO grocery_items (id, name, quantity, unit, aisle, checked, recipe_id, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(crypto.randomUUID(), item.name, quantity, unit, item.aisle || null, recipeId, Date.now())
        .run();
    }
    added++;
  }
  return added;
}

/**
 * Adds a recipe's ingredients, scaled to `servings` when both it and the recipe's own servings are known.
 * `only` limits it to those positions in the ingredient list; `exclude` leaves out ingredients by name.
 */
export async function addRecipeToGrocery(
  db: D1Database,
  recipeId: string,
  servings?: number | null,
  pick: { only?: number[] | null; exclude?: string[] | null } = {},
): Promise<number | null> {
  const recipe = await getRecipe(db, recipeId);
  if (!recipe) return null;
  const scale = servings && recipe.servings ? servings / recipe.servings : 1;
  const excluded = new Set((pick.exclude ?? []).map((n) => n.trim().toLowerCase()));
  const wanted = recipe.ingredients.filter(
    (i, index) => (!pick.only || pick.only.includes(index)) && !excluded.has(i.name.trim().toLowerCase()),
  );
  return addGroceryItems(
    db,
    wanted.map((i) => ({
      name: i.name,
      quantity: i.quantity != null ? i.quantity * scale : null,
      unit: i.unit,
      aisle: i.aisle,
    })),
    recipeId,
  );
}

export async function setGroceryChecked(db: D1Database, id: string, checked: boolean): Promise<boolean> {
  const result = await db
    .prepare("UPDATE grocery_items SET checked = ? WHERE id = ?")
    .bind(checked ? 1 : 0, id)
    .run();
  return result.meta.changes > 0;
}

export async function deleteGroceryItem(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM grocery_items WHERE id = ?").bind(id).run();
  return result.meta.changes > 0;
}

export async function clearGrocery(db: D1Database, scope: "checked" | "all"): Promise<void> {
  await db.prepare(scope === "all" ? "DELETE FROM grocery_items" : "DELETE FROM grocery_items WHERE checked = 1").run();
}
