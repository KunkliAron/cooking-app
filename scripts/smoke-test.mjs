// End-to-end check against a running local server: `npm run dev`, then `npm run smoke`.
// Exercises the web API, then connects the way Claude does (OAuth, then MCP tool calls).
// Uses the password from .dev.vars and removes the data it creates.
// Each run makes two deliberate wrong-password attempts, so five runs within 15 minutes trip the
// login lockout. `npm run unlock:local` clears it.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5173";
const password = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^APP_PASSWORD=(.*)$/m)[1].trim();

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
}

const jar = new Map();
async function call(path, { method = "GET", json, form, headers = {}, cookies = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(method === "GET" ? {} : { Origin: BASE }),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(cookies && jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

const recipe = {
  title: "Smoke Test Green Curry",
  description: "Temporary recipe made by the smoke test.",
  source_url: "https://example.com/green-curry",
  servings: 2,
  prep_minutes: 10,
  cook_minutes: 20,
  ingredients: [
    { name: "smoketest coconut milk", quantity: 400, unit: "ml", aisle: "pantry" },
    {
      name: "smoketest galangal",
      quantity: 1,
      unit: "piece",
      aisle: "produce",
      substitutes: [{ name: "ginger", note: "Same amount, plus a little lime zest." }],
    },
  ],
  steps: [{ text: "Fry the paste." }, { text: "Simmer.", timer_seconds: 600 }],
  tags: ["Thai", "smoketest"],
};

// ---- Web API -------------------------------------------------------------
check("signed-out request is rejected", (await call("/api/recipes")).status === 401);
check("wrong password is rejected", (await call("/api/login", { method: "POST", json: { password: "nope" } })).status === 401);
check("login", (await call("/api/login", { method: "POST", json: { password } })).status === 200);

async function removeTestData() {
  for (const r of (await call("/api/recipes?tag=smoketest")).body.recipes) await call(`/api/recipes/${r.id}`, { method: "DELETE" });
  for (const item of (await call("/api/grocery")).body.items.filter((i) => i.name.startsWith("smoketest"))) {
    await call(`/api/grocery/${item.id}`, { method: "DELETE" });
  }
}
await removeTestData(); // in case an earlier run stopped half way

const created = await call("/api/recipes", { method: "POST", json: recipe });
check("create recipe", created.status === 201 && created.body.recipe?.tags?.includes("thai"), JSON.stringify(created.body));
const id = created.body.recipe?.id;

check("invalid recipe is rejected", (await call("/api/recipes", { method: "POST", json: { title: "" } })).status === 400);
check(
  "javascript: source link is rejected",
  (await call("/api/recipes", { method: "POST", json: { title: "x", source_url: "javascript:alert(1)" } })).status === 400,
);

const byText = await call("/api/recipes?q=galangal+curry");
check("search by words", byText.body.recipes?.some((r) => r.id === id));
const byTag = await call("/api/recipes?tag=smoketest");
check("filter by tag", byTag.body.recipes?.length === 1 && byTag.body.recipes[0].id === id);
check("search miss", (await call("/api/recipes?q=zzzznotthere")).body.recipes?.length === 0);
check("tags listed", (await call("/api/tags")).body.tags?.some((t) => t.tag === "smoketest"));

const patched = await call(`/api/recipes/${id}`, { method: "PUT", json: { tags: ["smoketest", "dinner"] } });
check("partial update keeps other fields", patched.body.recipe?.ingredients?.length === 2 && patched.body.recipe.tags.includes("dinner"));

await call(`/api/recipes/${id}/grocery`, { method: "POST", json: { servings: 4 } });
await call(`/api/recipes/${id}/grocery`, { method: "POST", json: {} });
let grocery = (await call("/api/grocery")).body.items.filter((i) => i.name.startsWith("smoketest"));
const milk = grocery.find((i) => i.name === "smoketest coconut milk");
check("grocery scales and merges (800 + 400 ml)", grocery.length === 2 && milk?.quantity === 1200, JSON.stringify(grocery));
check("tick item", (await call(`/api/grocery/${milk.id}`, { method: "PATCH", json: { checked: true } })).status === 200);

// ---- Claude connector: OAuth, then MCP ------------------------------------
check("MCP without a token is rejected", (await call("/mcp", { method: "POST", json: {}, cookies: false })).status === 401);

const meta = await call("/.well-known/oauth-authorization-server");
check("OAuth discovery", meta.status === 200 && !!meta.body.token_endpoint, JSON.stringify(meta.body));
const resourceMeta = await call("/.well-known/oauth-protected-resource/mcp");
check("resource discovery", resourceMeta.status === 200 && resourceMeta.body.resource === `${BASE}/mcp`, JSON.stringify(resourceMeta.body));

const redirectUri = "https://client.example/callback";
const reg = await call(new URL(meta.body.registration_endpoint).pathname, {
  method: "POST",
  cookies: false,
  json: { client_name: "Smoke Test Client", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" },
});
check("register client", reg.status === 201 && !!reg.body.client_id, JSON.stringify(reg.body));

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authQuery = new URLSearchParams({
  response_type: "code",
  client_id: reg.body.client_id,
  redirect_uri: redirectUri,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: "xyz",
  resource: `${BASE}/mcp`,
});

jar.clear(); // the consent page must not depend on the web app's session
const consent = await call(`/authorize?${authQuery}`);
const handle = /name="handle" value="([^"]*)"/.exec(consent.body)?.[1];
check("consent page shows the client", consent.status === 200 && consent.body.includes("Smoke Test Client") && !!handle);
check("consent page forbids framing", /frame-ancestors 'none'/.test(consent.headers.get("content-security-policy") ?? ""));
// form-action would make browsers block the redirect back to the connecting app after Allow.
check("consent page does not restrict form redirects", !/form-action/.test(consent.headers.get("content-security-policy") ?? ""));
// Pressing Enter in the password box submits with the first button in the page, which must be Allow.
check("Enter on the consent page means Allow", /<button[^>]*value="([^"]*)"/.exec(consent.body)?.[1] === "approve");

const fields = { handle, clientName: "Smoke Test Client", clientDomain: "", redirectHost: "client.example", loopback: "" };
const wrong = await call("/authorize", { method: "POST", form: { ...fields, decision: "approve", password: "nope" } });
check("consent with wrong password is refused", wrong.status === 401 && !wrong.headers.get("location"));

const approve = await call("/authorize", { method: "POST", form: { ...fields, decision: "approve", password } });
const location = approve.headers.get("location") ?? "";
const code = location.startsWith(redirectUri) ? new URL(location).searchParams.get("code") : null;
check("consent with password issues a code", approve.status === 302 && !!code, `${approve.status} ${location} ${String(approve.body).slice(0, 200)}`);

const token = await call(new URL(meta.body.token_endpoint).pathname, {
  method: "POST",
  cookies: false,
  form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: reg.body.client_id, code_verifier: verifier },
});
check("token exchange", token.status === 200 && !!token.body.access_token, JSON.stringify(token.body));

