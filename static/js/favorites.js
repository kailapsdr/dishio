// Saved recipes (the heart on each recipe). Kept in this browser only.
//   favorites -> [{ key, savedOn: "2026-11-24", recipe: {...} }], newest first

import { storage } from "./storage.js";

const KEY = "favorites";
const LIMIT = 100;

/** A stable id for a recipe, so the same dish is not saved twice. */
export function recipeKey(recipe) {
  const text = `${recipe.title}|${(recipe.ingredients || []).join(",")}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `r${(hash >>> 0).toString(36)}`;
}

export function loadFavorites() {
  const list = storage.get(KEY, []);
  return Array.isArray(list) ? list.filter((f) => f && f.key && f.recipe && f.recipe.title) : [];
}

export function isFavorite(recipe) {
  const key = recipeKey(recipe);
  return loadFavorites().some((f) => f.key === key);
}

/** Save or un-save. Returns true when the recipe is now saved. */
export function toggleFavorite(recipe, today) {
  const key = recipeKey(recipe);
  const list = loadFavorites();
  if (list.some((f) => f.key === key)) {
    storage.set(KEY, list.filter((f) => f.key !== key));
    return false;
  }
  storage.set(KEY, [{ key, savedOn: today, recipe }, ...list].slice(0, LIMIT));
  return true;
}
