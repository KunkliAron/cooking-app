import { useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { SIGNED_OUT_EVENT, api } from "./api";
import Cook from "./pages/Cook";
import Grocery from "./pages/Grocery";
import Login from "./pages/Login";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeEdit from "./pages/RecipeEdit";
import Recipes from "./pages/Recipes";

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
        <Route path="*" element={<p className="empty">Page not found.</p>} />
      </Route>
    </Routes>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const onGrocery = useLocation().pathname.startsWith("/grocery");
  return (
    <div className="shell">
      <header className="topbar">
        <h1>My Recipes</h1>
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
      <nav className="tabs">
        <NavLink to="/" className={onGrocery ? "" : "active"}>
          Recipes
        </NavLink>
        <NavLink to="/grocery">Grocery list</NavLink>
      </nav>
    </div>
  );
}
