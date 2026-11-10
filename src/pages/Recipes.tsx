import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatMinutes } from "../../shared/format";
import { api, errorMessage, type RecipeSummary, type TagCount } from "../api";

export default function Recipes() {
  // Search text and tag filters live in the URL so they survive opening a recipe and going back.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const activeTags = params.getAll("tag");
  const query = params.toString();

  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ tags: TagCount[] }>("/tags")
      .then((r) => setTags(r.tags))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      api<{ recipes: RecipeSummary[] }>(`/recipes${query ? `?${query}` : ""}`)
        .then((r) => {
          if (stale) return;
          setRecipes(r.recipes);
          setError("");
        })
        .catch((err) => !stale && setError(errorMessage(err)));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  function update(nextQ: string, nextTags: string[]) {
    const next = new URLSearchParams();
    if (nextQ) next.set("q", nextQ);
    nextTags.forEach((t) => next.append("tag", t));
    setParams(next, { replace: true });
  }

  const toggleTag = (tag: string) =>
    update(q, activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag]);

  const filtering = q !== "" || activeTags.length > 0;

  return (
    <>
      <div className="searchrow">
        <input
          type="search"
          placeholder="Search recipes, ingredients, tags"
          aria-label="Search recipes"
          value={q}
          onChange={(e) => update(e.target.value, activeTags)}
        />
        <Link className="button" to="/new" aria-label="Add a recipe by hand">
          Add
        </Link>
      </div>

      {tags.length > 0 && (
        <div className="chips" role="group" aria-label="Filter by tag">
          {tags.map((t) => (
            <button
              key={t.tag}
              className={activeTags.includes(t.tag) ? "chip on" : "chip"}
              aria-pressed={activeTags.includes(t.tag)}
              onClick={() => toggleTag(t.tag)}
            >
              {t.tag}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {recipes && recipes.length === 0 && (
        <div className="empty">
          <h2>{filtering ? "No matching recipes" : "No recipes yet"}</h2>
          <p>
            {filtering
              ? "Try fewer words or remove a tag."
              : "Ask Claude to find a recipe and save it, and it will show up here."}
          </p>
        </div>
      )}

      <ul className="cards">
        {recipes?.map((r) => {
          const minutes = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);
          return (
            <li key={r.id}>
              <Link className="card" to={`/recipes/${r.id}`}>
                <h2>{r.title}</h2>
                {r.description && <p>{r.description}</p>}
                <div className="meta">
                  {minutes > 0 && <span>{formatMinutes(minutes)}</span>}
                  {r.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
