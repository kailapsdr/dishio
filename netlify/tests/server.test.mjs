// Automatic tests for the Netlify server. Run with:  node --test netlify/tests/server.test.mjs
// No packages needed: Node's own test runner and a fake Gemini.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createServer } from "../dishio/server.mjs";

function geminiReply(text) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

const RECIPES = JSON.stringify({
  recipes: [{ title: "Nasi goreng", instructions: ["Step 1: Fry the rice."], ingredients: ["rice"] }],
});

function server(env = {}, fetchImpl = async () => geminiReply(RECIPES), clock) {
  return createServer({ GEMINI_API_KEY: "test-key", ...env }, { fetchImpl, clock });
}

function post(handle, path, body, ip = "1.1.1.1") {
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  return handle(new Request(`https://dishio.test${path}`, init), { ip });
}

test("recipes come back cleaned", async () => {
  let sent;
  const handle = server({}, async (url, init) => {
    sent = { url, init };
    return geminiReply(RECIPES);
  });
  const res = await post(handle, "/api/recipes", { ingredients: "rice, egg", country: "ID" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.currency, "IDR");
  assert.deepEqual(data.recipes[0].instructions, ["Fry the rice."]);
  // The key travels in a header, never in the address.
  assert.equal(sent.init.headers["x-goog-api-key"], "test-key");
  assert.ok(!sent.url.includes("test-key"));
});

test("the key never appears in any answer", async () => {
  const handle = server();
  for (const path of ["/api/options", "/api/health"]) {
    const res = await handle(new Request(`https://dishio.test${path}`), {});
    assert.ok(!(await res.text()).includes("test-key"));
  }
});

test("missing key gives NOT_CONFIGURED", async () => {
  const handle = server({ GEMINI_API_KEY: "" });
  const res = await post(handle, "/api/recipes", { ingredients: "rice" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "NOT_CONFIGURED");
});

test("bad input is refused before Gemini is called", async () => {
  let called = false;
  const handle = server({}, async () => {
    called = true;
    return geminiReply(RECIPES);
  });
  const res = await post(handle, "/api/recipes", { ingredients: "   " });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "EMPTY_INGREDIENTS");
  assert.equal(called, false);
});

test("per-visitor limit", async () => {
  const handle = server({ RATE_LIMIT_PER_MINUTE: "2" });
  assert.equal((await post(handle, "/api/recipes", { ingredients: "rice" })).status, 200);
  assert.equal((await post(handle, "/api/recipes", { ingredients: "rice" })).status, 200);
  const third = await post(handle, "/api/recipes", { ingredients: "rice" });
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers.get("Retry-After")) > 0);
  // Someone else is not affected.
  assert.equal((await post(handle, "/api/recipes", { ingredients: "rice" }, "2.2.2.2")).status, 200);
});

test("Gemini errors become clear codes", async () => {
  const cases = [
    [400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', "AI_KEY_INVALID"],
    [429, "{}", "AI_BUSY"],
    [404, "{}", "AI_MODEL_NOT_FOUND"],
    [500, "{}", "AI_UNAVAILABLE"],
  ];
  for (const [status, body, code] of cases) {
    const handle = server({}, async () => new Response(body, { status }));
    const res = await post(handle, "/api/recipes", { ingredients: "rice" });
    assert.equal((await res.json()).error.code, code);
  }
  const offline = server({}, async () => {
    throw new TypeError("fetch failed");
  });
  const res = await post(offline, "/api/recipes", { ingredients: "rice" });
  assert.equal((await res.json()).error.code, "AI_UNAVAILABLE");
});

test("shelf life is asked once per food", async () => {
  let calls = 0;
  const handle = server({}, async () => {
    calls += 1;
    return geminiReply('{"isFood": true, "days": 3}');
  });
  for (let i = 0; i < 3; i += 1) {
    const res = await post(handle, "/api/shelf-life", { name: "Tempe", country: "ID" });
    assert.deepEqual(await res.json(), { name: "Tempe", days: 3, isFood: true });
  }
  assert.equal(calls, 1);
});

test("substitutes keep at most 3", async () => {
  const many = JSON.stringify({ suggestions: ["a", "b", "c", "d"].map((name) => ({ name, how: "use it" })) });
  const handle = server({}, async () => geminiReply(many));
  const res = await post(handle, "/api/substitute", { ingredient: "1 egg", recipe: "Omelette", fridge: ["tofu"] });
  assert.equal((await res.json()).suggestions.length, 3);
});

test("big requests and unknown addresses", async () => {
  const handle = server();
  const big = await post(handle, "/api/recipes", { ingredients: "x".repeat(20_000) });
  assert.equal(big.status, 413);
  const missing = await handle(new Request("https://dishio.test/api/nothing"), {});
  assert.equal(missing.status, 404);
  const wrong = await handle(new Request("https://dishio.test/api/recipes"), {});
  assert.equal(wrong.status, 405);
});
