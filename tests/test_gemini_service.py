"""Tests for the Gemini client, using a fake connection (no real API calls)."""

import io
import json
import urllib.error

import pytest

from dishio.gemini_service import GeminiError, GeminiService, extract_json, parse_recipes

RECIPE = {
    "title": "Egg Fried Rice",
    "description": "Quick.",
    "cookTime": "15 min",
    "difficulty": "Easy",
    "estimatedCost": "Rp15.000",
    "imageKeyword": "fried-rice",
    "ingredients": ["2 eggs", " ", "1 cup rice"],
    "instructions": ["Step 1: Heat oil.", "2. Fry the rice."],
}


def gemini_reply(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


class FakeTransport:
    def __init__(self, reply=None, error=None):
        self.reply = reply
        self.error = error
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append({"url": url, "headers": headers, "body": json.loads(body), "timeout": timeout})
        if self.error:
            raise self.error
        return self.reply


def http_error(code, body=""):
    return urllib.error.HTTPError("https://x", code, "err", {}, io.BytesIO(body.encode()))


def service(transport):
    return GeminiService(api_key="secret-key", model="gemini-3.5-flash-lite", transport=transport)


def test_request_is_built_safely():
    transport = FakeTransport(gemini_reply(json.dumps({"recipes": [RECIPE]})))
    service(transport).generate_recipes("hello")
    call = transport.calls[0]
    assert "gemini-3.5-flash-lite:generateContent" in call["url"]
    assert "secret-key" not in call["url"]  # key goes in a header, not the URL
    assert call["headers"]["x-goog-api-key"] == "secret-key"
    assert call["body"]["generationConfig"]["responseMimeType"] == "application/json"
    assert call["body"]["contents"][0]["parts"][0]["text"] == "hello"


def test_recipes_are_cleaned_up():
    recipes = service(FakeTransport(gemini_reply(json.dumps({"recipes": [RECIPE]})))).generate_recipes("p")
    r = recipes[0]
    assert r["ingredients"] == ["2 eggs", "1 cup rice"]  # blank item removed
    assert r["instructions"] == ["Heat oil.", "Fry the rice."]  # "Step 1:" removed
    assert r["estimatedCost"] == "Rp15.000"


def test_code_fences_are_tolerated():
    text = "```json\n" + json.dumps({"recipes": [RECIPE]}) + "\n```"
    assert parse_recipes(text)[0]["title"] == "Egg Fried Rice"
    assert extract_json("noise {\"a\": 1} noise") == '{"a": 1}'


def test_at_most_five_recipes_and_defaults():
    many = {"recipes": [RECIPE] * 7}
    assert len(parse_recipes(json.dumps(many))) == 5

    minimal = parse_recipes(json.dumps({"recipes": [{"instructions": ["Do it."]}]}))[0]
    assert minimal["title"] == "Untitled Dish"
    assert minimal["cookTime"] == "—"
    assert minimal["difficulty"] == "Easy"
    assert minimal["estimatedCost"] == ""


def test_recipes_without_steps_are_dropped():
    with pytest.raises(GeminiError) as info:
        parse_recipes(json.dumps({"recipes": [{"title": "Nothing", "instructions": []}]}))
    assert info.value.code == "NO_RECIPES"


@pytest.mark.parametrize("text", ["not json at all", "{broken", "[]"])
def test_unreadable_answers(text):
    with pytest.raises(GeminiError) as info:
        parse_recipes(text)
    assert info.value.code in {"AI_BAD_RESPONSE", "NO_RECIPES"}


def test_thought_parts_are_ignored():
    reply = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "thinking...", "thought": True},
                        {"text": json.dumps({"recipes": [RECIPE]})},
                    ]
                }
            }
        ]
    }
    assert service(FakeTransport(reply)).generate_recipes("p")[0]["title"] == "Egg Fried Rice"


