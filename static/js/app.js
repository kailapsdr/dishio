// Dishio — main screen logic.
// One screen, four states: idle → loading → success | error.

import { ApiError, askSubstitute, generateRecipes, getOptions } from "./api.js";
import { isFavorite, loadFavorites, toggleFavorite } from "./favorites.js";
import { initFridge } from "./fridge.js";
import { initSplitter } from "./layout.js";
import { freshness, loadPantry, todayISO } from "./pantry.js";
import { ICONS } from "./icons.js";
import { StepReader, speechSupported } from "./speech.js";
import { storage } from "./storage.js";
import { TEXT, t } from "./texts.js";

const LOADING_INTERVAL_MS = 1500;

// Icon shown on each situation chip.
const MODE_ICONS = { none: "none", quick_15: "clock", rice_cooker: "riceCooker", no_stove: "noStove" };

// Used only if the server can't be reached when the page opens.
const FALLBACK_OPTIONS = {
  countries: [{ code: "ID", name: "Indonesia", currency: "IDR", locale: "id-ID", defaultBudget: 10000, speechLangs: ["id-ID"] }],
  defaultCountry: "ID",
  modes: Object.keys(TEXT.modes),
  defaultMode: "none",
  maxIngredientsChars: 300,
};

// ---------------------------------------------------------------------------
//  State
// ---------------------------------------------------------------------------
const state = {
  view: "idle", // "idle" | "loading" | "success" | "error"
  recipes: [],
  currency: null,
  errorMessage: "",
  options: FALLBACK_OPTIONS,
  country: storage.get("country", null),
  mode: "none",
  useBudget: storage.get("useBudget", false), // "Keep it within my budget" ticked?
  useFirst: [], // food from My fridge that spoils soon (sent to Gemini as a hint)
  budgets: storage.get("budgets", {}), // per country, e.g. { ID: 10000 }
};

const el = {
  form: document.getElementById("recipe-form"),
  ingredients: document.getElementById("ingredients"),
  charCount: document.getElementById("char-count"),
  country: document.getElementById("country"),
  modeChips: document.getElementById("mode-chips"),
  countryHint: document.getElementById("country-hint"),
  useBudget: document.getElementById("use-budget"),
  budgetField: document.getElementById("budget-field"),
  budgetHint: document.getElementById("budget-hint"),
  budget: document.getElementById("budget"),
  budgetCurrency: document.getElementById("budget-currency"),
  generate: document.getElementById("generate"),
  view: document.getElementById("view"),
};

let loadingTimer = null;
let activeReader = null; // { reader, card } for the recipe being read aloud

// ---------------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "icon") node.innerHTML = ICONS[value]; // our own static SVG only
    else if (key === "style") Object.entries(value).forEach(([k, v]) => node.style.setProperty(k, v));
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** The country the user picked, or null when nothing is picked yet. */
function currentCountry() {
  return state.options.countries.find((c) => c.code === state.country) || null;
}

/** The max budget the user typed for the current country, or null if none. */
function currentBudget() {
  const country = currentCountry();
  const saved = country ? Number(state.budgets[country.code]) : 0;
  return saved > 0 ? saved : null;
}

// Currencies that are written without cents (Rp25.000, ¥900, ₩9,000, 60.000 ₫).
const WHOLE_NUMBER_CURRENCIES = new Set(["IDR", "JPY", "KRW", "VND"]);

/**
 * Read what the user typed, the way people write numbers in their country.
 * Indonesia: "25.000" -> 25000.  US: "7.50" -> 7.5, "1,200" -> 1200.
 * Germany: "7,50" -> 7.5.  Returns null when empty and NaN when not a valid amount.
 */
export function parseBudget(text, country) {
  let value = String(text ?? "").replace(/[^\d.,]/g, "");
  if (!value) return null;
  if (WHOLE_NUMBER_CURRENCIES.has(country.currency)) {
    const whole = Number(value.replace(/[.,]/g, ""));
    return whole > 0 ? whole : NaN;
  }
  const decimalSep = (1.5).toLocaleString(country.locale).includes(",") ? "," : ".";
  const groupSep = decimalSep === "," ? "." : ",";
  value = value.split(groupSep).join("").replace(decimalSep, ".");
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : NaN;
}

