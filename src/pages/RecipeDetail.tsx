import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatMinutes, formatQuantity } from "../../shared/format";
import { api, errorMessage, type Recipe } from "../api";
import { coverFor } from "../ui/cover";
import { BackIcon, BasketIcon, ClockIcon, PlayIcon } from "../ui/icons";

/** Grams of each macro and the calories a gram gives, for the split bar. */
const MACROS = [
  { key: "protein_g", label: "Protein", className: "protein", kcalPerGram: 4 },
  { key: "carbs_g", label: "Carbs", className: "carbs", kcalPerGram: 4 },
  { key: "fat_g", label: "Fat", className: "fat", kcalPerGram: 9 },
] as const;

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const readyKey = `ready:${id}`;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // While choosing what to buy: one flag per ingredient, in recipe order. Null when the chooser is closed.
  const [picking, setPicking] = useState<boolean[] | null>(null);
  // Ingredients ticked off as "got it out" while preparing. Kept for this visit only.
  const [ready, setReady] = useState<number[]>(() => JSON.parse(sessionStorage.getItem(readyKey) ?? "[]"));

  useEffect(() => {
    api<{ recipe: Recipe }>(`/recipes/${id}`)
      .then((r) => {
        setRecipe(r.recipe);
        setServings(r.recipe.servings ?? null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  useEffect(() => sessionStorage.setItem(readyKey, JSON.stringify(ready)), [readyKey, ready]);

  if (error && !recipe) return <p className="error">{error}</p>;
  if (!recipe) return null;

  const scale = servings && recipe.servings ? servings / recipe.servings : 1;
  const cover = coverFor(recipe.title, recipe.tags);
  const total = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  const nutrition = recipe.nutrition;
  const macros = MACROS.filter((m) => nutrition?.[m.key] != null);
  const macroKcal = macros.reduce((sum, m) => sum + nutrition![m.key]! * m.kcalPerGram, 0);
  const picked = picking ? picking.filter(Boolean).length : 0;

  async function addToGrocery() {
    if (!picking) return;
    setBusy(true);
    setError("");
    try {
      const ingredients = picking.flatMap((on, i) => (on ? [i] : []));
      const { added } = await api<{ added: number }>(`/recipes/${id}/grocery`, { method: "POST", json: { servings, ingredients } });
      setPicking(null);
      setNotice(`Added ${added} ${added === 1 ? "item" : "items"} to the grocery list.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${recipe!.title}"? This cannot be undone.`)) return;
    try {
      await api(`/recipes/${id}`, { method: "DELETE" });
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const amount = (ing: Recipe["ingredients"][number]) =>
    `${ing.quantity != null ? `${formatQuantity(ing.quantity * scale)} ` : ""}${ing.unit ? `${ing.unit} ` : ""}`;

  return (
    <article className="recipe">
      <div className="cover big" style={{ "--hue": cover.hue } as CSSProperties}>
        <Link className="back" to="/">
          <BackIcon size={18} /> Recipes
        </Link>
        <span aria-hidden="true">{cover.symbol}</span>
      </div>

      <div className="titleblock">
        <h2>{recipe.title}</h2>
        {recipe.description && <p className="lead">{recipe.description}</p>}
        {recipe.tags.length > 0 && (
          <div className="meta">
            {recipe.tags.map((t) => (
              <Link key={t} className="tag" to={`/?tag=${encodeURIComponent(t)}`}>
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>

      {(total > 0 || recipe.servings || nutrition?.calories != null) && (
        <div className="stats">
          {recipe.prep_minutes ? (
            <div>
              <strong>{formatMinutes(recipe.prep_minutes)}</strong>
              <span>Prep</span>
            </div>
          ) : null}
          {recipe.cook_minutes ? (
            <div>
              <strong>{formatMinutes(recipe.cook_minutes)}</strong>
              <span>Cook</span>
            </div>
          ) : null}
          {recipe.servings ? (
            <div>
              <strong>{recipe.servings}</strong>
              <span>Servings</span>
            </div>
          ) : null}
          {nutrition?.calories != null && (
            <div>
              <strong>{Math.round(nutrition.calories)}</strong>
              <span>kcal each</span>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice} <Link to="/grocery">View list</Link>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section>
        <div className="sectionhead">
          <h3>Ingredients</h3>
          {recipe.servings && servings ? (
            <div className="stepper" aria-label="Servings">
              <button onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Fewer servings">
                −
              </button>
              <span>
                {servings} {servings === 1 ? "serving" : "servings"}
              </span>
              <button onClick={() => setServings(servings + 1)} aria-label="More servings">
                +
              </button>
            </div>
          ) : null}
        </div>
        <p className="muted">Tick things off as you get them out.</p>
        <ul className="ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className={ready.includes(i) ? "ready" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={ready.includes(i)}
                  onChange={() => setReady(ready.includes(i) ? ready.filter((n) => n !== i) : [...ready, i])}
                />
                <span>
                  <strong>{amount(ing)}</strong>
                  {ing.name}
                  {ing.note && <span className="muted">, {ing.note}</span>}
                </span>
              </label>
              {ing.substitutes && ing.substitutes.length > 0 && (
                <details>
                  <summary>Can't find it? {ing.substitutes.length === 1 ? "1 substitute" : `${ing.substitutes.length} substitutes`}</summary>
                  <ul>
                    {ing.substitutes.map((s, j) => (
                      <li key={j}>
                        <strong>{s.name}</strong>
                        {s.note && <span className="muted"> — {s.note}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(macros.length > 0 || nutrition?.calories != null) && (
        <section>
          <h3>Nutrition per serving</h3>
          <div className="nutrition">
            {nutrition?.calories != null && (
              <p className="kcal">
                <strong>{Math.round(nutrition.calories)}</strong>
                <span className="muted">kcal</span>
              </p>
            )}
            {macroKcal > 0 && (
              <div className="macrobar" aria-hidden="true">
                {macros.map((m) => (
                  <span key={m.key} className={m.className} style={{ width: `${((nutrition![m.key]! * m.kcalPerGram) / macroKcal) * 100}%` }} />
                ))}
              </div>
            )}
            {macros.length > 0 && (
              <dl className="macros">
                {macros.map((m) => (
                  <div key={m.key}>
                    <dt>
                      <i className={m.className} />
                      {m.label}
                    </dt>
                    <dd>
                      {Math.round(nutrition![m.key]!)} g{" "}
                      {macroKcal > 0 && <small>{Math.round(((nutrition![m.key]! * m.kcalPerGram) / macroKcal) * 100)}%</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>
      )}

      <section>
        <h3>Steps</h3>
        <ol className="steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>
              <div>
                {step.text}
                {step.timer_seconds ? (
                  <div className="pill">
                    <ClockIcon size={14} /> {formatMinutes(Math.max(1, Math.round(step.timer_seconds / 60)))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {recipe.notes && (
        <section>
          <h3>Notes</h3>
          <p className="prewrap">{recipe.notes}</p>
        </section>
      )}

      {recipe.source_url && (
        <p>
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
            Original recipe
          </a>
        </p>
      )}

      <div className="actions quiet">
        <Link className="button" to={`/recipes/${id}/edit`}>
          Edit
        </Link>
        <button className="button danger" onClick={remove}>
          Delete
        </button>
      </div>

      <div className="actionbar">
        <Link
          className={recipe.steps.length ? "button primary" : "button primary disabled"}
          to={`/recipes/${id}/cook${servings ? `?servings=${servings}` : ""}`}
          aria-disabled={!recipe.steps.length}
        >
          <PlayIcon size={18} /> Start cooking
        </Link>
        <button
          className="button"
          onClick={() => {
            setNotice("");
            // Things already ticked as "got it out" start unticked: they don't need buying.
            setPicking(recipe.ingredients.map((_, i) => !ready.includes(i)));
          }}
          disabled={!recipe.ingredients.length}
        >
          <BasketIcon size={18} /> Add to list
        </button>
      </div>

      {picking && (
        <div className="backdrop" onClick={(e) => e.target === e.currentTarget && !busy && setPicking(null)}>
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Choose what to buy">
            <h3>What do you need to buy?</h3>
            <p className="muted">Untick anything you already have.</p>
            <ul className="grocerylist">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className={picking[i] ? "groceryitem" : "groceryitem checked"}>
                  <label>
                    <input type="checkbox" checked={picking[i]} onChange={() => setPicking(picking.map((on, j) => (j === i ? !on : on)))} />
                    <span>
                      {amount(ing)}
                      {ing.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="actions">
              <button className="button" onClick={() => setPicking(null)} disabled={busy}>
                Cancel
              </button>
              <button className="button primary" onClick={addToGrocery} disabled={busy || picked === 0}>
                {picked === 0 ? "Nothing ticked" : `Add ${picked} ${picked === 1 ? "item" : "items"}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
