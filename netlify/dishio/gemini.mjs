// Talks to the Gemini API and turns its answer into clean data.
// Same behaviour as dishio/gemini_service.py. The API key goes in a
// request header (never in the URL) and never leaves the server.

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";
const MAX_RECIPES = 5;
const MAX_SHELF_LIFE_DAYS = 365;
const MAX_SUBSTITUTES = 3;

const STEP_PREFIX = /^\s*(step\s*)?\d+\s*[:.)\-–]\s*/i;

export class GeminiError extends Error {
  constructor(code, message, status = 502, upstreamStatus = null) {
    super(message);
    this.code = code;
    this.status = status;
    // HTTP status Gemini itself answered with (e.g. 503), to help find problems.
    this.upstreamStatus = upstreamStatus;
  }
}

export class GeminiService {
  constructor({ apiKey, model, timeoutMs = 50_000, fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async generateRecipes(prompt) {
    return parseRecipes(await this.call(prompt));
  }

  /** Days a food keeps, or null if the AI says it is not a food. */
  async estimateShelfLife(prompt) {
    return parseShelfLife(await this.call(prompt, 0.2));
  }

  /** Up to 3 replacements for an ingredient the cook doesn't have. */
  async suggestSubstitutes(prompt) {
    return parseSubstitutes(await this.call(prompt, 0.4));
  }

  async call(prompt, temperature = 0.85) {
    const url = API_URL.replace("{model}", encodeURIComponent(this.model));
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    });

    let response;
    try {
      response = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new GeminiError(
        "AI_UNAVAILABLE",
        "Could not reach the AI service. Please try again in a moment.",
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      throw errorFromHttp(response.status, detail);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.");
    }
    return extractText(data);
  }
}

function errorFromHttp(status, detail) {
  // Gemini's own error text goes to the Netlify function log (never the key).
  console.error(`Gemini API error ${status}: ${String(detail).slice(0, 400)}`);
  const err = errorFromStatus(status, detail);
  err.upstreamStatus = status;
  return err;
}

function errorFromStatus(status, detail) {
  const lowered = String(detail).toLowerCase();
  if (status === 401 || status === 403 || lowered.includes("api_key_invalid") || lowered.includes("api key not valid")) {
    return new GeminiError("AI_KEY_INVALID", "The Gemini API key was rejected. Check GEMINI_API_KEY.", 503);
  }
  if (status === 429) {
    return new GeminiError("AI_BUSY", "The AI has reached its usage limit for now. Please try again later.", 503);
  }
  if (status === 404) {
    return new GeminiError("AI_MODEL_NOT_FOUND", "The Gemini model name was not found. Check GEMINI_MODEL.", 503);
  }
  return new GeminiError("AI_UNAVAILABLE", "The AI service is having trouble right now. Please try again in a moment.");
}

function extractText(data) {
  let text;
  try {
    const candidates = (data && data.candidates) || [];
    if (!candidates.length) {
      throw new GeminiError("AI_BAD_RESPONSE", "The AI did not return any recipes. Try different ingredients.");
    }
    const parts = (candidates[0].content && candidates[0].content.parts) || [];
    text = parts
      .filter((p) => p && typeof p === "object" && !p.thought)
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("");
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.");
  }
  if (!text.trim()) throw new GeminiError("AI_BAD_RESPONSE", "The AI returned an empty response. Please try again.");
  return text;
}

// -- Turning the model's text into data ---------------------------------------

/** Pull the JSON object out of the model text, tolerating ``` fences. */
export function extractJson(text) {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/```[a-zA-Z]*/g, "").replaceAll("```", "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start !== -1 && end > start ? t.slice(start, end + 1) : t;
}

function readJson(text, message = "The AI response could not be read.") {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    throw new GeminiError("AI_BAD_RESPONSE", message);
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export function normalizeRecipe(raw) {
  return {
    title: asText(raw.title, "Untitled Dish"),
    description: asText(raw.description),
    cookTime: asText(raw.cookTime, "—"),
    difficulty: asText(raw.difficulty, "Easy"),
    estimatedCost: asText(raw.estimatedCost),
    imageKeyword: asText(raw.imageKeyword, "food"),
    ingredients: stringList(raw.ingredients),
    instructions: stringList(raw.instructions).map((step) => step.replace(STEP_PREFIX, "") || step),
  };
}

export function parseRecipes(text) {
  const decoded = readJson(text, "The AI response could not be read. Please try again in a moment.");
  const items = isObject(decoded) ? decoded.recipes : null;
  if (!Array.isArray(items)) {
    throw new GeminiError("NO_RECIPES", "No recipes were found in the response. Please try again.");
  }
  const recipes = items
    .filter(isObject)
    .map(normalizeRecipe)
    .filter((r) => r.title && r.instructions.length)
    .slice(0, MAX_RECIPES);
  if (!recipes.length) {
    throw new GeminiError(
      "NO_RECIPES",
      "No recipes could be created from those ingredients. Try adding one or two more.",
    );
  }
  return recipes;
}

export function parseShelfLife(text) {
  const decoded = readJson(text);
  if (!isObject(decoded)) throw new GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.");
  if (decoded.isFood === false) return null;
  const days = decoded.days;
  if (typeof days !== "number" || !Number.isFinite(days)) {
    throw new GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.");
  }
  return Math.max(0, Math.min(MAX_SHELF_LIFE_DAYS, Math.round(days)));
}

export function parseSubstitutes(text) {
  const decoded = readJson(text);
  if (!isObject(decoded)) throw new GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.");
  const suggestions = [];
  for (const item of Array.isArray(decoded.suggestions) ? decoded.suggestions : []) {
    if (!isObject(item)) continue;
    const name = asText(item.name);
    if (!name) continue;
    suggestions.push({ name, how: asText(item.how), fromFridge: item.fromFridge === true });
  }
  return { suggestions: suggestions.slice(0, MAX_SUBSTITUTES), tip: asText(decoded.tip) };
}
