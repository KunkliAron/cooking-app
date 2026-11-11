import { z } from "zod";
import { AISLES } from "./constants";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const optionalInt = (max: number) => z.number().int().positive().max(max).nullable().optional();

export const substituteSchema = z.object({
  name: text(120).min(1).describe("The substitute ingredient, e.g. 'ginger plus a little lime zest'"),
  note: optionalText(300).describe("How to use it: ratio, and how it changes the dish"),
});

export const ingredientSchema = z.object({
  name: text(120).min(1).describe("Ingredient name without the quantity, e.g. 'yellow onion'"),
  quantity: z.number().positive().nullable().optional().describe("Amount as a number, e.g. 0.5. Omit for 'to taste'"),
  unit: optionalText(30).describe("Unit, e.g. 'g', 'ml', 'tbsp', 'clove'. Omit for countable items"),
  aisle: z.enum(AISLES).nullable().optional().describe("Where it is found in a supermarket"),
  note: optionalText(200).describe("Preparation, e.g. 'finely chopped'"),
  substitutes: z
    .array(substituteSchema)
    .max(8)
    .optional()
    .describe("Alternatives for ingredients that may be hard to find"),
});

export const stepSchema = z.object({
  text: text(2000).min(1).describe("One instruction, written in your own words"),
  timer_seconds: optionalInt(86400).describe("Set when the step involves waiting a fixed time, e.g. 600 for 'simmer 10 minutes'"),
});

const macro = (max: number) => z.number().min(0).max(max).nullable().optional();

export const nutritionSchema = z.object({
  calories: macro(100000).describe("kcal per serving"),
  protein_g: macro(10000).describe("Grams of protein per serving"),
  carbs_g: macro(10000).describe("Grams of carbohydrate per serving"),
  fat_g: macro(10000).describe("Grams of fat per serving"),
});

const recipeFields = z.object({
  title: text(200).min(1),
  description: optionalText(1000).describe("One or two sentences about the dish"),
  source_url: text(2000)
    .refine((v) => /^https?:\/\//i.test(v), "Must be an http(s) link")
    .nullable()
    .optional()
    .describe("Link to the page the recipe came from"),
  servings: optionalInt(1000),
  prep_minutes: optionalInt(100000),
  cook_minutes: optionalInt(100000),
  ingredients: z.array(ingredientSchema).max(100),
  steps: z.array(stepSchema).max(100),
  tags: z
    .array(text(40).min(1))
    .max(30)
    .describe("Lower-case labels: cuisine, meal type, diet, main ingredient, effort, e.g. ['thai','dinner','vegetarian','quick']"),
  nutrition: nutritionSchema
    .nullable()
    .optional()
    .describe("Macros for ONE serving. Take them from the source when it gives them, otherwise estimate from the ingredients"),
  notes: optionalText(5000),
});

/** A whole recipe. The three lists may be left out and then start empty. */
export const recipeInputSchema = recipeFields.extend({
  ingredients: recipeFields.shape.ingredients.default([]),
  steps: recipeFields.shape.steps.default([]),
  tags: recipeFields.shape.tags.default([]),
});

/** A partial edit. Built from the fields without defaults, so a missing list stays untouched. */
export const recipePatchSchema = recipeFields.partial();

export const groceryItemInputSchema = z.object({
  name: text(120).min(1),
  quantity: z.number().positive().nullable().optional(),
  unit: optionalText(30),
  aisle: z.enum(AISLES).nullable().optional(),
});

export type Substitute = z.infer<typeof substituteSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Nutrition = z.infer<typeof nutritionSchema>;
export type Step = z.infer<typeof stepSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipePatch = z.infer<typeof recipePatchSchema>;
export type GroceryItemInput = z.infer<typeof groceryItemInputSchema>;

export interface Recipe extends RecipeInput {
  id: string;
  created_at: number;
  updated_at: number;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  nutrition: Nutrition | null;
  tags: string[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string | null;
  checked: boolean;
  recipe_id: string | null;
  recipe_title: string | null;
}
