// Builds the prompts sent to Gemini. Same wording as dishify/prompts.py.
//
// The situation texts live here, on the server. The browser only sends a
// short id such as "quick_15", so nobody can slip their own instructions
// into the prompt through the situation picker.

export const RECIPE_COUNT = 5;

export const MODES = {
  none: null,
  quick_15:
    "The cook has only 15 minutes. Each recipe must be ready, from start " +
    "to finish, in 15 minutes or less, and cookTime must reflect that.",
  rice_cooker:
    "The only cooking appliance is an electric rice cooker (no stove, no " +
    "oven, no microwave). Every cooking step must use the rice cooker.",
  no_stove:
    "There is no stove and no oven. Use only no-cook methods or simple " +
    "appliances such as an electric kettle (hot water), microwave or " +
    "rice cooker.",
};

export const DEFAULT_MODE = "none";

const BUDGET_TEXT = (budget, currency) =>
  `The cook's maximum budget is ${budget} ${currency} per recipe. The ` +
  "estimated total cost of each recipe, including buying the ingredients " +
  "listed above, must not exceed that budget.";

const HAVE_TEXT = (ingredients) =>
  `that use mainly these ingredients, which the cook already has at home: ${ingredients}.`;
const WANT_TEXT = (ingredients) =>
  "built around these ingredients, which the cook would like to eat and may " +
  `still need to buy: ${ingredients}.`;

/** 10000 -> "10000", 4.5 -> "4.5" */
function formatAmount(amount) {
  return amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function buildRecipePrompt(ingredients, country, mode = DEFAULT_MODE, budget = null, useFirst = []) {
  const rules = [];
  if (useFirst.length) {
    rules.push(
      "These ingredients will spoil soon, so the recipes should use them " +
        "first: " + useFirst.join(", ") + ".",
    );
  }
  if (MODES[mode]) rules.push(MODES[mode]);
  if (budget) rules.push(BUDGET_TEXT(formatAmount(budget), country.currency));

  let situation = "";
  if (rules.length) {
    const lines = rules.map((rule) => `- ${rule}`).join("\n");
    situation = `\nSituation (must be respected):\n${lines}\n`;
  }
  const wanted = budget ? WANT_TEXT(ingredients) : HAVE_TEXT(ingredients);

  return `Act as an expert home chef. Create exactly ${RECIPE_COUNT} practical, easy-to-cook recipes
${wanted}

The cook lives in ${country.name}. Prefer ingredients, portion sizes and
cooking habits that are common there, and estimate prices using typical local
market or supermarket prices in ${country.name}, in ${country.currency}.
${situation}
Rules:
- Prioritise the ingredients listed above. You may assume basic staples are on
  hand (salt, pepper, cooking oil, butter, water).
- Make the ${RECIPE_COUNT} recipes clearly different from each other (different
  dishes and cooking methods, not small variations of one dish).
- Keep the steps clear and beginner-friendly.
- Respond with ONLY valid JSON, no markdown and no commentary, exactly matching
  this shape:

{
  "recipes": [
    {
      "title": "string",
      "description": "one short, appetising sentence",
      "cookTime": "e.g. 20 min",
      "difficulty": "Easy | Medium | Hard",
      "estimatedCost": "approximate total cost of all the recipe's ingredients in ${country.currency}, written the way prices are written in ${country.name}, e.g. ${country.priceExample}",
      "imageKeyword": "one or two words describing the dish, e.g. fried-rice",
      "ingredients": ["item with quantity", "..."],
      "instructions": ["Step 1 ...", "Step 2 ...", "..."]
    }
  ]
}
`;
}

/** Ask how long a food keeps at home. The name can be in any language. */
export function buildShelfLifePrompt(food, country = null) {
  const where = country ? ` in ${country.name}` : "";
  return `You help a home cook keep track of the food they have${where}.
Food name (it may be in any language): ${food}

Estimate how many days this food normally stays good to eat after buying it
(or after cooking it, if it is a cooked dish), stored the usual way at home:
in the fridge if it is normally refrigerated, otherwise in the cupboard.
Be cautious with raw meat, fish and seafood.

Respond with ONLY valid JSON, no markdown:
{"isFood": true, "days": 3}
Use "isFood": false if the name is not a food or drink.
`;
}

/** Ask what to use instead of one ingredient of a recipe. */
export function buildSubstitutePrompt(ingredient, recipe, fridge = [], country = null) {
  const have = fridge.length ? fridge.join(", ") : "nothing listed";
  const where = country ? `The cook lives in ${country.name}, so prefer things easy to find there.\n` : "";
  return `A home cook is making "${recipe}" but does not have this ingredient:
${ingredient}

What they have in their fridge: ${have}.
${where}
Suggest up to 3 practical substitutes, best first. Prefer things from their
fridge when they work. For each one, say briefly how to use it (amount or
small change to the step). If the ingredient can simply be left out, say so
in "tip".

Respond with ONLY valid JSON, no markdown:
{
  "suggestions": [
    {"name": "string", "how": "one short sentence", "fromFridge": true}
  ],
  "tip": "optional short sentence, or empty"
}
`;
}
