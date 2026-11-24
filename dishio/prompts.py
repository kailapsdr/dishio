"""Builds the prompt sent to Gemini.

The base prompt comes from the old Flutter app (lib/main.dart). It now asks
for 5 recipes instead of 2 and no longer assumes the ingredients are
leftovers. Added since then:
  * where the user lives, so ingredients and prices fit their country, and
  * an optional real-life situation ("only 15 minutes", "rice cooker only", ...),
  * an optional maximum budget per recipe, which can be combined with any
    situation, and
  * an optional "use these first" list from My fridge (food that spoils soon).

The situation texts live here, on the server. The browser only sends a short
id such as "quick_15", so nobody can slip their own instructions into the
prompt through the situation picker.
"""

from .countries import Country

RECIPE_COUNT = 5  # how many recipes Gemini is asked for

# Order here = order of the chips on screen. Labels live in static/js/texts.js.
MODES: dict[str, str | None] = {
    "none": None,
    "quick_15": (
        "The cook has only 15 minutes. Each recipe must be ready, from start "
        "to finish, in 15 minutes or less, and cookTime must reflect that."
    ),
    "rice_cooker": (
        "The only cooking appliance is an electric rice cooker (no stove, no "
        "oven, no microwave). Every cooking step must use the rice cooker."
    ),
    "no_stove": (
        "There is no stove and no oven. Use only no-cook methods or simple "
        "appliances such as an electric kettle (hot water), microwave or "
        "rice cooker."
    ),
}

DEFAULT_MODE = "none"

BUDGET_TEXT = (
    "The cook's maximum budget is {budget} {currency} per recipe. The "
    "estimated total cost of each recipe, including buying the ingredients "
    "listed above, must not exceed that budget."
)

# Without a budget the ingredients are what the cook already has at home.
# With a budget they are what the cook would like to eat and may still buy.
HAVE_TEXT = "that use mainly these ingredients, which the cook already has at home: {ingredients}."
WANT_TEXT = (
    "built around these ingredients, which the cook would like to eat and may "
    "still need to buy: {ingredients}."
)


def _format_amount(amount: float) -> str:
    """10000.0 -> '10000', 4.5 -> '4.5' (plain digits; Gemini reads these fine)."""
    return f"{amount:.2f}".rstrip("0").rstrip(".")


def build_recipe_prompt(
    ingredients: str,
    country: Country,
    mode: str = DEFAULT_MODE,
    budget: float | None = None,
    use_first: tuple[str, ...] | list[str] = (),
) -> str:
    rules = []
    if use_first:
        rules.append(
            "These ingredients will spoil soon, so the recipes should use them "
            "first: " + ", ".join(use_first) + "."
        )
    if MODES.get(mode):
        rules.append(MODES[mode])
    if budget:
        rules.append(BUDGET_TEXT.format(budget=_format_amount(budget), currency=country.currency))
    situation = ""
    if rules:
        lines = "\n".join(f"- {rule}" for rule in rules)
        situation = f"\nSituation (must be respected):\n{lines}\n"

    wanted = (WANT_TEXT if budget else HAVE_TEXT).format(ingredients=ingredients)

    return f"""\
Act as an expert home chef. Create exactly {RECIPE_COUNT} practical, easy-to-cook recipes
{wanted}

The cook lives in {country.name}. Prefer ingredients, portion sizes and
cooking habits that are common there, and estimate prices using typical local
market or supermarket prices in {country.name}, in {country.currency}.
{situation}
Rules:
- Prioritise the ingredients listed above. You may assume basic staples are on
  hand (salt, pepper, cooking oil, butter, water).
- Make the {RECIPE_COUNT} recipes clearly different from each other (different
  dishes and cooking methods, not small variations of one dish).
- Keep the steps clear and beginner-friendly.
- Respond with ONLY valid JSON, no markdown and no commentary, exactly matching
  this shape:

{{
  "recipes": [
    {{
      "title": "string",
      "description": "one short, appetising sentence",
      "cookTime": "e.g. 20 min",
      "difficulty": "Easy | Medium | Hard",
      "estimatedCost": "approximate total cost of all the recipe's ingredients in {country.currency}, written the way prices are written in {country.name}, e.g. {country.price_example}",
      "imageKeyword": "one or two words describing the dish, e.g. fried-rice",
      "ingredients": ["item with quantity", "..."],
      "instructions": ["Step 1 ...", "Step 2 ...", "..."]
    }}
  ]
}}
"""


def build_shelf_life_prompt(food: str, country: Country | None = None) -> str:
    """Ask how long a food keeps at home. The name can be in any language."""
    where = f" in {country.name}" if country else ""
    return f"""\
You help a home cook keep track of the food they have{where}.
Food name (it may be in any language): {food}

Estimate how many days this food normally stays good to eat after buying it
(or after cooking it, if it is a cooked dish), stored the usual way at home:
in the fridge if it is normally refrigerated, otherwise in the cupboard.
Be cautious with raw meat, fish and seafood.

Respond with ONLY valid JSON, no markdown:
{{"isFood": true, "days": 3}}
Use "isFood": false if the name is not a food or drink.
"""


def build_substitute_prompt(
    ingredient: str,
    recipe: str,
    fridge: tuple[str, ...] | list[str] = (),
    country: Country | None = None,
) -> str:
    """Ask what to use instead of one ingredient of a recipe."""
    have = ", ".join(fridge) if fridge else "nothing listed"
    where = f"The cook lives in {country.name}, so prefer things easy to find there.\n" if country else ""
    return f"""\
A home cook is making "{recipe}" but does not have this ingredient:
{ingredient}

What they have in their fridge: {have}.
{where}
Suggest up to 3 practical substitutes, best first. Prefer things from their
fridge when they work. For each one, say briefly how to use it (amount or
small change to the step). If the ingredient can simply be left out, say so
in "tip".

Respond with ONLY valid JSON, no markdown:
{{
  "suggestions": [
    {{"name": "string", "how": "one short sentence", "fromFridge": true}}
  ],
  "tip": "optional short sentence, or empty"
}}
"""

