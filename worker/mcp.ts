import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import { groceryToText } from "../shared/format";
import { groceryItemInputSchema, recipeInputSchema, recipePatchSchema } from "../shared/schema";
import * as db from "./db";

const INSTRUCTIONS = `This is the user's personal recipe collection and grocery list.

Typical flow: the user asks for recipe ideas, you search the web and present a few options, and they pick
one to keep. Only call save_recipe after the user has said which recipe to save.

When saving a recipe:
- Write the steps in your own words, one action per step, and keep the source_url.
- Give every ingredient a numeric quantity and unit where the recipe has one, and an aisle.
- For ingredients that can be hard to find, add substitutes with a note on ratio and effect.
- Set timer_seconds on steps that involve waiting a fixed time.
- Add lower-case tags (cuisine, meal type, diet, main ingredient, effort). Call search_recipes first to
  see the tags already in use and reuse them rather than inventing near-duplicates.`;

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failure = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

function buildServer(database: D1Database): McpServer {
  const server = new McpServer({ name: "my-recipes", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "search_recipes",
    {
      title: "Search saved recipes",
      description:
        "List the user's saved recipes, optionally filtered. Returns summaries (use get_recipe for full details) and every tag in use.",
      inputSchema: z.object({
        query: z.string().optional().describe("Words to match in the title, description, ingredients or tags"),
        tags: z.array(z.string()).optional().describe("Only recipes that have all of these tags"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, tags }) =>
      json({
        recipes: await db.listRecipes(database, { q: query, tags }),
        tags_in_use: await db.listTags(database),
      }),
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Get a saved recipe",
      description: "Get one saved recipe in full: ingredients, substitutes, steps, tags and notes.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const recipe = await db.getRecipe(database, id);
      return recipe ? json(recipe) : failure(`No recipe with id ${id}.`);
    },
  );

  server.registerTool(
    "save_recipe",
    {
      title: "Save a recipe",
      description: "Add a new recipe to the user's collection. Use only after the user has chosen a recipe to keep.",
      inputSchema: recipeInputSchema,
    },
    async (input) => {
      const recipe = await db.createRecipe(database, input);
      return json({ saved: true, id: recipe.id, title: recipe.title, tags: recipe.tags });
    },
  );

  server.registerTool(
    "update_recipe",
    {
      title: "Update a saved recipe",
      description:
        "Change a saved recipe, for example to add substitutes or tags. Only the fields you pass change, but ingredients, steps and tags are each replaced as a whole list, so call get_recipe first and send the full edited list.",
      inputSchema: recipePatchSchema.extend({ id: z.string() }),
      annotations: { idempotentHint: true },
    },
    async ({ id, ...patch }) => {
      const recipe = await db.updateRecipe(database, id, patch);
      return recipe ? json(recipe) : failure(`No recipe with id ${id}.`);
    },
  );

  server.registerTool(
    "delete_recipe",
    {
      title: "Delete a saved recipe",
      description: "Permanently delete a recipe. Only when the user explicitly asks for it.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) => ((await db.deleteRecipe(database, id)) ? json({ deleted: true }) : failure(`No recipe with id ${id}.`)),
  );

  server.registerTool(
    "add_to_grocery_list",
    {
      title: "Add to the grocery list",
      description:
        "Add a saved recipe's ingredients, loose items, or both to the grocery list. Items with the same name and unit are merged.",
      inputSchema: z.object({
        recipe_id: z.string().optional().describe("Add every ingredient of this saved recipe"),
        servings: z.number().positive().optional().describe("Scale the recipe's quantities to this many servings"),
        items: z.array(groceryItemInputSchema).max(100).optional().describe("Individual items to add"),
      }),
    },
    async ({ recipe_id, servings, items }) => {
      let added = 0;
      if (recipe_id) {
        const fromRecipe = await db.addRecipeToGrocery(database, recipe_id, servings);
        if (fromRecipe === null) return failure(`No recipe with id ${recipe_id}.`);
        added += fromRecipe;
      }
      if (items?.length) added += await db.addGroceryItems(database, items);
      return json({ added });
    },
  );

  server.registerTool(
    "get_grocery_list",
    {
      title: "Get the grocery list",
      description: "The current grocery list, plus the unticked items as plain text ready to paste into a notes app.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const items = await db.listGrocery(database);
      return json({ items, text: groceryToText(items) });
    },
  );

  return server;
}

/** Serves the connector. OAuthProvider only lets requests with a valid access token reach this. */
export function handleMcp(request: Request, env: Env): Promise<Response> {
  return createMcpHandler(() => buildServer(env.DB)).fetch(request);
}
