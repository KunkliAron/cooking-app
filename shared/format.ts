import { AISLES } from "./constants";

const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/** 1.5 -> "1½", 0.333 -> "⅓", 2.25 -> "2¼", 1.37 -> "1.37". */
export function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.02) return String(whole);
  if (rest > 0.98) return String(whole + 1);
  const match = FRACTIONS.find(([value]) => Math.abs(value - rest) < 0.02);
  if (match) return (whole > 0 ? String(whole) : "") + match[1];
  return String(Math.round(q * 100) / 100);
}

export function formatAmount(item: { name: string; quantity?: number | null; unit?: string | null }, scale = 1): string {
  const parts: string[] = [];
  if (item.quantity != null) parts.push(formatQuantity(item.quantity * scale));
  if (item.unit) parts.push(item.unit);
  parts.push(item.name);
  return parts.join(" ");
}

export function aisleRank(aisle: string | null | undefined): number {
  const i = AISLES.indexOf((aisle ?? "other") as (typeof AISLES)[number]);
  return i === -1 ? AISLES.length : i;
}

/**
 * The unchecked items as plain lines, one per item, in aisle order. Pasted into
 * Google Keep or Apple Notes, each line becomes its own checklist entry.
 */
export function groceryToText(
  items: { name: string; quantity: number | null; unit: string | null; aisle: string | null; checked: boolean }[],
): string {
  return items
    .filter((i) => !i.checked)
    .slice()
    .sort((a, b) => aisleRank(a.aisle) - aisleRank(b.aisle))
    .map((i) => formatAmount(i))
    .join("\n");
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
