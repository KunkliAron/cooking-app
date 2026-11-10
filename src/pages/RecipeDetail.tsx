import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatMinutes, formatQuantity } from "../../shared/format";
import { api, errorMessage, type Recipe } from "../api";

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ recipe: Recipe }>(`/recipes/${id}`)
      .then((r) => {
        setRecipe(r.recipe);
        setServings(r.recipe.servings ?? null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error && !recipe) return <p className="error">{error}</p>;
  if (!recipe) return null;

  const scale = servings && recipe.servings ? servings / recipe.servings : 1;

  async function addToGrocery() {
    setBusy(true);
    setError("");
    try {
      const { added } = await api<{ added: number }>(`/recipes/${id}/grocery`, { method: "POST", json: { servings } });
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

  return (
    <article className="recipe">
      <Link className="back" to="/">
        ‹ All recipes
      </Link>
      <h2>{recipe.title}</h2>
      {recipe.description && <p className="lead">{recipe.description}</p>}

      <div className="meta">
        {recipe.prep_minutes ? <span>Prep {formatMinutes(recipe.prep_minutes)}</span> : null}
        {recipe.cook_minutes ? <span>Cook {formatMinutes(recipe.cook_minutes)}</span> : null}
        {recipe.tags.map((t) => (
          <Link key={t} className="tag" to={`/?tag=${encodeURIComponent(t)}`}>
            {t}
          </Link>
        ))}
      </div>

      <div className="actions">
        <Link
          className={recipe.steps.length ? "button primary" : "button primary disabled"}
          to={`/recipes/${id}/cook${servings ? `?servings=${servings}` : ""}`}
          aria-disabled={!recipe.steps.length}
        >
          Start cooking
        </Link>
        <button className="button" onClick={addToGrocery} disabled={busy || !recipe.ingredients.length}>
          Add to grocery list
        </button>
      </div>
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
        <ul className="ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>
              <div>
                {ing.quantity != null && <strong>{formatQuantity(ing.quantity * scale)} </strong>}
                {ing.unit && <strong>{ing.unit} </strong>}
                {ing.name}
                {ing.note && <span className="muted">, {ing.note}</span>}
              </div>
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

      <section>
        <h3>Steps</h3>
        <ol className="steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step.text}</li>
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
    </article>
  );
}
