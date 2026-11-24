"""Checks what the browser sends before anything reaches Gemini."""

import math
import re
from dataclasses import dataclass

from .countries import COUNTRIES, DEFAULT_COUNTRY, Country
from .prompts import DEFAULT_MODE, MODES

MAX_BUDGET = 1_000_000_000  # far above any real per-recipe budget
MAX_USE_FIRST = 10  # "use these first" names sent from My fridge
MAX_USE_FIRST_CHARS = 40

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")


class ValidationError(Exception):
    """Bad input. ``code`` is a stable id the web page turns into a message."""

    def __init__(self, code: str, message: str, **details):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


@dataclass(frozen=True)
class RecipeRequest:
    ingredients: str
    country: Country
    mode: str
    budget: float | None
    use_first: tuple[str, ...] = ()


def clean_ingredients(value) -> str:
    if not isinstance(value, str):
        return ""
    value = _CONTROL_CHARS.sub(" ", value)
    return _WHITESPACE.sub(" ", value).strip()


def validate_recipe_request(payload, max_chars: int = 300) -> RecipeRequest:
    if not isinstance(payload, dict):
        raise ValidationError("BAD_REQUEST", "Request body must be a JSON object.")

    ingredients = clean_ingredients(payload.get("ingredients"))
    if not ingredients:
        raise ValidationError(
            "EMPTY_INGREDIENTS", "Please type at least one ingredient first."
        )
    if len(ingredients) > max_chars:
        raise ValidationError(
            "INGREDIENTS_TOO_LONG",
            f"That list is too long. Please keep it under {max_chars} characters.",
            max=max_chars,
        )

    country_code = payload.get("country") or DEFAULT_COUNTRY
    country = COUNTRIES.get(str(country_code).upper()) if isinstance(country_code, str) else None
    if country is None:
        raise ValidationError("INVALID_COUNTRY", "Please choose where you live from the list.")

    mode = payload.get("mode") or DEFAULT_MODE
    if not isinstance(mode, str) or mode not in MODES:
        raise ValidationError("INVALID_MODE", "Please choose a situation from the list.")

    # Budget is optional and can be combined with any situation.
    budget = None
    raw = payload.get("budget")
    if raw is not None and not (isinstance(raw, str) and not raw.strip()):
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
            raise ValidationError("INVALID_BUDGET", "Please enter a budget as a number.")
        try:
            budget = float(raw)
        except ValueError:
            raise ValidationError("INVALID_BUDGET", "Please enter a budget as a number.")
        if not math.isfinite(budget) or budget <= 0 or budget > MAX_BUDGET:
            raise ValidationError(
                "INVALID_BUDGET", "Please enter a budget greater than zero."
            )

    return RecipeRequest(
        ingredients=ingredients,
        country=country,
        mode=mode,
        budget=budget,
        use_first=clean_use_first(payload.get("useFirst"), ingredients),
    )


MAX_FOOD_NAME_CHARS = 40


def validate_shelf_life_request(payload) -> tuple[str, Country | None]:
    if not isinstance(payload, dict):
        raise ValidationError("BAD_REQUEST", "Request body must be a JSON object.")
    name = clean_ingredients(payload.get("name"))
    if not name:
        raise ValidationError("EMPTY_FOOD_NAME", "Type the food's name first.")
    if len(name) > MAX_FOOD_NAME_CHARS:
        raise ValidationError(
            "FOOD_NAME_TOO_LONG", f"Please keep the name under {MAX_FOOD_NAME_CHARS} characters."
        )
    code = payload.get("country")
    country = COUNTRIES.get(code.upper()) if isinstance(code, str) else None
    return name, country


MAX_INGREDIENT_LINE_CHARS = 120
MAX_RECIPE_TITLE_CHARS = 100
MAX_FRIDGE_ITEMS = 30


@dataclass(frozen=True)
class SubstituteRequest:
    ingredient: str
    recipe: str
    fridge: tuple[str, ...]
    country: Country | None


def validate_substitute_request(payload) -> SubstituteRequest:
    if not isinstance(payload, dict):
        raise ValidationError("BAD_REQUEST", "Request body must be a JSON object.")
    ingredient = clean_ingredients(payload.get("ingredient"))
    if not ingredient or len(ingredient) > MAX_INGREDIENT_LINE_CHARS:
        raise ValidationError("INVALID_INGREDIENT", "Pick an ingredient from the recipe.")
    recipe = clean_ingredients(payload.get("recipe"))[:MAX_RECIPE_TITLE_CHARS] or "a home-cooked dish"
    fridge: list[str] = []
    raw = payload.get("fridge")
    for item in raw[:MAX_FRIDGE_ITEMS] if isinstance(raw, list) else []:
        name = clean_ingredients(item)
        if name and len(name) <= MAX_FOOD_NAME_CHARS and name not in fridge:
            fridge.append(name)
    code = payload.get("country")
    country = COUNTRIES.get(code.upper()) if isinstance(code, str) else None
    return SubstituteRequest(ingredient=ingredient, recipe=recipe, fridge=tuple(fridge), country=country)


def clean_use_first(value, ingredients: str) -> tuple[str, ...]:
    """Names from My fridge that spoil soon.

    Only names that also appear in the ingredients text are kept, so this
    field cannot be used to send anything else to the AI. Bad input is
    simply ignored, because the list is only a hint.
    """
    if not isinstance(value, list):
        return ()
    lowered = ingredients.lower()
    names: list[str] = []
    for raw in value[:MAX_USE_FIRST]:
        name = clean_ingredients(raw)
        seen = {n.lower() for n in names}
        if name and len(name) <= MAX_USE_FIRST_CHARS and name.lower() in lowered and name.lower() not in seen:
            names.append(name)
    return tuple(names)