@pytest.mark.parametrize(
    "error, code",
    [
        (http_error(400, '{"error": {"details": [{"reason": "API_KEY_INVALID"}]}}'), "AI_KEY_INVALID"),
        (http_error(403), "AI_KEY_INVALID"),
        (http_error(429), "AI_BUSY"),
        (http_error(404), "AI_MODEL_NOT_FOUND"),
        (http_error(500), "AI_UNAVAILABLE"),
        (urllib.error.URLError("no network"), "AI_UNAVAILABLE"),
        (TimeoutError(), "AI_UNAVAILABLE"),
    ],
)
def test_connection_problems_become_clear_errors(error, code):
    with pytest.raises(GeminiError) as info:
        service(FakeTransport(error=error)).generate_recipes("p")
    assert info.value.code == code
    assert "secret-key" not in info.value.message


def test_empty_or_blocked_reply():
    for reply in ({"candidates": []}, {"promptFeedback": {"blockReason": "SAFETY"}}, gemini_reply("  ")):
        with pytest.raises(GeminiError) as info:
            service(FakeTransport(reply)).generate_recipes("p")
        assert info.value.code == "AI_BAD_RESPONSE"


# -- Backup models ------------------------------------------------------------
class SequenceTransport:
    """Answers each call with the next item: an exception to raise or a reply."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.models = []

    def __call__(self, url, headers, body, timeout):
        self.models.append(url.split("/models/")[1].split(":")[0])
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def backup_service(transport, fallback=("backup-a", "backup-b")):
    return GeminiService(
        api_key="secret-key", model="main", transport=transport, fallback_models=fallback
    )


OK_REPLY = gemini_reply(json.dumps({"recipes": [RECIPE]}))


@pytest.mark.parametrize(
    "error", [http_error(503), http_error(429), http_error(500), http_error(404), TimeoutError()]
)
def test_busy_model_hands_over_to_the_backup(error):
    transport = SequenceTransport(error, OK_REPLY)
    recipes = backup_service(transport).generate_recipes("p")
    assert recipes[0]["title"] == "Egg Fried Rice"
    assert transport.models == ["main", "backup-a"]


def test_all_models_busy_reports_the_main_problem():
    transport = SequenceTransport(http_error(503), http_error(429), http_error(404))
    with pytest.raises(GeminiError) as info:
        backup_service(transport).generate_recipes("p")
    assert transport.models == ["main", "backup-a", "backup-b"]
    assert info.value.code == "AI_UNAVAILABLE"


@pytest.mark.parametrize(
    "error",
    [http_error(403), http_error(400, '{"error": {"details": [{"reason": "API_KEY_INVALID"}]}}'),
     http_error(400)],
)
def test_key_or_request_problems_do_not_use_the_backup(error):
    transport = SequenceTransport(error, OK_REPLY)
    with pytest.raises(GeminiError):
        backup_service(transport).generate_recipes("p")
    assert transport.models == ["main"]


def test_blocked_answer_does_not_use_the_backup():
    transport = SequenceTransport({"candidates": []}, OK_REPLY)
    with pytest.raises(GeminiError) as info:
        backup_service(transport).generate_recipes("p")
    assert info.value.code == "AI_BAD_RESPONSE"
    assert transport.models == ["main"]


def test_main_model_is_not_repeated_as_backup():
    assert backup_service(None, fallback=("main", "backup-a", "backup-a")).models == ["main", "backup-a"]


def test_backup_models_setting(monkeypatch, tmp_path):
    from dishio.config import DEFAULT_FALLBACK_MODELS, load_settings

    empty_env = tmp_path / "none.env"
    monkeypatch.delenv("GEMINI_FALLBACK_MODELS", raising=False)
    assert load_settings(empty_env).gemini_fallback_models == DEFAULT_FALLBACK_MODELS
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", " model-x , model-y ,")
    assert load_settings(empty_env).gemini_fallback_models == ("model-x", "model-y")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "none")
    assert load_settings(empty_env).gemini_fallback_models == ()