let rpcId = 0;
async function mcp(method, params) {
  const res = await call("/mcp", {
    method: "POST",
    cookies: false,
    headers: { Authorization: `Bearer ${token.body.access_token}`, Accept: "application/json, text/event-stream", Origin: "" },
    json: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  if (typeof res.body === "string") {
    const data = res.body.split("\n").filter((l) => l.startsWith("data:")).pop();
    res.body = data ? JSON.parse(data.slice(5)) : res.body;
  }
  return res;
}
const tool = async (name, args = {}) => {
  const res = await mcp("tools/call", { name, arguments: args });
  const result = res.body?.result;
  return { isError: !!result?.isError || !result, data: result?.content?.[0]?.text, raw: res };
};

const init = await mcp("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0.0" },
});
check("MCP initialize", init.status === 200 && !!init.body?.result?.serverInfo, JSON.stringify(init.body).slice(0, 300));

const tools = await mcp("tools/list", {});
const names = tools.body?.result?.tools?.map((t) => t.name) ?? [];
check("MCP lists 7 tools", names.length === 7 && names.includes("save_recipe"), JSON.stringify(tools.body).slice(0, 300));

const saved = await tool("save_recipe", { ...recipe, title: "Smoke Test Via Claude" });
const savedId = saved.data && JSON.parse(saved.data).id;
check("MCP save_recipe", !saved.isError && !!savedId, JSON.stringify(saved.raw.body).slice(0, 300));

const found = await tool("search_recipes", { query: "via claude" });
check("MCP search_recipes", !found.isError && JSON.parse(found.data).recipes.some((r) => r.id === savedId));

const updated = await tool("update_recipe", { id: savedId, notes: "Nice with rice." });
check("MCP update_recipe", !updated.isError && JSON.parse(updated.data).notes === "Nice with rice." && JSON.parse(updated.data).steps.length === 2);

const bad = await tool("save_recipe", { title: "" });
check("MCP rejects invalid input", bad.isError);

const list = await tool("get_grocery_list");
check("MCP get_grocery_list text omits ticked items", !list.isError && JSON.parse(list.data).text.includes("3 piece smoketest galangal") && !JSON.parse(list.data).text.includes("coconut"), list.data);

check("MCP delete_recipe", !(await tool("delete_recipe", { id: savedId })).isError);

// ---- Clean up --------------------------------------------------------------
await call("/api/login", { method: "POST", json: { password } });
check("delete recipe", (await call(`/api/recipes/${id}`, { method: "DELETE" })).status === 200);
check("deleted recipe is gone", (await call(`/api/recipes/${id}`)).status === 404);
await removeTestData();

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
