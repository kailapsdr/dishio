// Small wrapper around the browser's localStorage.
// Remembers the user's country, budget and what's in My fridge, each under
// its own key, e.g. storage.get("pantry", []). New features can add keys.

const PREFIX = "dishify:";

// Clean up data from features that were removed.
try {
  localStorage.removeItem(PREFIX + "pantryLog");
} catch {
  /* ignore */
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked (e.g. private mode): the app still works */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};
