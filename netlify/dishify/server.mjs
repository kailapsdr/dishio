// The /api/... part of Dishio for Netlify. Same answers as app.py.
//
// The Gemini key is read from Netlify's environment variables (set in the
// Netlify dashboard, never in the code). It is only used here, on the
// server, and never sent to the browser.

import { COUNTRIES, DEFAULT_COUNTRY, publicCountry } from "./countries.mjs";
import { GeminiError, GeminiService } from "./gemini.mjs";
import {
  DEFAULT_MODE,
  MODES,
  buildRecipePrompt,
  buildShelfLifePrompt,
  buildSubstitutePrompt,
} from "./prompts.mjs";
import { RateLimiter } from "./rate-limit.mjs";
import {
  ValidationError,
  validateRecipeRequest,
  validateShelfLifeRequest,
  validateSubstituteRequest,
} from "./validation.mjs";

const MAX_BODY_BYTES = 16 * 1024; // requests are tiny; refuse big ones
const PLACEHOLDER_KEYS = new Set(["", "paste-your-new-key-here", "your_api_key_here"]);

function number(env, name, fallback, minimum = 1) {
  const raw = String(env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : Math.max(minimum, n);
}

export function loadSettings(env) {
  const key = String(env.GEMINI_API_KEY ?? "").trim();
  return {
    geminiApiKey: key,
    geminiConfigured: !PLACEHOLDER_KEYS.has(key.toLowerCase()),
    geminiModel: String(env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash",
    // Netlify stops a function after 60 seconds, so wait a bit less.
    geminiTimeoutMs: Math.min(number(env, "GEMINI_TIMEOUT_SECONDS", 50), 55) * 1000,
    ratePerMinute: number(env, "RATE_LIMIT_PER_MINUTE", 5),
    ratePerDay: number(env, "RATE_LIMIT_PER_DAY", 50),
    shelfPerMinute: number(env, "SHELF_LIFE_PER_MINUTE", 20),
    shelfPerDay: number(env, "SHELF_LIFE_PER_DAY", 200),
    swapPerMinute: number(env, "SUBSTITUTE_PER_MINUTE", 10),
    swapPerDay: number(env, "SUBSTITUTE_PER_DAY", 100),
    maxIngredientsChars: number(env, "MAX_INGREDIENTS_CHARS", 300, 20),
  };
}

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extraHeaders } });
}

function errorResponse(code, message, status, details = {}, extraHeaders = {}) {
  return json({ error: { code, message, ...details } }, status, extraHeaders);
}

