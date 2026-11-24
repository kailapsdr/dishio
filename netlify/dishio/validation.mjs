// Checks what the browser sends before anything reaches Gemini.
// Same rules as dishio/validation.py.

import { DEFAULT_COUNTRY, findCountry } from "./countries.mjs";
import { DEFAULT_MODE, MODES } from "./prompts.mjs";

const MAX_BUDGET = 1_000_000_000;
const MAX_USE_FIRST = 10;
const MAX_USE_FIRST_CHARS = 40;
const MAX_FOOD_NAME_CHARS = 40;
const MAX_INGREDIENT_LINE_CHARS = 120;
const MAX_RECIPE_TITLE_CHARS = 100;
const MAX_FRIDGE_ITEMS = 30;

const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;
const WHITESPACE = /\s+/g;

export class ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Length in characters (not UTF-16 units), like Python's len(). */
const length = (s) => [...s].length;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").replace(WHITESPACE, " ").trim();
}

export function validateRecipeRequest(payload, maxChars = 300) {
  if (!isObject(payload)) throw new ValidationError("BAD_REQUEST", "Request body must be a JSON object.");

  const ingredients = cleanText(payload.ingredients);
  if (!ingredients) {
    throw new ValidationError("EMPTY_INGREDIENTS", "Please type at least one ingredient first.");
  }
  if (length(ingredients) > maxChars) {
    throw new ValidationError(
      "INGREDIENTS_TOO_LONG",
      `That list is too long. Please keep it under ${maxChars} characters.`,
      { max: maxChars },
    );
  }

  const country = findCountry(payload.country || DEFAULT_COUNTRY);
  if (!country) throw new ValidationError("INVALID_COUNTRY", "Please choose where you live from the list.");

  const mode = payload.mode || DEFAULT_MODE;
  if (typeof mode !== "string" || !Object.hasOwn(MODES, mode)) {
    throw new ValidationError("INVALID_MODE", "Please choose a situation from the list.");
  }

  // Budget is optional and can be combined with any situation.
  let budget = null;
  const raw = payload.budget;
  if (raw !== undefined && raw !== null && !(typeof raw === "string" && !raw.trim())) {
    if (typeof raw !== "number" && typeof raw !== "string") {
      throw new ValidationError("INVALID_BUDGET", "Please enter a budget as a number.");
    }
    budget = typeof raw === "number" ? raw : Number(raw.trim());
    if (Number.isNaN(budget)) throw new ValidationError("INVALID_BUDGET", "Please enter a budget as a number.");
    if (!Number.isFinite(budget) || budget <= 0 || budget > MAX_BUDGET) {
      throw new ValidationError("INVALID_BUDGET", "Please enter a budget greater than zero.");
    }
  }

  return { ingredients, country, mode, budget, useFirst: cleanUseFirst(payload.useFirst, ingredients) };
}

export function validateShelfLifeRequest(payload) {
  if (!isObject(payload)) throw new ValidationError("BAD_REQUEST", "Request body must be a JSON object.");
  const name = cleanText(payload.name);
  if (!name) throw new ValidationError("EMPTY_FOOD_NAME", "Type the food's name first.");
  if (length(name) > MAX_FOOD_NAME_CHARS) {
    throw new ValidationError("FOOD_NAME_TOO_LONG", `Please keep the name under ${MAX_FOOD_NAME_CHARS} characters.`);
  }
  return { name, country: findCountry(payload.country) };
}

export function validateSubstituteRequest(payload) {
  if (!isObject(payload)) throw new ValidationError("BAD_REQUEST", "Request body must be a JSON object.");
  const ingredient = cleanText(payload.ingredient);
  if (!ingredient || length(ingredient) > MAX_INGREDIENT_LINE_CHARS) {
    throw new ValidationError("INVALID_INGREDIENT", "Pick an ingredient from the recipe.");
  }
  const recipe = [...cleanText(payload.recipe)].slice(0, MAX_RECIPE_TITLE_CHARS).join("") || "a home-cooked dish";
  const fridge = [];
  const raw = Array.isArray(payload.fridge) ? payload.fridge.slice(0, MAX_FRIDGE_ITEMS) : [];
  for (const item of raw) {
    const name = cleanText(item);
    if (name && length(name) <= MAX_FOOD_NAME_CHARS && !fridge.includes(name)) fridge.push(name);
  }
  return { ingredient, recipe, fridge, country: findCountry(payload.country) };
}

/**
 * Names from My fridge that spoil soon. Only names that also appear in the
 * ingredients text are kept, so this field cannot be used to send anything
 * else to the AI. Bad input is simply ignored, because the list is a hint.
 */
export function cleanUseFirst(value, ingredients) {
  if (!Array.isArray(value)) return [];
  const lowered = ingredients.toLowerCase();
  const names = [];
  for (const raw of value.slice(0, MAX_USE_FIRST)) {
    const name = cleanText(raw);
    const low = name.toLowerCase();
    if (
      name &&
      length(name) <= MAX_USE_FIRST_CHARS &&
      lowered.includes(low) &&
      !names.some((n) => n.toLowerCase() === low)
    ) {
      names.push(name);
    }
  }
  return names;
}
