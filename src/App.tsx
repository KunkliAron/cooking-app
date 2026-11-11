import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { SIGNED_OUT_EVENT, api, type GroceryItem } from "./api";
import Cook from "./pages/Cook";
import Grocery from "./pages/Grocery";
import Login from "./pages/Login";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeEdit from "./pages/RecipeEdit";
import Recipes from "./pages/Recipes";
import { BasketIcon, BookIcon, PlusIcon, SignOutIcon } from "./ui/icons";

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ authenticated: boolean }>("/session")
      .then((s) => setSignedIn(s.authenticated))
      // Offline: assume the session is still good so cached recipes can be shown.
      .catch(() => setSignedIn(true));
    const onSignedOut = () => setSignedIn(false);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  async function signOut() {
    await api("/logout", { method: "POST" }).catch(() => {});
    // Recipes cached for offline use should not outlive the session.
    if ("caches" in window) await caches.delete("api").catch(() => {});
    setSignedIn(false);
  }

  return (
    <Routes>
      <Route path="/recipes/:id/cook" element={<Cook />} />
      <Route element={<Shell onSignOut={signOut} />}>
        <Route path="/" element={<Recipes />} />
        <Route path="/new" element={<RecipeEdit />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/:id/edit" element={<RecipeEdit />} />
        <Route path="/grocery" element={<Grocery />} />
        <Route
          path="*"
          element={
            <div className="empty">
              <div className="big">🧭</div>
              <h2>Page not found</h2>
              <Link to="/">Back to your recipes</Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { pathname } = useLocation();
  const section = pathname.startsWith("/grocery") ? "grocery" : pathname === "/new" ? "new" : "recipes";

  // A recipe or the editor fills the screen with its own action bar, so the tab bar steps aside.
  const focused = section === "new" || pathname.startsWith("/recipes/");

  // How many things are still to buy, shown on the grocery tab. Re-read whenever the page changes.
  const [toBuy, setToBuy] = useState(0);
  useEffect(() => {
    api<{ items: GroceryItem[] }>("/grocery")
      .then((r) => setToBuy(r.items.filter((i) => !i.checked).length))
      .catch(() => {});
  }, [pathname]);

  return (
    <div className={focused ? "shell focused" : "shell"}>
      <header className="topbar">
        <Link to="/" className="brand">
          <span aria-hidden="true">🍳</span> My Recipes
        </Link>
        <button className="iconbtn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <SignOutIcon />
        </button>
      </header>
      <main>
        <Outlet />
      </main>
      {!focused && (
      <nav className="tabs" aria-label="Main">
        <NavLink to="/" className={section === "recipes" ? "active" : ""}>
          <BookIcon />
          Recipes
        </NavLink>
        <NavLink to="/new" className="add" aria-label="Add a recipe by hand" title="Add a recipe by hand">
          <PlusIcon size={26} />
        </NavLink>
        <NavLink to="/grocery" className={section === "grocery" ? "active" : ""}>
          <BasketIcon />
          Groceries
          {toBuy > 0 && section !== "grocery" && (
            <span className="badge" aria-label={`${toBuy} to buy`}>
              {toBuy}
            </span>
          )}
        </NavLink>
      </nav>
      )}
    </div>
  );
}
