import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatMinutes } from "../../shared/format";
import { api, errorMessage, type RecipeSummary, type TagCount } from "../api";
import { coverFor } from "../ui/cover";
import { ClockIcon, FlameIcon, SearchIcon, ShuffleIcon } from "../ui/icons";

const totalMinutes = (r: RecipeSummary) => (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);

/** One-tap filters worked out from what each recipe already stores. */
const QUICK_FILTERS: { id: string; label: string; test: (r: RecipeSummary) => boolean }[] = [
  { id: "quick", label: "⚡ Under 30 min", test: (r) => totalMinutes(r) > 0 && totalMinutes(r) <= 30 },
  { id: "protein", label: "💪 High protein", test: (r) => (r.nutrition?.protein_g ?? 0) >= 30 },
  { id: "light", label: "🪶 Under 500 kcal", test: (r) => r.nutrition?.calories != null && r.nutrition.calories <= 500 },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Late-night cooking";
  if (hour < 11) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Recipes() {
  // Search text and filters live in the URL so they survive opening a recipe and going back.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const activeTags = params.getAll("tag");
  const activeQuick = params.getAll("f");
  // Only the search text and tags go to the server; the quick filters are applied here.
  const serverQuery = new URLSearchParams([...(q ? [["q", q]] : []), ...activeTags.map((t) => ["tag", t])]).toString();

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
      api<{ recipes: RecipeSummary[] }>(`/recipes${serverQuery ? `?${serverQuery}` : ""}`)
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
  }, [serverQuery]);

  function update(nextQ: string, nextTags: string[], nextQuick: string[]) {
    const next = new URLSearchParams();
    if (nextQ) next.set("q", nextQ);
    nextTags.forEach((t) => next.append("tag", t));
    nextQuick.forEach((f) => next.append("f", f));
    setParams(next, { replace: true });
  }

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const shown = recipes?.filter((r) => QUICK_FILTERS.every((f) => !activeQuick.includes(f.id) || f.test(r)));
  const filtering = q !== "" || activeTags.length > 0 || activeQuick.length > 0;
  const hasAny = recipes !== null && (recipes.length > 0 || filtering);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{greeting()}</p>
        <h2>What are we cooking?</h2>
      </section>

      <div className="search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Search recipes, ingredients, tags"
          aria-label="Search recipes"
          value={q}
          onChange={(e) => update(e.target.value, activeTags, activeQuick)}
        />
      </div>

      {hasAny && (
        <div className="chips" role="group" aria-label="Filters">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              className={activeQuick.includes(f.id) ? "chip quick on" : "chip quick"}
              aria-pressed={activeQuick.includes(f.id)}
              onClick={() => update(q, activeTags, toggle(activeQuick, f.id))}
            >
              {f.label}
            </button>
          ))}
          {tags.map((t) => (
            <button
              key={t.tag}
              className={activeTags.includes(t.tag) ? "chip on" : "chip"}
              aria-pressed={activeTags.includes(t.tag)}
              onClick={() => update(q, toggle(activeTags, t.tag), activeQuick)}
            >
              {t.tag}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {shown && shown.length > 0 && (
        <div className="listhead">
          <span>
            {shown.length} {shown.length === 1 ? "recipe" : "recipes"}
          </span>
          {shown.length > 1 && (
            <button className="link" onClick={() => navigate(`/recipes/${shown[Math.floor(Math.random() * shown.length)].id}`)}>
              <ShuffleIcon size={18} /> Surprise me
            </button>
          )}
        </div>
      )}

      {shown && shown.length === 0 && (
        <div className="empty">
          <div className="big">{filtering ? "🔍" : "📖"}</div>
          <h2>{filtering ? "No matching recipes" : "Your cookbook is empty"}</h2>
          {filtering ? (
            <button className="link" onClick={() => update("", [], [])}>
              Clear search and filters
            </button>
          ) : (
            <p>Ask Claude to find a recipe and save it, and it will show up here.</p>
          )}
        </div>
      )}

      <ul className="cards">
        {shown?.map((r) => {
          const minutes = totalMinutes(r);
          const cover = coverFor(r.title, r.tags);
          return (
            <li key={r.id}>
              <Link className="card" to={`/recipes/${r.id}`}>
                <div className="cover" style={{ "--hue": cover.hue } as CSSProperties} aria-hidden="true">
                  {cover.symbol}
                </div>
                <div className="cardbody">
                  <h3>{r.title}</h3>
                  <div className="facts">
                    {minutes > 0 && (
                      <span>
                        <ClockIcon size={15} /> {formatMinutes(minutes)}
                      </span>
                    )}
                    {r.nutrition?.calories != null && (
                      <span>
                        <FlameIcon size={15} /> {Math.round(r.nutrition.calories)} kcal
                      </span>
                    )}
                    {r.nutrition?.protein_g != null && <span>{Math.round(r.nutrition.protein_g)} g protein</span>}
                  </div>
                  <div className="meta">
                    {r.tags.slice(0, 3).map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
