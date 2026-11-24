"""Tests for "what can I use instead?" (the swap link on each ingredient)."""

import pytest

from app import create_app
from dishify.countries import COUNTRIES
from dishify.gemini_service import GeminiError, parse_substitutes
from dishify.prompts import build_substitute_prompt

from .conftest import FakeGemini, make_settings


def test_swap_uses_the_fridge_and_country(client, fake_gemini):
    res = client.post(
        "/api/substitute",
        json={
            "ingredient": "2 tbsp soy sauce",
            "recipe": "Egg Fried Rice",
            "fridge": ["Fish sauce", "Spinach"],
            "country": "ID",
        },
    )
    assert res.status_code == 200
    assert res.get_json()["suggestions"][0]["name"] == "Fish sauce"
    prompt = fake_gemini.prompts[-1]
    assert "2 tbsp soy sauce" in prompt and "Egg Fried Rice" in prompt
    assert "Fish sauce, Spinach" in prompt and "Indonesia" in prompt


def test_same_question_is_answered_from_memory(client, fake_gemini):
    payload = {"ingredient": "butter", "recipe": "Toast", "fridge": ["Oil"]}
    client.post("/api/substitute", json=payload)
    client.post("/api/substitute", json=payload)
    assert len(fake_gemini.prompts) == 1


@pytest.mark.parametrize("payload", [{}, {"ingredient": "  "}, {"ingredient": "x" * 121}, None])
def test_bad_ingredient(client, payload):
    res = client.post("/api/substitute", json=payload)
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] in {"INVALID_INGREDIENT", "BAD_REQUEST"}


def test_fridge_list_is_trimmed(client, fake_gemini):
    fridge = [f"item{i}" for i in range(50)] + ["x" * 80, 7]
    client.post("/api/substitute", json={"ingredient": "milk", "fridge": fridge})
    prompt = fake_gemini.prompts[-1]
    assert "item29" in prompt and "item30" not in prompt and "x" * 80 not in prompt


def test_swap_has_its_own_rate_limit():
    app = create_app(make_settings(substitute_per_minute=1), gemini=FakeGemini())
    c = app.test_client()
    assert c.post("/api/substitute", json={"ingredient": "a"}).status_code == 200
    assert c.post("/api/substitute", json={"ingredient": "b"}).status_code == 429
    assert c.post("/api/recipes", json={"ingredients": "egg"}).status_code == 200


def test_ai_error_is_passed_on():
    app = create_app(make_settings(), gemini=FakeGemini(error=GeminiError("AI_BUSY", "busy", 503)))
    res = app.test_client().post("/api/substitute", json={"ingredient": "milk"})
    assert res.status_code == 503


def test_parse_substitutes():
    text = """```json
    {"suggestions": [
        {"name": "Fish sauce", "how": "Half as much.", "fromFridge": true},
        {"name": "", "how": "dropped"},
        "nonsense",
        {"name": "Salt", "how": "A pinch.", "fromFridge": "yes"},
        {"name": "A"}, {"name": "B"}, {"name": "C"}
    ], "tip": "You can also leave it out."}
    ```"""
    result = parse_substitutes(text)
    assert [s["name"] for s in result["suggestions"]] == ["Fish sauce", "Salt", "A"]
    assert result["suggestions"][0]["fromFridge"] is True
    assert result["suggestions"][1]["fromFridge"] is False  # only real true counts
    assert result["tip"] == "You can also leave it out."
    assert parse_substitutes('{"suggestions": []}') == {"suggestions": [], "tip": ""}
    with pytest.raises(GeminiError):
        parse_substitutes("not json")


def test_substitute_prompt():
    prompt = build_substitute_prompt("1 cup milk", "Pancakes", ("Oat milk",), COUNTRIES["GB"])
    assert "1 cup milk" in prompt and "Pancakes" in prompt and "Oat milk" in prompt
    assert "United Kingdom" in prompt and '"fromFridge"' in prompt
    assert "nothing listed" in build_substitute_prompt("milk", "Pancakes")
