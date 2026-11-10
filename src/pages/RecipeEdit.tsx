import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AISLES } from "../../shared/constants";
import { api, errorMessage, type Recipe, type RecipeInput, type Substitute } from "../api";

// The form keeps everything as text; it is converted to a RecipeInput on save.
interface IngredientRow {
  quantity: string;
  unit: string;
  name: string;
  aisle: string;
  note: string;
  substitutes: string;
}
interface StepRow {
  text: string;
  minutes: string;
}
interface FormState {
  title: string;
  description: string;
  source_url: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  tags: string;
  notes: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
}

const emptyIngredient = (): IngredientRow => ({ quantity: "", unit: "", name: "", aisle: "", note: "", substitutes: "" });
const emptyStep = (): StepRow => ({ text: "", minutes: "" });

const emptyForm = (): FormState => ({
  title: "",
  description: "",
  source_url: "",
  servings: "",
  prep_minutes: "",
  cook_minutes: "",
  tags: "",
  notes: "",
  ingredients: [emptyIngredient()],
  steps: [emptyStep()],
});

/** Substitutes are edited as one line: "ginger: same amount; lime zest". */
const substitutesToText = (subs: Substitute[] | undefined) =>
  (subs ?? []).map((s) => (s.note ? `${s.name}: ${s.note}` : s.name)).join("; ");

function textToSubstitutes(text: string): Substitute[] {
  return text
    .split(";")
    .map((part) => {
      const colon = part.indexOf(":");
      return colon === -1
        ? { name: part.trim() }
        : { name: part.slice(0, colon).trim(), note: part.slice(colon + 1).trim() || undefined };
    })
    .filter((s) => s.name);
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};
const int = (s: string) => {
  const n = num(s);
  return n == null ? null : Math.round(n);
};

function toForm(r: Recipe): FormState {
  return {
    title: r.title,
    description: r.description ?? "",
    source_url: r.source_url ?? "",
    servings: str(r.servings),
    prep_minutes: str(r.prep_minutes),
    cook_minutes: str(r.cook_minutes),
    tags: r.tags.join(", "),
    notes: r.notes ?? "",
    ingredients: r.ingredients.map((i) => ({
      quantity: str(i.quantity),
      unit: i.unit ?? "",
      name: i.name,
      aisle: i.aisle ?? "",
      note: i.note ?? "",
      substitutes: substitutesToText(i.substitutes),
    })),
    steps: r.steps.map((s) => ({ text: s.text, minutes: s.timer_seconds ? str(Math.round((s.timer_seconds / 60) * 100) / 100) : "" })),
  };
}

function toInput(f: FormState): RecipeInput {
  return {
    title: f.title,
    description: f.description || null,
    source_url: f.source_url.trim() || null,
    servings: int(f.servings),
    prep_minutes: int(f.prep_minutes),
    cook_minutes: int(f.cook_minutes),
    notes: f.notes || null,
    tags: f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    ingredients: f.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name,
        quantity: num(i.quantity),
        unit: i.unit || null,
        aisle: (i.aisle || null) as RecipeInput["ingredients"][number]["aisle"],
        note: i.note || null,
        substitutes: textToSubstitutes(i.substitutes),
      })),
    steps: f.steps
      .filter((s) => s.text.trim())
      .map((s) => {
        const minutes = num(s.minutes);
        return { text: s.text, timer_seconds: minutes ? Math.round(minutes * 60) : null };
      }),
  };
}

