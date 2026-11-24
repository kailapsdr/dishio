"""Tests for "how long does this food keep?" (used by My fridge)."""


import pytest

from app import create_app
from dishify.countries import COUNTRIES
from dishify.gemini_service import GeminiError, parse_shelf_life
from dishify.prompts import build_shelf_life_prompt

from .conftest import FakeGemini, make_settings


def test_any_language_is_sent_to_gemini(client, fake_gemini):
    res = client.post("/api/shelf-life", json={"name": "Hähnchenbrust", "country": "DE"})
    assert res.status_code == 200
    assert res.get_json() == {"name": "Hähnchenbrust", "days": 4, "isFood": True}
    assert "Hähnchenbrust" in fake_gemini.prompts[-1]
    assert "Germany" in fake_gemini.prompts[-1]


def test_answers_are_remembered(client, fake_gemini):
    client.post("/api/shelf-life", json={"name": "鶏肉"})
    client.post("/api/shelf-life", json={"name": "鶏肉"})
    assert len(fake_gemini.prompts) == 1


@pytest.mark.parametrize(
    "payload, code",
    [
        ({"name": "  "}, "EMPTY_FOOD_NAME"),
        ({"name": "x" * 41}, "FOOD_NAME_TOO_LONG"),
        ({}, "EMPTY_FOOD_NAME"),
    ],
)
def test_bad_names(client, payload, code):
    res = client.post("/api/shelf-life", json=payload)
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == code


def test_has_its_own_rate_limit():
    app = create_app(make_settings(shelf_life_per_minute=2), gemini=FakeGemini())
    c = app.test_client()
    assert c.post("/api/shelf-life", json={"name": "a"}).status_code == 200
    assert c.post("/api/shelf-life", json={"name": "b"}).status_code == 200
    assert c.post("/api/shelf-life", json={"name": "c"}).status_code == 429
    # Recipes are not affected by the shelf-life limit.
    assert c.post("/api/recipes", json={"ingredients": "egg"}).status_code == 200


def test_ai_error_is_passed_on():
    app = create_app(make_settings(), gemini=FakeGemini(error=GeminiError("AI_BUSY", "busy", 503)))
    res = app.test_client().post("/api/shelf-life", json={"name": "milk"})
    assert res.status_code == 503
    assert res.get_json()["error"]["code"] == "AI_BUSY"


def test_parse_shelf_life():
    assert parse_shelf_life('{"isFood": true, "days": 3}') == 3
    assert parse_shelf_life('```json\n{"isFood": true, "days": 2.6}\n```') == 3
    assert parse_shelf_life('{"isFood": true, "days": 9999}') == 365
    assert parse_shelf_life('{"isFood": true, "days": -4}') == 0
    assert parse_shelf_life('{"isFood": false}') is None
    for bad in ("nope", '{"isFood": true}', '{"days": "three"}', "[]"):
        with pytest.raises(GeminiError):
            parse_shelf_life(bad)


def test_shelf_life_prompt():
    prompt = build_shelf_life_prompt("manok", COUNTRIES["PH"])
    assert "manok" in prompt and "Philippines" in prompt and "any language" in prompt
    assert '"isFood"' in prompt
