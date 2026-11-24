"""Talks to the Gemini API and turns its answer into clean recipe data.

Uses Gemini's REST endpoint with Python's built-in ``urllib``, so no extra
package is needed. The API key goes in a request header (never in the URL)
and never leaves the server.
"""

import json
import re
import socket
import urllib.error
import urllib.request

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_RECIPES = 5

_STEP_PREFIX = re.compile(r"^\s*(step\s*)?\d+\s*[:.)\-–]\s*", re.IGNORECASE)


class GeminiError(Exception):
    """Something went wrong with the AI. ``code`` is shown to the web page."""

    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _http_post(url: str, headers: dict, body: bytes, timeout: int) -> dict:
    """Default transport: POST JSON and return the decoded JSON reply.

    Raises urllib errors untouched; GeminiService turns them into GeminiError.
    """
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class GeminiService:
    def __init__(self, api_key: str, model: str, timeout: int = 60, transport=_http_post):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self._transport = transport

    def generate_recipes(self, prompt: str) -> list[dict]:
        raw_text = self._call(prompt)
        return parse_recipes(raw_text)

    def estimate_shelf_life(self, prompt: str) -> int | None:
        """Days a food keeps, or None if the AI says it is not a food."""
        return parse_shelf_life(self._call(prompt, temperature=0.2))

    # -- HTTP --------------------------------------------------------------
    def suggest_substitutes(self, prompt: str) -> dict:
        """Up to 3 replacements for an ingredient the cook doesn't have."""
        return parse_substitutes(self._call(prompt, temperature=0.4))

    def _call(self, prompt: str, temperature: float = 0.85) -> str:
        url = API_URL.format(model=self.model)
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self._api_key,
        }
        body = json.dumps(
            {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "responseMimeType": "application/json",
                },
            }
        ).encode("utf-8")

        try:
            data = self._transport(url, headers, body, self.timeout)
        except urllib.error.HTTPError as err:
            raise _error_from_http(err) from None
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError):
            raise GeminiError(
                "AI_UNAVAILABLE",
                "Could not reach the AI service. Please check the internet "
                "connection of the computer running Dishio and try again.",
            ) from None
        except ValueError:
            raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.") from None

        return _extract_text(data)


def _error_from_http(err: urllib.error.HTTPError) -> GeminiError:
    try:
        detail = err.read().decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive
        detail = ""
    lowered = detail.lower()

    if err.code in (401, 403) or "api_key_invalid" in lowered or "api key not valid" in lowered:
        return GeminiError(
            "AI_KEY_INVALID",
            "The Gemini API key was rejected. Check GEMINI_API_KEY in the .env file.",
            status=503,
        )
    if err.code == 429:
        return GeminiError(
            "AI_BUSY",
            "The AI has reached its usage limit for now. Please try again later.",
            status=503,
        )
    if err.code == 404:
        return GeminiError(
            "AI_MODEL_NOT_FOUND",
            "The Gemini model name was not found. Check GEMINI_MODEL in the .env file.",
            status=503,
        )
    return GeminiError(
        "AI_UNAVAILABLE",
        "The AI service is having trouble right now. Please try again in a moment.",
    )


def _extract_text(data) -> str:
    try:
        candidates = data.get("candidates") or []
        if not candidates:
            raise GeminiError(
                "AI_BAD_RESPONSE",
                "The AI did not return any recipes. Try different ingredients.",
            )
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(
            p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought")
        )
    except GeminiError:
        raise
    except Exception:
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.") from None

    if not text.strip():
        raise GeminiError("AI_BAD_RESPONSE", "The AI returned an empty response. Please try again.")
    return text


# -- Turning the model's text into recipes ------------------------------------
def extract_json(text: str) -> str:
    """Pull the JSON object out of the model text, tolerating ``` fences."""
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"```[a-zA-Z]*", "", t).replace("```", "").strip()
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        return t[start : end + 1]
    return t


def _text(value, default: str = "") -> str:
    if value is None:
        return default
    value = str(value).strip()
    return value or default


def _string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [s for s in (str(v).strip() for v in value if v is not None) if s]


def normalize_recipe(raw: dict) -> dict:
    """Same defaults as Recipe.fromJson in the Flutter app, plus estimatedCost."""
    return {
        "title": _text(raw.get("title"), "Untitled Dish"),
        "description": _text(raw.get("description")),
        "cookTime": _text(raw.get("cookTime"), "—"),
        "difficulty": _text(raw.get("difficulty"), "Easy"),
        "estimatedCost": _text(raw.get("estimatedCost")),
        "imageKeyword": _text(raw.get("imageKeyword"), "food"),
        "ingredients": _string_list(raw.get("ingredients")),
        "instructions": [
            _STEP_PREFIX.sub("", step) or step
            for step in _string_list(raw.get("instructions"))
        ],
    }


def parse_recipes(text: str) -> list[dict]:
    try:
        decoded = json.loads(extract_json(text))
    except ValueError:
        raise GeminiError(
            "AI_BAD_RESPONSE", "The AI response could not be read. Please try again in a moment."
        ) from None

    items = decoded.get("recipes") if isinstance(decoded, dict) else None
    if not isinstance(items, list):
        raise GeminiError("NO_RECIPES", "No recipes were found in the response. Please try again.")

    recipes = [normalize_recipe(item) for item in items if isinstance(item, dict)]
    recipes = [r for r in recipes if r["title"] and r["instructions"]][:MAX_RECIPES]
    if not recipes:
        raise GeminiError(
            "NO_RECIPES",
            "No recipes could be created from those ingredients. Try adding one or two more.",
        )
    return recipes


MAX_SHELF_LIFE_DAYS = 365


def parse_shelf_life(text: str) -> int | None:
    """Read {"isFood": true, "days": 4} from the model."""
    try:
        decoded = json.loads(extract_json(text))
    except ValueError:
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.") from None
    if not isinstance(decoded, dict):
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.")
    if decoded.get("isFood") is False:
        return None
    days = decoded.get("days")
    if isinstance(days, bool) or not isinstance(days, (int, float)):
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.")
    return max(0, min(MAX_SHELF_LIFE_DAYS, round(days)))


MAX_SUBSTITUTES = 3


def parse_substitutes(text: str) -> dict:
    """Read {"suggestions": [{name, how, fromFridge}], "tip": "..."}."""
    try:
        decoded = json.loads(extract_json(text))
    except ValueError:
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.") from None
    if not isinstance(decoded, dict):
        raise GeminiError("AI_BAD_RESPONSE", "The AI response could not be read.")
    raw = decoded.get("suggestions")
    suggestions = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"))
        if not name:
            continue
        suggestions.append(
            {"name": name, "how": _text(item.get("how")), "fromFridge": item.get("fromFridge") is True}
        )
    return {"suggestions": suggestions[:MAX_SUBSTITUTES], "tip": _text(decoded.get("tip"))}

