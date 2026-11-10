export type {
  GroceryItem,
  Ingredient,
  Recipe,
  RecipeInput,
  RecipeSummary,
  Step,
  Substitute,
  TagCount,
} from "../shared/schema";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fired when the server says the session has ended, so the app can show the sign-in page. */
export const SIGNED_OUT_EVENT = "app:signed-out";

export async function api<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? "GET",
      headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch {
    throw new ApiError(0, "You appear to be offline.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && path !== "/login") window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.");
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
