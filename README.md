# Cooking App

A personal recipe app. You find recipes by talking to Claude in the Claude app; Claude saves the
ones you pick. The web app (installable on a phone) is where you browse, cook and shop.

- **Recipes** with tags, search, per-ingredient substitutes and serving scaling
- **Start cooking**: one step at a time, large text, timers, screen stays on
- **Grocery list**: add a recipe's ingredients, tick items off, copy or share as plain text for
  Google Keep or Apple Notes
- **Claude connector**: lets your Claude app search, save and edit recipes and the grocery list

## Run locally

```bash
npm install
```

Copy `.dev.vars.example` to `.dev.vars` and set a local password, then:

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Open http://localhost:5173 and sign in with the `APP_PASSWORD` from `.dev.vars`.

`npm run smoke` (with the dev server running) checks the web API and the Claude connector end to
end. `npm run typecheck` checks types.

## Deploy to Cloudflare (first time)

1. Sign in: `npx wrangler login`
2. Create the database: `npx wrangler d1 create cooking-app`, then paste the printed
   `database_id` into `wrangler.jsonc`.
3. Create the connector's storage: `npx wrangler kv namespace create OAUTH_KV`, then paste the
   printed `id` into `wrangler.jsonc`.
4. Create the tables: `npm run db:migrate:remote`
5. Deploy: `npm run deploy`. Note the address it prints (`https://cooking-app.<you>.workers.dev`).
6. Set the secrets (each command prompts for the value):
   - `npx wrangler secret put APP_PASSWORD` — the password you will sign in with. Make it long;
     it is the only thing protecting the app.
   - `npx wrangler secret put SESSION_SECRET` — any long random string

Later deploys are just `npm run deploy` (plus `npm run db:migrate:remote` when a new file appears
in `migrations/`).

## Connect Claude

In Claude (web or desktop): Customize → Connectors → Add → Add custom connector. Give it a name
and the address `https://<your-app-address>/mcp`. Claude opens the app's approval page; enter the
app password and choose Allow. The connector is then available in the Claude mobile app too.

Then ask Claude things like "find me three quick Thai curries", and "save the second one".

## Install on your phone

Open the app's address in Safari (iPhone) or Chrome (Android), sign in, then use Share → Add to
Home Screen (iPhone) or the menu → Install app (Android).

## Layout

- `worker/` — the server: `app.ts` (web API and login), `mcp.ts` (the tools Claude can call),
  `authorize.ts` (the connector approval page), `db.ts` (all database access)
- `shared/` — recipe schema and formatting used by both the server and the web app
- `src/` — the React web app
- `public/` — icons, web app manifest and the offline service worker
- `migrations/` — database schema
- `scripts/` — smoke test and icon generator
