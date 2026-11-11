import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { z } from "zod";
import { groceryItemInputSchema, recipeInputSchema, recipePatchSchema } from "../shared/schema";
import { PASSWORD_ERRORS, checkPassword, clientIp } from "./auth";
import { authorizeGet, authorizePost } from "./authorize";
import * as db from "./db";

type AppContext = Context<{ Bindings: Env }>;

const COOKIE = "session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export const app = new Hono<{ Bindings: Env }>();

// Rejects form posts from other sites; JSON posts cannot be sent cross-site without CORS.
app.use(csrf());

// Refuse to run at all if the secrets are missing, rather than run unprotected.
app.use(async (c, next) => {
  if (!c.env.APP_PASSWORD || !c.env.SESSION_SECRET) {
    return c.json({ error: "Server is missing APP_PASSWORD or SESSION_SECRET." }, 500);
  }
  await next();
});

// The page where Claude's connector asks for access. It checks the password itself.
app.get("/authorize", (c) => authorizeGet(c.req.raw, c.env));
app.post("/authorize", (c) => authorizePost(c.req.raw, c.env));

async function isSignedIn(c: AppContext) {
  const expires = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  return typeof expires === "string" && Number(expires) > Date.now();
}

/** Parses and validates a JSON body, or returns a 400 response describing the first problem. */
async function readBody<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.infer<S> | Response> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue.path.join(".");
  return c.json({ error: where ? `${where}: ${issue.message}` : issue.message }, 400);
}

const notFound = (c: AppContext) => c.json({ error: "Not found." }, 404);

const api = new Hono<{ Bindings: Env }>();

api.get("/session", async (c) => c.json({ authenticated: await isSignedIn(c) }));

api.post("/login", async (c) => {
  const body = await c.req.json<{ password?: unknown }>().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await checkPassword(c.env, clientIp(c.req.raw), password);
  if (result !== "ok") return c.json({ error: PASSWORD_ERRORS[result] }, result === "locked" ? 429 : 401);

  await setSignedCookie(c, COOKIE, String(Date.now() + SESSION_SECONDS * 1000), c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return c.json({ ok: true });
});

api.post("/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Everything below this line requires a signed-in session.
api.use(async (c, next) => {
  if (!(await isSignedIn(c))) return c.json({ error: "Not signed in." }, 401);
  await next();
});

api.get("/recipes", async (c) => {
  const recipes = await db.listRecipes(c.env.DB, { q: c.req.query("q"), tags: c.req.queries("tag") });
  return c.json({ recipes });
});

api.get("/tags", async (c) => c.json({ tags: await db.listTags(c.env.DB) }));

api.post("/recipes", async (c) => {
  const input = await readBody(c, recipeInputSchema);
  if (input instanceof Response) return input;
  return c.json({ recipe: await db.createRecipe(c.env.DB, input) }, 201);
});

api.get("/recipes/:id", async (c) => {
  const recipe = await db.getRecipe(c.env.DB, c.req.param("id"));
  return recipe ? c.json({ recipe }) : notFound(c);
});

api.put("/recipes/:id", async (c) => {
  const patch = await readBody(c, recipePatchSchema);
  if (patch instanceof Response) return patch;
  const recipe = await db.updateRecipe(c.env.DB, c.req.param("id"), patch);
  return recipe ? c.json({ recipe }) : notFound(c);
});

api.delete("/recipes/:id", async (c) => {
  return (await db.deleteRecipe(c.env.DB, c.req.param("id"))) ? c.json({ ok: true }) : notFound(c);
});

api.post("/recipes/:id/grocery", async (c) => {
  const body = await c.req.json<{ servings?: unknown; ingredients?: unknown }>().catch(() => null);
  const servings = typeof body?.servings === "number" && body.servings > 0 ? body.servings : null;
  // Positions in the recipe's ingredient list to add; everything when left out.
  const only = Array.isArray(body?.ingredients) ? body.ingredients.filter((n): n is number => Number.isInteger(n)) : null;
  const added = await db.addRecipeToGrocery(c.env.DB, c.req.param("id"), servings, { only });
  return added === null ? notFound(c) : c.json({ added });
});

api.get("/grocery", async (c) => c.json({ items: await db.listGrocery(c.env.DB) }));

api.post("/grocery", async (c) => {
  const item = await readBody(c, groceryItemInputSchema);
  if (item instanceof Response) return item;
  await db.addGroceryItems(c.env.DB, [item]);
  return c.json({ items: await db.listGrocery(c.env.DB) }, 201);
});

api.post("/grocery/clear", async (c) => {
  const body = await c.req.json<{ scope?: unknown }>().catch(() => null);
  if (body?.scope !== "checked" && body?.scope !== "all") return c.json({ error: "scope must be 'checked' or 'all'." }, 400);
  await db.clearGrocery(c.env.DB, body.scope);
  return c.json({ items: await db.listGrocery(c.env.DB) });
});

api.patch("/grocery/:id", async (c) => {
  const body = await c.req.json<{ checked?: unknown }>().catch(() => null);
  if (typeof body?.checked !== "boolean") return c.json({ error: "checked must be true or false." }, 400);
  return (await db.setGroceryChecked(c.env.DB, c.req.param("id"), body.checked)) ? c.json({ ok: true }) : notFound(c);
});

api.delete("/grocery/:id", async (c) => {
  return (await db.deleteGroceryItem(c.env.DB, c.req.param("id"))) ? c.json({ ok: true }) : notFound(c);
});

app.route("/api", api);
app.notFound(notFound);
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong on the server." }, 500);
});
