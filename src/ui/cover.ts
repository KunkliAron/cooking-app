/**
 * Recipes have no photos, so each one gets a cover made from its title and tags:
 * a food symbol picked by keyword and a colour that stays the same for that recipe.
 */
const SYMBOLS: [RegExp, string][] = [
  [/curry|masala|korma|dal\b|dhal/, "🍛"],
  [/pasta|spaghetti|penne|lasagn|noodle|ramen|carbonara|bolognese/, "🍝"],
  [/soup|stew|broth|chowder|goulash|gulyás/, "🍲"],
  [/salad|slaw/, "🥗"],
  [/pizza|flatbread/, "🍕"],
  [/burger/, "🍔"],
  [/taco|burrito|quesadilla|fajita/, "🌮"],
  [/sushi|poke/, "🍣"],
  [/salmon|fish|tuna|cod\b|seafood|shrimp|prawn/, "🐟"],
  [/chicken|turkey|duck/, "🍗"],
  [/beef|steak|pork|lamb|meatball|sausage/, "🥩"],
  [/egg|omelet|frittata|shakshuka/, "🍳"],
  [/rice|risotto|pilaf|paella|biryani/, "🍚"],
  [/bread|toast|sandwich|bagel|focaccia/, "🥖"],
  [/pancake|waffle|crepe/, "🥞"],
  [/cake|brownie|cookie|dessert|pie\b|tart|pudding|muffin/, "🍰"],
  [/smoothie|shake|juice|drink|cocktail/, "🥤"],
  [/breakfast|oat|porridge|granola/, "🥣"],
  [/potato|fries/, "🥔"],
  [/tofu|vegan|vegetarian|veggie|vegetable/, "🥦"],
];

const HUES = [28, 48, 96, 150, 188, 340];

export function coverFor(title: string, tags: string[] = []): { symbol: string; hue: number } {
  const text = `${title} ${tags.join(" ")}`.toLowerCase();
  const symbol = SYMBOLS.find(([pattern]) => pattern.test(text))?.[1] ?? "🍽️";
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { symbol, hue: HUES[hash % HUES.length] };
}

export const AISLE_SYMBOLS: Record<string, string> = {
  produce: "🥬",
  "meat & fish": "🥩",
  "dairy & eggs": "🥚",
  bakery: "🥖",
  pantry: "🫙",
  spices: "🧂",
  frozen: "🧊",
  drinks: "🧃",
  other: "🛒",
};
