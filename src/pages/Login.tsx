import { useState, type FormEvent } from "react";
import { api } from "../api";

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", { method: "POST", json: { password } });
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="mark" aria-hidden="true">
        🍳
      </div>
      <h1>My Recipes</h1>
      <p className="muted">Your own cookbook, filled by Claude.</p>
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        required
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
