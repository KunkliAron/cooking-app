import { useEffect, useState, type FormEvent } from "react";
import { AISLES } from "../../shared/constants";
import { aisleRank, formatAmount, groceryToText } from "../../shared/format";
import { api, errorMessage, type GroceryItem } from "../api";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers and non-secure pages: fall back to selecting a hidden text box.
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    document.execCommand("copy");
    box.remove();
  }
}

export default function Grocery() {
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (action: () => Promise<{ items: GroceryItem[] } | void>) => {
    setError("");
    try {
      const result = await action();
      if (result) setItems(result.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const reload = () => api<{ items: GroceryItem[] }>("/grocery");

  useEffect(() => {
    run(reload);
  }, []);

  if (!items) return error ? <p className="error">{error}</p> : null;

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const text = groceryToText(items);

  // Items without a known aisle (typed in by hand, for example) go under "other".
  const groups = AISLES.map((aisle, rank) => ({
    aisle,
    items: todo.filter((i) => Math.min(aisleRank(i.aisle), AISLES.length - 1) === rank),
  })).filter((g) => g.items.length);

  function toggle(item: GroceryItem) {
    // Update the screen first so ticking feels instant in the shop; put it back if the save fails.
    setItems(items!.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    run(async () => {
      try {
        await api(`/grocery/${item.id}`, { method: "PATCH", json: { checked: !item.checked } });
        // Re-read so the screen matches the server even if another change was in flight.
        return await reload();
      } catch (err) {
        setItems((prev) => prev && prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
        throw err;
      }
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setNewItem("");
    run(() => api<{ items: GroceryItem[] }>("/grocery", { method: "POST", json: { name } }));
  }

  const remove = (item: GroceryItem) =>
    run(async () => {
      await api(`/grocery/${item.id}`, { method: "DELETE" });
      return reload();
    });

  const clear = (scope: "checked" | "all") => {
    if (scope === "all" && !confirm("Remove every item from the grocery list?")) return;
    run(() => api<{ items: GroceryItem[] }>("/grocery/clear", { method: "POST", json: { scope } }));
  };

  async function copy() {
    await copyText(text);
    setNotice("Copied. Paste it into Google Keep or Notes.");
    setTimeout(() => setNotice(""), 4000);
  }

  const row = (item: GroceryItem) => (
    <li key={item.id} className={item.checked ? "groceryitem checked" : "groceryitem"}>
      <label>
        <input type="checkbox" checked={item.checked} onChange={() => toggle(item)} />
        <span>
          {formatAmount(item)}
          {item.recipe_title && <small className="muted">{item.recipe_title}</small>}
        </span>
      </label>
      <button className="link" onClick={() => remove(item)} aria-label={`Remove ${item.name}`}>
        ✕
      </button>
    </li>
  );

  return (
    <div className="grocery">
      <form className="searchrow" onSubmit={add}>
        <input placeholder="Add an item" aria-label="Add an item" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={120} />
        <button className="button">Add</button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <h2>Grocery list is empty</h2>
          <p>Open a recipe and choose "Add to grocery list", or add items above.</p>
        </div>
      ) : (
        <>
          <div className="actions">
            <button className="button primary" onClick={copy} disabled={!todo.length}>
              Copy list
            </button>
            {"share" in navigator && (
              <button className="button" onClick={() => navigator.share({ title: "Grocery list", text }).catch(() => {})} disabled={!todo.length}>
                Share
              </button>
            )}
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}

          {groups.map((g) => (
            <section key={g.aisle}>
              <h3 className="aisle">{g.aisle}</h3>
              <ul className="grocerylist">{g.items.map(row)}</ul>
            </section>
          ))}

          {done.length > 0 && (
            <section>
              <h3 className="aisle">In the basket</h3>
              <ul className="grocerylist">{done.map(row)}</ul>
            </section>
          )}

          <div className="actions quiet">
            {done.length > 0 && (
              <button className="button" onClick={() => clear("checked")}>
                Remove ticked
              </button>
            )}
            <button className="button danger" onClick={() => clear("all")}>
              Clear list
            </button>
          </div>
        </>
      )}
    </div>
  );
}
