// Small wrapper around the browser's localStorage.
// Remembers the user's country, budget and what's in My fridge, each under
// its own key, e.g. storage.get("pantry", []). New features can add keys.

const PREFIX = "dishio:";
const OLD_PREFIX = "dishify:";

// Move data saved under the old prefix to the new one, so favorites and
// fridge items are kept. A key already saved under the new prefix wins.
try {
  const oldKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(OLD_PREFIX)) oldKeys.push(k);
  }
  for (const oldKey of oldKeys) {
    const newKey = PREFIX + oldKey.slice(OLD_PREFIX.length);
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
    localStorage.removeItem(oldKey);
  }
} catch {
  /* storage blocked (e.g. private mode): nothing to move */
}

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
