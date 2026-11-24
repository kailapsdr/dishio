// Talks to the Dishify server. The Gemini key is NOT here: only the server
// has it. The browser just sends ingredients and gets recipes back.

export class ApiError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...options,
    });
  } catch {
    throw new ApiError(navigator.onLine === false ? "OFFLINE" : "NETWORK");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* not JSON */
  }

  if (!response.ok) {
    const err = (data && data.error) || {};
    const { code, message, ...details } = err;
    throw new ApiError(code || (response.status === 503 && !data ? "OFFLINE" : "UNKNOWN"), message, details);
  }
  return data;
}

/** Countries, situation ids and limits, decided by the server. */
export function getOptions() {
  return request("/api/options");
}

/** How many days a food keeps (any language). Returns { days, isFood }. */
export function estimateShelfLife(name, country) {
  return request("/api/shelf-life", {
    method: "POST",
    body: JSON.stringify({ name, country }),
  });
}

/** What to use instead of an ingredient. Returns { suggestions: [...], tip }. */
export function askSubstitute({ ingredient, recipe, fridge, country }) {
  return request("/api/substitute", {
    method: "POST",
    body: JSON.stringify({ ingredient, recipe, fridge, country }),
  });
}

/** Ask for 5 recipes. Returns { recipes: [...], currency, country, mode }. */
export function generateRecipes({ ingredients, country, mode, budget, useFirst }) {
  return request("/api/recipes", {
    method: "POST",
    body: JSON.stringify({ ingredients, country, mode, budget, useFirst }),
  });
}
