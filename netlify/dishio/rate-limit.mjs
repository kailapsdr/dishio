// A small "how many requests per visitor" limiter. Same rules as
// dishio/rate_limit.py.
//
// On Netlify the counts live in the memory of one running copy of the
// server. Netlify may start a fresh copy now and then, which resets the
// counts. That is good enough to stop someone pressing the button in a
// loop; the Gemini free tier has its own limits on top of this.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export class RateLimiter {
  constructor(perMinute, perDay, clock = () => Date.now()) {
    this.perMinute = perMinute;
    this.perDay = perDay;
    this.clock = clock;
    this.hits = new Map();
    this.lastCleanup = clock();
  }

  /** Record one request for `key` if allowed. Returns { allowed, retryAfter }. */
  hit(key) {
    const now = this.clock();
    this.cleanup(now);
    let hits = this.hits.get(key);
    if (!hits) {
      hits = [];
      this.hits.set(key, hits);
    }
    while (hits.length && now - hits[0] >= DAY) hits.shift();

    if (hits.length >= this.perDay) return { allowed: false, retryAfter: seconds(hits[0] + DAY - now) };

    const recent = hits.filter((t) => now - t < MINUTE);
    if (recent.length >= this.perMinute) {
      return { allowed: false, retryAfter: seconds(recent[0] + MINUTE - now) };
    }
    hits.push(now);
    return { allowed: true, retryAfter: 0 };
  }

  cleanup(now) {
    // Forget visitors who have been quiet for a day, at most once an hour.
    if (now - this.lastCleanup < 60 * MINUTE) return;
    this.lastCleanup = now;
    for (const [key, hits] of this.hits) {
      if (!hits.length || now - hits[hits.length - 1] >= DAY) this.hits.delete(key);
    }
  }
}

function seconds(ms) {
  return Math.max(1, Math.ceil(ms / 1000));
}
