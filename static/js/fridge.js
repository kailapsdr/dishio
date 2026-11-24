// "My fridge" panel. Food sits on shelves as strips of tape with its name
// written on, grouped by how soon it should be eaten. You add food with a
// simple "keeps for − 3 days +" counter.

import { estimateShelfLife } from "./api.js";
import { ICONS } from "./icons.js";
import {
  MAX_NAME_LENGTH,
  addDays,
  addItem,
  freshness,
  ingredientsForCooking,
  loadPantry,
  needsAttention,
  removeItem,
  suggestDays,
  todayISO,
} from "./pantry.js";
import { TEXT, t } from "./texts.js";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 90;
const ASK_AI_AFTER_MS = 700; // wait until the user stops typing
const SHELVES = ["past", "today", "soon", "fresh"]; // top to bottom

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "icon") node.innerHTML = ICONS[value]; // our own static SVG only
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function statusText({ level, days }) {
  if (level === "past") return days === 1 ? t("fridgeStatus.pastOne") : t("fridgeStatus.past", { days });
  if (level === "today") return t("fridgeStatus.today");
  if (level === "soon") return days === 1 ? t("fridgeStatus.soonOne") : t("fridgeStatus.soon", { days });
  return t("fridgeStatus.fresh", { days });
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  try {
    return new Date(y, m - 1, d).toLocaleDateString(TEXT.dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * @param {object} opts
 * @param {() => number} opts.maxChars  longest allowed ingredients text
 * @param {() => string|null} opts.country  the user's country code, if picked
 * @param {(fill: {text: string, useFirst: string[]}) => void} opts.onCook
 */
export function initFridge({ maxChars, country, onCook }) {
  const dialog = $("fridge");
  const form = $("fridge-add");
  const nameInput = $("item-name");
  const hint = $("item-hint");
  const shelves = $("fridge-shelves");
  const summary = $("fridge-summary");
  const cookButton = $("cook-with-fridge");
  const badge = $("fridge-badge");
  const fillLink = $("fill-from-fridge");
  const daysOut = $("keeps-days");
  const dateOut = $("keeps-date");

  let days = DEFAULT_DAYS;
  let daysTouched = false; // the user changed the counter themselves
  let askTimer = null;
  let askNumber = 0; // ignore answers to older questions

  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.placeholder = t("itemPlaceholder");

  // --- "Keeps for − 3 days +" ------------------------------------------------
  function setDays(value, fromUser = false) {
    days = Math.max(0, Math.min(MAX_DAYS, Math.round(value)));
    if (fromUser) daysTouched = true;
    daysOut.textContent = days === 0 ? t("keepsDaysZero") : days === 1 ? t("keepsDaysOne") : t("keepsDays", { days });
    dateOut.textContent = t("keepsUntil", { date: formatDate(addDays(todayISO(), days)) });
    $("keeps-minus").disabled = days === 0;
    $("keeps-plus").disabled = days === MAX_DAYS;
  }

  $("keeps-minus").addEventListener("click", () => setDays(days - 1, true));
  $("keeps-plus").addEventListener("click", () => setDays(days + 1, true));

  function showHint(text, invalid = false) {
    hint.textContent = text;
    hint.classList.toggle("invalid", invalid);
  }

  // --- Guess how long it keeps: built-in list first, then ask Gemini --------
  function suggest() {
    clearTimeout(askTimer);
    const name = nameInput.value.trim();
    askNumber += 1;
    if (!name) {
      showHint("");
      return;
    }
    const known = suggestDays(name);
    if (known != null) {
      if (!daysTouched) setDays(known);
      showHint(t("keepsHint", { days: known }));
      return;
    }
    if (name.length < 2) return;
    const myNumber = askNumber;
    askTimer = setTimeout(async () => {
      showHint(t("keepsChecking", { name }));
      try {
        const answer = await estimateShelfLife(name, country());
        if (myNumber !== askNumber) return;
        if (!answer.isFood) {
          showHint(t("keepsNotFood"));
          return;
        }
        if (!daysTouched) setDays(answer.days);
        showHint(t("keepsHintAi", { days: answer.days }));
      } catch {
        if (myNumber === askNumber) showHint(t("keepsHintUnknown"));
      }
    }, ASK_AI_AFTER_MS);
  }

  nameInput.addEventListener("input", suggest);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!nameInput.value.trim()) {
      showHint(t("itemNameRequired"), true);
      nameInput.focus();
      return;
    }
    clearTimeout(askTimer);
    askNumber += 1;
    addItem(nameInput.value, addDays(todayISO(), days));
    nameInput.value = "";
    showHint("");
    daysTouched = false;
    setDays(DEFAULT_DAYS);
    render();
    nameInput.focus();
  });

  // --- Shelves ---------------------------------------------------------------
  function tape(item, index) {
    const status = freshness(item);
    return h(
      "li",
      { class: `tape-wrap tilt-${index % 4}`, "data-level": status.level },
      h(
        "div",
        { class: "tape" },
        h("span", { class: "tape-name" }, item.name),
        h("span", { class: "tape-status" }, statusText(status))
      ),
      h("button", {
        type: "button",
        class: "tape-remove",
        icon: "close",
        "aria-label": t("removeLabel", { name: item.name }),
        title: t("removeLabel", { name: item.name }),
        onclick: () => {
          removeItem(item.id);
          render();
        },
      })
    );
  }

  function renderShelves(items) {
    if (!items.length) {
      shelves.replaceChildren(
        h(
          "section",
          { class: "shelf" },
          h("p", { class: "shelf-empty" }, t("fridgeEmpty")),
          h("div", { class: "shelf-glass", "aria-hidden": "true" })
        )
      );
      return;
    }
    const groups = Object.fromEntries(SHELVES.map((level) => [level, []]));
    items.forEach((item) => groups[freshness(item).level].push(item));
    shelves.replaceChildren(
      ...SHELVES.filter((level) => groups[level].length).map((level) =>
        h(
          "section",
          { class: "shelf", "data-level": level },
          h("h3", { class: "shelf-title" }, t(`shelf.${level}`)),
          h("ul", { class: "shelf-items" }, groups[level].map(tape)),
          h("div", { class: "shelf-glass", "aria-hidden": "true" })
        )
      )
    );
  }

  function render() {
    const items = loadPantry();
    const attention = items.filter((i) => needsAttention(i)).length;
    const urgent = items.some((i) => ["past", "today"].includes(freshness(i).level));
    const usable = ingredientsForCooking(maxChars());

    renderShelves(items);

    if (!items.length) summary.textContent = t("fridgeSummaryNone");
    else if (!attention) summary.textContent = t("fridgeSummaryAllFresh", { count: items.length });
    else summary.textContent = t("fridgeSummaryAttention", { count: items.length, attention });

    cookButton.disabled = !usable.text;
    $("cook-with-fridge-note").hidden = !usable.skippedPast;

    badge.hidden = !attention;
    badge.textContent = String(attention);
    badge.classList.toggle("urgent", urgent);

    const usableCount = usable.text ? usable.text.split(", ").length : 0;
    fillLink.hidden = !usableCount;
    $("fill-from-fridge-label").textContent = t("fillFromFridge", { count: usableCount });
  }

  // --- Open, close, cook -------------------------------------------------------
  function open() {
    render();
    setDays(daysTouched ? days : DEFAULT_DAYS);
    dialog.showModal();
    nameInput.focus();
  }

  function cook() {
    const { text, useFirst } = ingredientsForCooking(maxChars());
    if (!text) return;
    if (dialog.open) dialog.close();
    onCook({ text, useFirst });
  }

  $("open-fridge").addEventListener("click", open);
  $("close-fridge").addEventListener("click", () => dialog.close());
  cookButton.addEventListener("click", cook);
  fillLink.addEventListener("click", cook);
  // Click on the dimmed area outside the panel closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", render);

  setDays(DEFAULT_DAYS);
  render();
  return { render };
}
