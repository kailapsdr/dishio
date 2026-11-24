import sys
from pathlib import Path

import pytest

# Let the tests import app.py and the dishio package from the project folder.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402
from dishio.config import Settings  # noqa: E402

FAKE_KEY = "test-key-1234567890-do-not-leak"

SAMPLE_RECIPES = [
    {
        "title": "Egg Fried Rice",
        "description": "Quick and savoury.",
        "cookTime": "15 min",
        "difficulty": "Easy",
        "estimatedCost": "Rp15.000",
        "imageKeyword": "fried-rice",
        "ingredients": ["2 eggs", "1 cup rice"],
        "instructions": ["Heat oil.", "Fry the rice."],
    },
    {
        "title": "Rice Omelette",
        "description": "Soft and filling.",
        "cookTime": "10 min",
        "difficulty": "Easy",
        "estimatedCost": "Rp12.000",
        "imageKeyword": "omelette",
        "ingredients": ["3 eggs", "leftover rice"],
        "instructions": ["Beat the eggs.", "Cook and fold."],
    },
]


class FakeGemini:
    """Stands in for GeminiService so tests never call the real API."""

    def __init__(self, recipes=None, error=None):
        self.recipes = recipes if recipes is not None else SAMPLE_RECIPES
        self.error = error
        self.prompts = []

    def generate_recipes(self, prompt):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.recipes

    shelf_days = 4
    swaps = {
        "suggestions": [{"name": "Fish sauce", "how": "Use half as much.", "fromFridge": True}],
        "tip": "",
    }

    def suggest_substitutes(self, prompt):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.swaps

    def estimate_shelf_life(self, prompt):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.shelf_days


def make_settings(**overrides):
    values = dict(gemini_api_key=FAKE_KEY, rate_limit_per_minute=100, rate_limit_per_day=1000)
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def fake_gemini():
    return FakeGemini()


@pytest.fixture
def client(fake_gemini):
    app = create_app(make_settings(), gemini=fake_gemini)
    app.testing = True
    return app.test_client()