export default function RecipeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState | null>(id ? null : emptyForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<{ recipe: Recipe }>(`/recipes/${id}`)
      .then((r) => setForm(toForm(r.recipe)))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (!form) return error ? <p className="error">{error}</p> : null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const setIngredient = (i: number, patch: Partial<IngredientRow>) =>
    set("ingredients", form.ingredients.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const setStep = (i: number, patch: Partial<StepRow>) =>
    set("steps", form.steps.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const moveStep = (i: number, by: number) => {
    const steps = [...form.steps];
    [steps[i], steps[i + by]] = [steps[i + by], steps[i]];
    set("steps", steps);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { recipe } = await api<{ recipe: Recipe }>(id ? `/recipes/${id}` : "/recipes", {
        method: id ? "PUT" : "POST",
        json: toInput(form!),
      });
      navigate(`/recipes/${recipe.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const backTo = id ? `/recipes/${id}` : "/";

  return (
    <form className="editor" onSubmit={save}>
      <Link className="back" to={backTo}>
        ‹ Cancel
      </Link>
      <h2>{id ? "Edit recipe" : "New recipe"}</h2>

      <label>
        Title
        <input value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} />
      </label>
      <label>
        Description
        <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} />
      </label>
      <div className="row3">
        <label>
          Servings
          <input inputMode="numeric" value={form.servings} onChange={(e) => set("servings", e.target.value)} />
        </label>
        <label>
          Prep (min)
          <input inputMode="numeric" value={form.prep_minutes} onChange={(e) => set("prep_minutes", e.target.value)} />
        </label>
        <label>
          Cook (min)
          <input inputMode="numeric" value={form.cook_minutes} onChange={(e) => set("cook_minutes", e.target.value)} />
        </label>
      </div>
      <label>
        Tags, separated by commas
        <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="thai, dinner, quick" autoCapitalize="none" />
      </label>

      <h3>Ingredients</h3>
      {form.ingredients.map((row, i) => (
        <fieldset key={i} className="rowcard">
          <legend className="sr-only">Ingredient {i + 1}</legend>
          <div className="ingredientrow">
            <input aria-label="Quantity" placeholder="Qty" inputMode="decimal" value={row.quantity} onChange={(e) => setIngredient(i, { quantity: e.target.value })} />
            <input aria-label="Unit" placeholder="Unit" value={row.unit} onChange={(e) => setIngredient(i, { unit: e.target.value })} autoCapitalize="none" />
            <input aria-label="Ingredient" placeholder="Ingredient" value={row.name} onChange={(e) => setIngredient(i, { name: e.target.value })} />
          </div>
          <div className="ingredientrow two">
            <select aria-label="Aisle" value={row.aisle} onChange={(e) => setIngredient(i, { aisle: e.target.value })}>
              <option value="">Aisle</option>
              {AISLES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <input aria-label="Preparation note" placeholder="Note, e.g. chopped" value={row.note} onChange={(e) => setIngredient(i, { note: e.target.value })} />
          </div>
          <input
            aria-label="Substitutes"
            placeholder="Substitutes, e.g. ginger: same amount; lime zest"
            value={row.substitutes}
            onChange={(e) => setIngredient(i, { substitutes: e.target.value })}
          />
          <button type="button" className="link danger" onClick={() => set("ingredients", form.ingredients.filter((_, j) => j !== i))}>
            Remove
          </button>
        </fieldset>
      ))}
      <button type="button" className="button" onClick={() => set("ingredients", [...form.ingredients, emptyIngredient()])}>
        Add ingredient
      </button>

      <h3>Steps</h3>
      {form.steps.map((row, i) => (
        <fieldset key={i} className="rowcard">
          <legend>Step {i + 1}</legend>
          <textarea aria-label={`Step ${i + 1} instruction`} rows={3} value={row.text} onChange={(e) => setStep(i, { text: e.target.value })} />
          <div className="steprow">
            <label className="inline">
              Timer (min)
              <input inputMode="decimal" value={row.minutes} onChange={(e) => setStep(i, { minutes: e.target.value })} />
            </label>
            <button type="button" className="link" disabled={i === 0} onClick={() => moveStep(i, -1)}>
              Move up
            </button>
            <button type="button" className="link" disabled={i === form.steps.length - 1} onClick={() => moveStep(i, 1)}>
              Move down
            </button>
            <button type="button" className="link danger" onClick={() => set("steps", form.steps.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="button" onClick={() => set("steps", [...form.steps, emptyStep()])}>
        Add step
      </button>

      <h3>More</h3>
      <label>
        Notes
        <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={5000} />
      </label>
      <label>
        Source link
        <input type="url" value={form.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://" />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="savebar">
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </form>
  );
}
