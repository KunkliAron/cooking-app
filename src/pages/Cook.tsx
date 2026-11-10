import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatAmount } from "../../shared/format";
import { api, errorMessage, type Ingredient, type Recipe } from "../api";

/** A step's countdown. `endsAt` is set while running; `remaining` holds the seconds left while paused. */
interface Timer {
  endsAt: number | null;
  remaining: number;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

const secondsLeft = (t: Timer, now: number) => (t.endsAt ? (t.endsAt - now) / 1000 : t.remaining);

/** Ingredients a step mentions, by full name or by the name's last word ("yellow onion" matches "onion"). */
function mentioned(stepText: string, ingredients: Ingredient[]): Ingredient[] {
  const text = stepText.toLowerCase();
  return ingredients.filter((ing) => {
    const name = ing.name.toLowerCase();
    const last = name.split(/\s+/).pop() ?? name;
    return text.includes(name) || (last.length > 3 && text.includes(last));
  });
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // No sound available; the on-screen message still shows.
  }
  navigator.vibrate?.([300, 150, 300]);
}

export default function Cook() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const storageKey = `cook-step:${id}`;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(() => Number(sessionStorage.getItem(storageKey)) || 0);
  const [showAll, setShowAll] = useState(false);
  const [timers, setTimers] = useState<Record<number, Timer>>({});
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState<number[]>([]);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    api<{ recipe: Recipe }>(`/recipes/${id}`)
      .then((r) => setRecipe(r.recipe))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  useEffect(() => sessionStorage.setItem(storageKey, String(index)), [storageKey, index]);

  // Keep the screen on while cooking. The lock is dropped when the tab is hidden, so take it again on return.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock
          ?.request("screen")
          .then((l) => (lock = l))
          .catch(() => {});
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  const running = Object.values(timers).some((t) => t.endsAt);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running]);

  // When a running timer reaches zero, stop it and announce it.
  useEffect(() => {
    const done = Object.entries(timers).filter(([, t]) => t.endsAt && t.endsAt <= now);
    if (!done.length) return;
    setTimers((prev) => {
      const next = { ...prev };
      done.forEach(([step]) => (next[Number(step)] = { endsAt: null, remaining: 0 }));
      return next;
    });
    setFinished((prev) => [...prev, ...done.map(([step]) => Number(step))]);
    beep();
  }, [timers, now]);

  if (error) {
    return (
      <div className="cook">
        <p className="error">{error}</p>
        <Link to={`/recipes/${id}`}>Back to recipe</Link>
      </div>
    );
  }
  if (!recipe) return <div className="cook" />;

  const steps = recipe.steps;
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  if (!step) {
    return (
      <div className="cook">
        <p>This recipe has no steps yet.</p>
        <Link to={`/recipes/${id}`}>Back to recipe</Link>
      </div>
    );
  }

  const servings = Number(params.get("servings")) || null;
  const scale = servings && recipe.servings ? servings / recipe.servings : 1;
  const isLast = current === steps.length - 1;
  const go = (by: number) => setIndex(Math.max(0, Math.min(steps.length - 1, current + by)));

  const timer: Timer | undefined = step.timer_seconds ? (timers[current] ?? { endsAt: null, remaining: step.timer_seconds }) : undefined;
  const setTimer = (t: Timer) => {
    setNow(Date.now());
    setFinished((prev) => prev.filter((s) => s !== current));
    setTimers((prev) => ({ ...prev, [current]: t }));
  };

  const stepIngredients = showAll ? recipe.ingredients : mentioned(step.text, recipe.ingredients);
  const otherRunning = Object.entries(timers).filter(([s, t]) => t.endsAt && Number(s) !== current);

  return (
    <div
      className="cook"
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className="cookbar">
        <Link to={`/recipes/${id}`} className="link">
          ✕ Exit
        </Link>
        <span aria-live="polite">
          Step {current + 1} of {steps.length}
        </span>
      </header>
      <progress value={current + 1} max={steps.length} aria-hidden="true" />

      {finished.map((s) => (
        <button key={s} className="alarm" role="alert" onClick={() => setFinished((prev) => prev.filter((x) => x !== s))}>
          Time's up for step {s + 1}. Tap to dismiss.
        </button>
      ))}
      {otherRunning.map(([s, t]) => (
        <button key={s} className="othertimer" onClick={() => setIndex(Number(s))}>
          Step {Number(s) + 1} timer: {clock(secondsLeft(t, now))}
        </button>
      ))}

      <div className="cookbody">
        <p className="steptext">{step.text}</p>

        {timer && (
          <div className="timer">
            <span className="time" role="timer">
              {clock(secondsLeft(timer, now))}
            </span>
            {timer.endsAt ? (
              <button className="button" onClick={() => setTimer({ endsAt: null, remaining: secondsLeft(timer, Date.now()) })}>
                Pause
              </button>
            ) : (
              <button
                className="button primary"
                onClick={() => setTimer({ endsAt: Date.now() + (timer.remaining || step.timer_seconds!) * 1000, remaining: 0 })}
              >
                {timer.remaining === step.timer_seconds ? "Start timer" : timer.remaining > 0 ? "Resume" : "Restart"}
              </button>
            )}
            {!timer.endsAt && timer.remaining !== step.timer_seconds && (
              <button className="link" onClick={() => setTimer({ endsAt: null, remaining: step.timer_seconds! })}>
                Reset
              </button>
            )}
          </div>
        )}

        <section className="cookingredients">
          <div className="sectionhead">
            <h3>{showAll ? "All ingredients" : "For this step"}</h3>
            <button className="link" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show this step only" : "Show all"}
            </button>
          </div>
          {stepIngredients.length ? (
            <ul>
              {stepIngredients.map((ing, i) => (
                <li key={i}>
                  {formatAmount(ing, scale)}
                  {ing.note && <span className="muted">, {ing.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No ingredients named in this step.</p>
          )}
        </section>
      </div>

      <nav className="cooknav">
        <button className="button" onClick={() => go(-1)} disabled={current === 0}>
          Back
        </button>
        {isLast ? (
          <Link className="button primary" to={`/recipes/${id}`} onClick={() => sessionStorage.removeItem(storageKey)}>
            Done
          </Link>
        ) : (
          <button className="button primary" onClick={() => go(1)}>
            Next
          </button>
        )}
      </nav>
    </div>
  );
}