/** 25000 in Indonesia -> "25.000" (no currency sign), for the input box. */
function formatNumber(amount, country) {
  try {
    return new Intl.NumberFormat(country.locale, {
      maximumFractionDigits: WHOLE_NUMBER_CURRENCIES.has(country.currency) ? 0 : 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

function currencyName(country) {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(country.currency);
  } catch {
    return country.currency;
  }
}

/** 10000 in Indonesia -> "Rp10.000"; 5 in the US -> "$5". */
export function formatMoney(amount, country) {
  try {
    const whole = Number.isInteger(amount);
    const text = new Intl.NumberFormat(country.locale, {
      style: "currency",
      currency: country.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
    return text.replace(/^Rp[\s ]/, "Rp");
  } catch {
    return `${amount} ${country.currency}`;
  }
}

function friendlyError(err) {
  const code = err instanceof ApiError ? err.code : "UNKNOWN";
  const details = err instanceof ApiError ? err.details : {};
  if (code === "BUDGET_REQUIRED" || code === "INVALID_BUDGET") showBudgetHint(code);
  if (code === "INVALID_COUNTRY") showCountryHint("COUNTRY_REQUIRED");
  const vars = {
    seconds: details.retryAfter ?? "a few",
    max: details.max ?? state.options.maxIngredientsChars,
  };
  if (code in TEXT.errors) return t(`errors.${code}`, vars);
  return (err && err.message) || t("errors.UNKNOWN");
}

// ---------------------------------------------------------------------------
//  Static text and controls
// ---------------------------------------------------------------------------
function applyStaticTexts() {
  document.querySelectorAll("[data-text]").forEach((node) => {
    node.textContent = t(node.dataset.text);
  });
  document.querySelectorAll("[data-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.placeholder);
  });
  document.querySelectorAll("[data-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.label));
  });
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = ICONS[node.dataset.icon] || "";
  });
}

function renderCountries() {
  const picked = currentCountry();
  el.country.replaceChildren(
    h("option", { value: "", disabled: true, selected: !picked }, t("selectCountry")),
    ...state.options.countries.map((c) => h("option", { value: c.code, selected: picked && c.code === picked.code }, c.name))
  );
  el.country.classList.toggle("is-empty", !picked);
  sizeCountrySelect();
}

/** Make the dotted line exactly as long as the chosen country's name. */
function sizeCountrySelect() {
  const option = el.country.options[el.country.selectedIndex];
  if (!option) return;
  const style = getComputedStyle(el.country);
  const ctx = (sizeCountrySelect.canvas ||= document.createElement("canvas")).getContext("2d");
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = ctx.measureText(option.textContent).width;
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  el.country.style.width = `${Math.ceil(text + padding + 2)}px`;
}

/** Example text in the empty boxes follows the chosen country's language. */
function updateExamples() {
  const local = (state.country && TEXT.localExamples[state.country]) || {};
  el.ingredients.placeholder = local.ingredients || t("inputPlaceholder");
  document.getElementById("item-name").placeholder = local.fridgeItem || t("itemPlaceholder");
}

function showCountryHint(errorCode = null) {
  el.countryHint.textContent = errorCode ? t(`errors.${errorCode}`) : t("locationHint");
  el.countryHint.classList.toggle("invalid", Boolean(errorCode));
  el.country.setAttribute("aria-invalid", errorCode ? "true" : "false");
}

function renderModeChips() {
  el.modeChips.replaceChildren(
    ...state.options.modes.map((mode) => {
      const label = t(`modes.${mode}`);
      return h(
        "label",
        { class: "chip mode-chip" },
        h("input", {
          type: "radio",
          name: "mode",
          value: mode,
          checked: mode === state.mode,
          onchange: () => setMode(mode),
        }),
        h("span", { class: "tick", "aria-hidden": "true" }),
        MODE_ICONS[mode] ? h("span", { class: "chip-icon", icon: MODE_ICONS[mode] }) : null,
        h("span", {}, label)
      );
    })
  );
}

/** "Keep it within my budget": the amount box shows only when ticked. */
function renderBudgetField() {
  const country = currentCountry();
  el.useBudget.checked = state.useBudget;
  el.budgetField.hidden = !state.useBudget || !country;
  el.budgetHint.hidden = !state.useBudget;
  if (country) {
    el.budgetCurrency.textContent = country.currency;
    el.budget.inputMode = WHOLE_NUMBER_CURRENCIES.has(country.currency) ? "numeric" : "decimal";
    el.budget.placeholder = t("budgetPlaceholder", { example: formatNumber(country.defaultBudget, country) });
    if (document.activeElement !== el.budget) {
      const budget = currentBudget();
      el.budget.value = budget ? formatNumber(budget, country) : "";
    }
  }
  showBudgetHint();
}

/** Text under the budget box: a tip, the chosen maximum, or a problem. */
function showBudgetHint(errorCode = null) {
  const country = currentCountry();
  const budget = currentBudget();
  const hint = el.budgetHint;
  let text;
  if (errorCode) text = t(`errors.${errorCode}`);
  else if (!country) text = t("budgetNeedsCountry");
  else if (budget) text = t("budgetHintValue", { amount: formatMoney(budget, country) });
  else text = t("budgetHintEmpty", { currencyName: currencyName(country) });
  hint.textContent = text;
  hint.classList.toggle("invalid", Boolean(errorCode));
  el.budget.parentElement.classList.toggle("invalid", Boolean(errorCode));
  el.budget.setAttribute("aria-invalid", errorCode ? "true" : "false");
}

function setMode(mode) {
  state.mode = mode;
  renderModeChips();
}

function updateCharCount() {
  const max = state.options.maxIngredientsChars;
  const count = el.ingredients.value.length;
  el.charCount.textContent = t("charCount", { count, max });
  el.charCount.classList.toggle("near-limit", count > max * 0.9);
}

function setBusy(busy) {
  el.generate.disabled = busy;
  el.generate.querySelector(".btn-label").textContent = busy ? t("generatingButton") : t("generateButton");
  el.generate.querySelector(".btn-icon").innerHTML = busy ? '<span class="spinner"></span>' : "";
}

// ---------------------------------------------------------------------------
//  Views
// ---------------------------------------------------------------------------
function showView(view) {
  state.view = view;
  clearInterval(loadingTimer);
  loadingTimer = null;
  stopReading();

  let content;
  if (view === "loading") content = loadingView();
  else if (view === "error") content = errorView();
  else if (view === "success") content = resultsView();
  else if (view === "saved") content = savedView();
  else content = idleView();

  const wrapper = h("div", { class: `view-inner view-${view}` }, content);
  el.view.replaceChildren(wrapper);
  setBusy(view === "loading");
}

function updateSavedCount() {
  const count = loadFavorites().length;
  const badge = document.getElementById("saved-count");
  badge.textContent = String(count);
  badge.hidden = !count;
}

function openSaved() {
  showView("saved");
  if (el.view.getBoundingClientRect().top > window.innerHeight * 0.6) {
    el.view.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function idleView() {
  return h(
    "div",
    { class: "empty" },
    h(
      "div",
      { class: "place-setting", "aria-hidden": "true" },
      h("span", { class: "cutlery", icon: "fork" }),
      h("div", { class: "empty-plate" }, h("div", { class: "empty-plate-well" })),
      h("span", { class: "cutlery", icon: "spoon" })
    ),
    h("h2", { class: "empty-title" }, t("emptyTitle")),
    h("p", { class: "empty-body" }, t("emptyBody"))
  );
}

function loadingView() {
  const messages = TEXT.loadingMessages;
  let index = 0;
  const message = h("p", { class: "loading-message" }, messages[0]);
  loadingTimer = setInterval(() => {
    index = (index + 1) % messages.length;
    message.classList.remove("swap");
    void message.offsetWidth; // restart the fade animation
    message.textContent = messages[index];
    message.classList.add("swap");
  }, LOADING_INTERVAL_MS);

  return h(
    "div",
    { class: "loading", role: "status" },
    h("div", { class: "pot", icon: "pot" }),
    message,
    h("p", { class: "loading-sub" }, t("loadingSubtitle"))
  );
}

function errorView() {
  return h(
    "div",
    { class: "notice", role: "alert" },
    h("h2", { class: "notice-title" }, h("span", { class: "notice-icon", icon: "error" }), t("errorTitle")),
    h("p", { class: "notice-message" }, state.errorMessage),
    h("button", { type: "button", class: "btn-line", onclick: () => submit() }, t("tryAgain"))
  );
}

function resultsView() {
  const count = state.recipes.length;
  return h(
    "div",
    { class: "results" },
    h(
      "h2",
      { class: "results-title", id: "results-title", tabindex: "-1" },
      count > 1 ? t("resultsTitleMany", { count }) : t("resultsTitleOne")
    ),
    state.recipes.map((r, i) => recipePlate(r, i, { open: i === 0 })),
    h("p", { class: "powered-by" }, t("poweredBy"))
  );
}

function savedView() {
  const saved = loadFavorites();
  return h(
    "div",
    { class: "results saved" },
    h(
      "div",
      { class: "saved-head" },
      h("h2", { class: "results-title", id: "results-title", tabindex: "-1" }, t("savedTitle")),
      state.recipes.length
        ? h("button", { type: "button", class: "btn-line btn-back", onclick: () => showView("success") }, t("backToResults"))
        : null
    ),
    saved.length
      ? saved.map((f, i) => recipePlate(f.recipe, i, { open: false, inSaved: true }))
      : h("p", { class: "saved-empty" }, t("savedEmpty"))
  );
}

function metaItem(icon, label, title) {
  return h("li", { title }, h("span", { class: "meta-icon", icon }), h("span", {}, label));
}

/** The heart next to each recipe title. */
function heartButton(recipe, { inSaved }) {
  const button = h("button", { type: "button", class: "heart", icon: "heart" });
  const show = (saved) => {
    button.setAttribute("aria-pressed", saved ? "true" : "false");
    button.setAttribute("aria-label", saved ? t("unsaveRecipe") : t("saveRecipe"));
    button.title = saved ? t("unsaveRecipe") : t("saveRecipe");
  };
  show(isFavorite(recipe));
  button.addEventListener("click", () => {
    const saved = toggleFavorite(recipe, todayISO());
    show(saved);
    button.classList.remove("pop");
    void button.offsetWidth; // restart the little pop
    if (saved) button.classList.add("pop");
    updateSavedCount();
    if (inSaved && !saved) showView("saved");
  });
  return button;
}

function recipePlate(recipe, index, { open = true, inSaved = false } = {}) {
  const steps = recipe.instructions.map((text, i) =>
    h(
      "li",
      { class: "step", "data-step": i },
      h("span", { class: "step-number", "aria-hidden": "true" }, String(i + 1)),
      h("span", { class: "step-text" }, text)
    )
  );

  const bodyId = `plate-body-${inSaved ? "s" : "r"}${index}`;
  const body = h(
    "div",
    { class: "plate-body", id: bodyId },
    h(
      "section",
      { class: "plate-section" },
      h("h4", { class: "section-label" }, t("ingredientsHeading")),
      h(
        "ul",
        { class: "ingredients" },
        recipe.ingredients.map((item) => ingredientRow(item, recipe))
      )
    ),
    h(
      "section",
      { class: "plate-section" },
      h(
        "div",
        { class: "steps-header" },
        h("h4", { class: "section-label" }, t("instructionsHeading")),
        speechSupported ? readAloudControls(recipe) : null
      ),
      h("ol", { class: "steps" }, steps)
    )
  );
  body.hidden = !open;

  const toggle = h("button", {
    type: "button",
    class: "plate-toggle",
    "aria-expanded": open ? "true" : "false",
    "aria-controls": bodyId,
  });
  const showToggle = (isOpen) => {
    toggle.textContent = isOpen ? t("hideRecipe") : t("showRecipe");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };
  showToggle(open);
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    showToggle(!body.hidden);
    if (body.hidden) stopReading();
  });

  return h(
    "article",
    { class: `plate${open ? "" : " is-closed"}`, style: { "--delay": `${index * 90}ms` } },
    h(
      "div",
      { class: "plate-inner" },
      h(
        "header",
        { class: "plate-head" },
        h("div", { class: "title-row" }, h("h3", { class: "recipe-title" }, recipe.title), heartButton(recipe, { inSaved })),
        recipe.description && h("p", { class: "recipe-desc" }, recipe.description),
        h(
          "div",
          { class: "meta-row" },
          h("ul", { class: "meta" }, metaItem("clock", recipe.cookTime), metaItem("dining", recipe.difficulty)),
          recipe.estimatedCost &&
            h(
              "p",
              { class: "price-tag", title: t("costNote") },
              h("span", { class: "price-label" }, t("costNote")),
              h("span", { class: "price-value" }, t("costPrefix") + recipe.estimatedCost)
            )
        ),
        toggle
      ),
      body
    )
  );
}

// ---------------------------------------------------------------------------
//  "swap": what to use instead of an ingredient you don't have
// ---------------------------------------------------------------------------
function fridgeNames() {
  return loadPantry()
    .filter((item) => freshness(item).level !== "past")
    .map((item) => item.name);
}

function ingredientRow(item, recipe) {
  const note = h("div", { class: "swap-note", hidden: true, "aria-live": "polite" });
  let asked = false;

  const swapBtn = h(
    "button",
    {
      type: "button",
      class: "swap-btn",
      "aria-label": t("swapAria", { item }),
      "aria-expanded": "false",
    },
    h("span", { icon: "swap" }),
    h("span", {}, t("swap"))
  );

  swapBtn.addEventListener("click", async () => {
    if (asked && !note.hidden) {
      note.hidden = true;
      swapBtn.setAttribute("aria-expanded", "false");
      return;
    }
    note.hidden = false;
    swapBtn.setAttribute("aria-expanded", "true");
    if (asked) return;
    asked = true;
    note.replaceChildren(h("p", { class: "swap-loading" }, t("swapLoading")));
    try {
      const result = await askSubstitute({
        ingredient: item,
        recipe: recipe.title,
        fridge: fridgeNames(),
        country: state.country || undefined,
      });
      note.replaceChildren(...swapResult(result));
    } catch (err) {
      asked = false; // allow another try
      note.replaceChildren(h("p", { class: "swap-error" }, friendlyError(err)));
    }
  });

  return h(
    "li",
    {},
    h(
      "div",
      { class: "ingredient-row" },
      h("label", { class: "ingredient" }, h("input", { type: "checkbox" }), h("span", {}, item)),
      swapBtn
    ),
    note
  );
}

function swapResult({ suggestions = [], tip = "" }) {
  const parts = [];
  if (suggestions.length) {
    parts.push(h("p", { class: "swap-lead" }, t("swapLead")));
    parts.push(
      h(
        "ul",
        { class: "swap-list" },
        suggestions.map((s) =>
          h(
            "li",
            {},
            h(
              "span",
              { class: "swap-name" },
              s.name,
              s.fromFridge ? h("span", { class: "swap-fridge" }, h("span", { icon: "fridge" }), t("swapFromFridge")) : null
            ),
            s.how ? h("span", { class: "swap-how" }, s.how) : null
          )
        )
      )
    );
  } else {
    parts.push(h("p", { class: "swap-lead" }, t("swapNone")));
  }
  if (tip) parts.push(h("p", { class: "swap-tip" }, tip));
  return parts;
}

// ---------------------------------------------------------------------------
//  Read the steps aloud
// ---------------------------------------------------------------------------
function readAloudControls(recipe) {
  const box = h("div", { class: "speech-controls", "data-state": "idle" });

  const readBtn = h(
    "button",
    { type: "button", class: "btn-read", onclick: () => startReading(recipe, box) },
    h("span", { icon: "speaker" }),
    h("span", {}, t("readSteps"))
  );
  const pauseBtn = h(
    "button",
    {
      type: "button",
      class: "btn-read icon-btn pause-btn",
      onclick: () => {
        if (!activeReader) return;
        const { reader } = activeReader;
        reader.state === "paused" ? reader.resume() : reader.pause();
      },
    },
    h("span", { class: "pause-icon", icon: "pause" }),
    h("span", { class: "pause-label" }, t("pause"))
  );
  const stopBtn = h(
    "button",
    { type: "button", class: "btn-read icon-btn", onclick: () => stopReading() },
    h("span", { icon: "stop" }),
    h("span", {}, t("stop"))
  );

  box.append(readBtn, pauseBtn, stopBtn);
  return box;
}

function setControlsState(box, readerState) {
  box.dataset.state = readerState;
  const pauseBtn = box.querySelector(".pause-btn");
  if (!pauseBtn) return;
  const paused = readerState === "paused";
  pauseBtn.querySelector(".pause-icon").innerHTML = paused ? ICONS.play : ICONS.pause;
  pauseBtn.querySelector(".pause-label").textContent = paused ? t("resume") : t("pause");
}

function startReading(recipe, box) {
  stopReading();
  const card = box.closest(".plate");
  const reader = new StepReader({
    langs: (currentCountry() && currentCountry().speechLangs) || [],
    fallbackLang: TEXT.speechLang,
    onStateChange: (s) => {
      setControlsState(box, s);
      if (s === "idle" && activeReader && activeReader.reader === reader) activeReader = null;
    },
    onStep: (i) => {
      card.querySelectorAll(".step").forEach((li) => li.classList.toggle("reading", Number(li.dataset.step) === i));
      const current = card.querySelector(`.step[data-step="${i}"]`);
      if (current) current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  });
  activeReader = { reader, card };
  reader.start(recipe.instructions.map((text, i) => t("stepSpoken", { number: i + 1, text })));
}

function stopReading() {
  if (!activeReader) return;
  const { reader } = activeReader;
  activeReader = null;
  reader.stop();
}

// ---------------------------------------------------------------------------
//  Generate
// ---------------------------------------------------------------------------
async function submit() {
  const ingredients = el.ingredients.value.trim();
  el.ingredients.blur();

  if (!ingredients) {
    state.errorMessage = t("errors.EMPTY_INGREDIENTS");
    showView("error");
    return;
  }
  const max = state.options.maxIngredientsChars;
  if (ingredients.length > max) {
    state.errorMessage = t("errors.INGREDIENTS_TOO_LONG", { max });
    showView("error");
    return;
  }

  const country = currentCountry();
  if (!country) {
    showCountryHint("COUNTRY_REQUIRED");
    el.country.focus();
    return;
  }

  let budget;
  if (state.useBudget) {
    budget = parseBudget(el.budget.value, country);
    if (budget === null || Number.isNaN(budget)) {
      // Problem with the budget: say so right under the box, no need to call the AI.
      showBudgetHint(budget === null ? "BUDGET_REQUIRED" : "INVALID_BUDGET");
      el.budget.focus();
      return;
    }
  }

  showView("loading");
  // On phones the result area is below the form: bring the pot into view.
  if (el.view.getBoundingClientRect().top > window.innerHeight * 0.6) {
    el.view.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  try {
    const data = await generateRecipes({
      ingredients,
      country: country.code,
      mode: state.mode,
      budget,
      useFirst: state.useFirst.length ? state.useFirst : undefined,
    });
    state.recipes = data.recipes || [];
    state.currency = data.currency;
    showView("success");
    requestAnimationFrame(() => {
      const title = document.getElementById("results-title");
      if (title) {
        title.scrollIntoView({ behavior: "smooth", block: "start" });
        title.focus({ preventScroll: true });
      }
    });
  } catch (err) {
    state.errorMessage = friendlyError(err);
    showView("error");
  }
}

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------
function bindEvents() {
  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.view !== "loading") submit();
  });
  el.ingredients.addEventListener("input", () => {
    updateCharCount();
    if (!el.ingredients.value.trim()) state.useFirst = [];
  });
  el.ingredients.addEventListener("keydown", (event) => {
    // Ctrl+Enter (or Cmd+Enter) generates; plain Enter adds a new line.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      el.form.requestSubmit();
    }
  });
  el.country.addEventListener("change", () => {
    state.country = el.country.value;
    storage.set("country", state.country);
    el.country.classList.remove("is-empty");
    sizeCountrySelect();
    updateExamples();
    showCountryHint();
    renderBudgetField();
  });
  el.useBudget.addEventListener("change", () => {
    state.useBudget = el.useBudget.checked;
    storage.set("useBudget", state.useBudget);
    renderBudgetField();
    if (state.useBudget && currentCountry() && !currentBudget()) el.budget.focus();
  });
  el.budget.addEventListener("input", () => {
    const country = currentCountry();
    if (!country) return;
    const value = parseBudget(el.budget.value, country);
    if (value === null) delete state.budgets[country.code];
    else if (!Number.isNaN(value)) state.budgets[country.code] = value;
    storage.set("budgets", state.budgets);
    showBudgetHint(Number.isNaN(value) ? "INVALID_BUDGET" : null);
  });
  el.budget.addEventListener("blur", () => {
    const country = currentCountry();
    if (!country) return;
    const value = parseBudget(el.budget.value, country);
    if (value && !Number.isNaN(value)) el.budget.value = formatNumber(value, country);
  });
}

async function loadOptions() {
  try {
    state.options = await getOptions();
  } catch {
    state.options = FALLBACK_OPTIONS;
  }
  if (!currentCountry()) state.country = null; // shows "Select country"
  if (!state.options.modes.includes(state.mode)) state.mode = state.options.defaultMode;
  el.ingredients.maxLength = state.options.maxIngredientsChars;
  renderCountries();
  updateExamples();
  renderModeChips();
  renderBudgetField();
  updateCharCount();
  // Re-measure once the web fonts have loaded (they change the text width).
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeCountrySelect);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* not available (e.g. plain http on another device): app still works */
    });
  });
}

applyStaticTexts();
initSplitter();
updateSavedCount();
document.getElementById("open-saved").addEventListener("click", openSaved);
initFridge({
  maxChars: () => state.options.maxIngredientsChars,
  country: () => state.country,
  onCook: ({ text, useFirst }) => {
    el.ingredients.value = text;
    state.useFirst = useFirst;
    updateCharCount();
    el.ingredients.focus();
    el.ingredients.scrollIntoView({ behavior: "smooth", block: "center" });
  },
});
bindEvents();
showView("idle");
loadOptions();
registerServiceWorker();
