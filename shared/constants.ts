/** Grocery aisles, in the order they are shown on the grocery list. */
export const AISLES = [
  "produce",
  "meat & fish",
  "dairy & eggs",
  "bakery",
  "pantry",
  "spices",
  "frozen",
  "drinks",
  "other",
] as const;

export type Aisle = (typeof AISLES)[number];
