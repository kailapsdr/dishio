import pytest

from dishify.countries import COUNTRIES
from dishify.prompts import MODES, build_recipe_prompt

ID = COUNTRIES["ID"]
US = COUNTRIES["US"]


def test_keeps_the_original_flutter_prompt():
    prompt = build_recipe_prompt("egg, rice", ID)
    assert prompt.startswith("Act as an expert home chef. Create exactly 5 practical")
    assert "clearly different from each other" in prompt
    assert "use mainly these ingredients, which the cook already has at home: egg, rice." in prompt
    assert "Respond with ONLY valid JSON" in prompt
    for field in ("title", "description", "cookTime", "difficulty", "ingredients", "instructions"):
        assert f'"{field}"' in prompt


def test_location_and_currency_are_in_the_prompt():
    prompt = build_recipe_prompt("egg", ID)
    assert "lives in Indonesia" in prompt
    assert "IDR" in prompt
    assert "Rp25.000" in prompt  # example of how prices are written
    assert '"estimatedCost"' in prompt

    us = build_recipe_prompt("egg", US)
    assert "lives in United States" in us and "USD" in us


def test_no_situation_by_default():
    assert "Situation" not in build_recipe_prompt("egg", ID)


@pytest.mark.parametrize(
    "mode, expected",
    [
        ("quick_15", "15 minutes or less"),
        ("rice_cooker", "rice cooker"),
        ("no_stove", "no stove"),
    ],
)
def test_each_situation_changes_the_prompt(mode, expected):
    prompt = build_recipe_prompt("egg", ID, mode=mode)
    assert "Situation (must be respected)" in prompt
    assert expected in prompt


def test_budget_alone_and_combined():
    alone = build_recipe_prompt("egg", ID, budget=25000.0)
    assert "maximum budget is 25000 IDR" in alone
    both = build_recipe_prompt("egg", US, mode="quick_15", budget=4.5)
    assert "15 minutes or less" in both and "maximum budget is 4.5 USD" in both


def test_every_mode_except_none_has_text():
    assert MODES["none"] is None
    assert all(MODES[m] for m in MODES if m != "none")


def test_use_first_reaches_the_prompt():
    prompt = build_recipe_prompt("chicken, spinach", ID, use_first=("spinach",))
    assert "will spoil soon" in prompt and "first: spinach." in prompt
    assert "spoil soon" not in build_recipe_prompt("chicken", ID)


def test_with_a_budget_the_ingredients_may_still_be_bought():
    have = build_recipe_prompt("chicken", ID)
    assert "already has at home: chicken." in have and "may still need to buy" not in have
    want = build_recipe_prompt("chicken", ID, budget=25000.0)
    assert "would like to eat and may still need to buy: chicken." in want
    assert "including buying the ingredients" in want

