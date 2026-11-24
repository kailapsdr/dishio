// "My fridge": what the user has, and how long each thing will last.
//
// Data lives in this browser only (see storage.js):
//   pantry -> [{ id, name, addedOn: "2026-11-24", useBy: "2026-11-27" }]
//
// How long food keeps: a small built-in list (English and Indonesian) answers
// instantly; for anything else, in any language, the server asks Gemini.

import { storage } from "./storage.js";

const PANTRY_KEY = "pantry";

export const MAX_NAME_LENGTH = 40;

// Rough number of days common foods keep in a home fridge (or cupboard).
// Only a starting suggestion: the user can always change it.
const KEEPS_FOR = [
  [["chicken", "ayam"], 2],
  [["minced", "mince", "ground beef", "daging giling"], 2],
  [["fish", "ikan", "salmon", "tuna steak"], 2],
  [["shrimp", "prawn", "udang", "squid", "cumi"], 2],
  [["beef", "pork", "lamb", "daging", "sapi", "kambing"], 3],
  [["sausage", "sosis", "ham", "bacon"], 7],
  [["cooked rice", "leftover rice", "nasi"], 3],
  [["tofu", "tahu"], 4],
  [["tempeh", "tempe"], 3],
  [["egg", "telur"], 21],
  [["milk", "susu"], 5],
  [["yogurt", "yoghurt"], 10],
  [["cheese", "keju"], 21],
  [["butter", "mentega"], 30],
  [["spinach", "bayam", "kangkung", "lettuce", "selada", "basil", "kemangi"], 3],
  [["spring onion", "scallion", "daun bawang", "celery", "seledri", "coriander", "cilantro"], 5],
  [["mushroom", "jamur", "bean sprout", "tauge", "toge"], 4],
  [["broccoli", "brokoli", "cauliflower", "kembang kol", "green bean", "buncis", "long bean", "kacang panjang"], 5],
  [["tomato", "tomat", "cucumber", "timun", "mentimun", "eggplant", "terong", "zucchini"], 6],
  [["chili", "chilli", "cabai", "cabe", "bell pepper", "paprika"], 7],
  [["cabbage", "kol", "kubis", "sawi", "bok choy", "pakcoy"], 10],
  [["carrot", "wortel"], 21],
  [["potato", "kentang", "sweet potato", "ubi"], 30],
  [["onion", "bawang merah", "bawang bombay", "shallot"], 30],
  [["garlic", "bawang putih"], 60],
  [["ginger", "jahe", "galangal", "lengkuas", "turmeric", "kunyit", "lemongrass", "serai"], 21],
  [["lemon", "lime", "jeruk nipis", "jeruk"], 14],
  [["banana", "pisang"], 5],
  [["bread", "roti"], 5],
  [["noodle", "mie", "mi basah"], 3],
];

// ---------------------------------------------------------------------------
//  Dates (always local calendar days, never times)
// ---------------------------------------------------------------------------
export function todayISO(now = new Date()) {
  return toISO(now);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + days));
}

/** Whole days from `today` until `useBy` (negative = already past). */
export function daysLeft(useBy, today = todayISO()) {
  return dayNumber(useBy) - dayNumber(today);
}

// ---------------------------------------------------------------------------
//  Freshness
// ---------------------------------------------------------------------------
/**
 * "past"  -> its date has gone by
 * "today" -> use it today
 * "soon"  -> 1 or 2 days left
 * "fresh" -> 3 or more days left
 */
export function freshness(item, today = todayISO()) {
  const left = daysLeft(item.useBy, today);
  if (left < 0) return { level: "past", days: -left };
  if (left === 0) return { level: "today", days: 0 };
  if (left <= 2) return { level: "soon", days: left };
  return { level: "fresh", days: left };
}

export function needsAttention(item, today = todayISO()) {
  return freshness(item, today).level !== "fresh";
}

/** Suggested number of days to keep, or null if the food is not known. */
export function suggestDays(name) {
  const text = String(name || "").toLowerCase();
  if (!text.trim()) return null;
  // Longest keyword first, so "cooked rice" wins over "rice" and
  // "bawang putih" over "bawang".
  let best = null;
  for (const [keywords, days] of KEEPS_FOR) {
    for (const word of keywords) {
      if (text.includes(word) && (!best || word.length > best.word.length)) best = { word, days };
    }
  }
  return best ? best.days : null;
}

// ---------------------------------------------------------------------------
//  Reading and changing the list
// ---------------------------------------------------------------------------
function isValidItem(item) {
  return (
    item &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.useBy || "")
  );
}

/** All items, soonest to spoil first. */
export function loadPantry() {
  const items = storage.get(PANTRY_KEY, []);
  return (Array.isArray(items) ? items.filter(isValidItem) : []).sort(
    (a, b) => a.useBy.localeCompare(b.useBy) || a.name.localeCompare(b.name)
  );
}

function savePantry(items) {
  storage.set(PANTRY_KEY, items);
}

export function cleanName(name) {
  return String(name || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function addItem(name, useBy, today = todayISO()) {
  const clean = cleanName(name);
  if (!clean || !/^\d{4}-\d{2}-\d{2}$/.test(useBy || "")) return null;
  const item = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    addedOn: today,
    useBy,
  };
  savePantry([...loadPantry(), item]);
  return item;
}

/** Take an item out of the fridge list. */
export function removeItem(id) {
  savePantry(loadPantry().filter((i) => i.id !== id));
}

/**
 * Text for the ingredients box: everything still good to eat, soonest first,
 * kept under `maxChars`. Also returns the names that should be used first.
 */
export function ingredientsForCooking(maxChars, today = todayISO()) {
  const usable = loadPantry().filter((item) => freshness(item, today).level !== "past");
  const names = [];
  let text = "";
  for (const item of usable) {
    const next = text ? `${text}, ${item.name}` : item.name;
    if (next.length > maxChars) break;
    text = next;
    names.push(item.name);
  }
  const useFirst = usable
    .filter((item) => names.includes(item.name) && needsAttention(item, today))
    .map((item) => item.name);
  return { text, useFirst, skippedPast: loadPantry().length - usable.length };
}