export function createServer(env, { fetchImpl = globalThis.fetch, clock } = {}) {
  const settings = loadSettings(env);
  const gemini = new GeminiService({
    apiKey: settings.geminiApiKey,
    model: settings.geminiModel,
    timeoutMs: settings.geminiTimeoutMs,
    fetchImpl,
  });
  const limiter = new RateLimiter(settings.ratePerMinute, settings.ratePerDay, clock);
  const shelfLimiter = new RateLimiter(settings.shelfPerMinute, settings.shelfPerDay, clock);
  const swapLimiter = new RateLimiter(settings.swapPerMinute, settings.swapPerDay, clock);
  const shelfCache = new Map();
  const swapCache = new Map();

  const notConfigured = () =>
    errorResponse(
      "NOT_CONFIGURED",
      "The Gemini API key is missing. Add GEMINI_API_KEY in the Netlify settings and deploy again.",
      503,
    );

  const rateLimited = (limit) =>
    errorResponse(
      "RATE_LIMITED",
      `Too many requests. Please wait ${limit.retryAfter} seconds and try again.`,
      429,
      { retryAfter: limit.retryAfter },
      { "Retry-After": String(limit.retryAfter) },
    );

  const fromError = (err) => {
    if (err instanceof ValidationError) return errorResponse(err.code, err.message, 400, err.details);
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("Dishio server error:", err && err.name, err && err.message);
    return errorResponse("SERVER_ERROR", "Something went wrong on the server.", 500);
  };

  async function readBody(req) {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { tooLarge: true };
    try {
      return { payload: JSON.parse(text) };
    } catch {
      return { payload: null };
    }
  }

  const routes = {
    "GET /api/health": async () => json({ status: "ok", gemini_configured: settings.geminiConfigured }),

    "GET /api/options": async () =>
      json({
        countries: [...COUNTRIES.values()].map(publicCountry),
        defaultCountry: DEFAULT_COUNTRY,
        modes: Object.keys(MODES),
        defaultMode: DEFAULT_MODE,
        maxIngredientsChars: settings.maxIngredientsChars,
      }),

    "POST /api/recipes": async (payload, who) => {
      const req = validateRecipeRequest(payload, settings.maxIngredientsChars);
      if (!settings.geminiConfigured) return notConfigured();
      const limit = limiter.hit(who);
      if (!limit.allowed) return rateLimited(limit);
      const prompt = buildRecipePrompt(req.ingredients, req.country, req.mode, req.budget, req.useFirst);
      const recipes = await gemini.generateRecipes(prompt);
      return json({ recipes, country: req.country.code, currency: req.country.currency, mode: req.mode });
    },

    // How many days a food keeps. Used by My fridge for names in any language.
    "POST /api/shelf-life": async (payload, who) => {
      const { name, country } = validateShelfLifeRequest(payload);
      const key = `${name.toLowerCase()}|${country ? country.code : ""}`;
      if (shelfCache.has(key)) {
        const days = shelfCache.get(key);
        return json({ name, days, isFood: days !== null });
      }
      if (!settings.geminiConfigured) return notConfigured();
      const limit = shelfLimiter.hit(who);
      if (!limit.allowed) return rateLimited(limit);
      const days = await gemini.estimateShelfLife(buildShelfLifePrompt(name, country));
      if (shelfCache.size > 2000) shelfCache.clear();
      shelfCache.set(key, days);
      return json({ name, days, isFood: days !== null });
    },

    // What to use instead of an ingredient the cook doesn't have.
    "POST /api/substitute": async (payload, who) => {
      const req = validateSubstituteRequest(payload);
      const key = [
        req.ingredient.toLowerCase(),
        req.recipe.toLowerCase(),
        req.fridge.map((f) => f.toLowerCase()).sort().join(","),
        req.country ? req.country.code : "",
      ].join("|");
      if (swapCache.has(key)) return json(swapCache.get(key));
      if (!settings.geminiConfigured) return notConfigured();
      const limit = swapLimiter.hit(who);
      if (!limit.allowed) return rateLimited(limit);
      const result = await gemini.suggestSubstitutes(
        buildSubstitutePrompt(req.ingredient, req.recipe, req.fridge, req.country),
      );
      if (swapCache.size > 1000) swapCache.clear();
      swapCache.set(key, result);
      return json(result);
    },
  };

  const knownPaths = new Set(Object.keys(routes).map((r) => r.split(" ")[1]));

  /** Netlify calls this for every /api/... request. */
  return async function handle(req, context = {}) {
    const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    const route = routes[`${req.method} ${path}`];
    if (!route) {
      if (knownPaths.has(path)) return errorResponse("METHOD_NOT_ALLOWED", "This method is not allowed here.", 405);
      return errorResponse("NOT_FOUND", "This API address does not exist.", 404);
    }

    // Who is asking, for the per-visitor limits.
    const who =
      String(context.ip || req.headers.get("x-nf-client-connection-ip") || "").slice(0, 64) || "unknown";

    try {
      if (req.method !== "POST") return await route(null, who);
      const { payload, tooLarge } = await readBody(req);
      if (tooLarge) return errorResponse("REQUEST_TOO_LARGE", "That request is too large.", 413);
      return await route(payload, who);
    } catch (err) {
      return fromError(err);
    }
  };
}
