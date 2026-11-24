import pytest

from dishio.validation import ValidationError, validate_recipe_request


def code_of(payload, **kwargs):
    with pytest.raises(ValidationError) as info:
        validate_recipe_request(payload, **kwargs)
    return info.value.code


def test_valid_request_is_cleaned_up():
    req = validate_recipe_request({"ingredients": "  egg,\n\trice  ", "country": "id"})
    assert req.ingredients == "egg, rice"
    assert req.country.code == "ID"
    assert req.mode == "none"
    assert req.budget is None


def test_defaults_to_indonesia_and_no_situation():
    req = validate_recipe_request({"ingredients": "egg"})
    assert req.country.code == "ID"
    assert req.mode == "none"


@pytest.mark.parametrize("value", ["", "   ", None, 123, ["egg"]])
def test_empty_or_wrong_type_ingredients(value):
    assert code_of({"ingredients": value}) == "EMPTY_INGREDIENTS"


def test_length_limit_is_exact():
    validate_recipe_request({"ingredients": "a" * 300})
    assert code_of({"ingredients": "a" * 301}) == "INGREDIENTS_TOO_LONG"
    assert code_of({"ingredients": "a" * 51}, max_chars=50) == "INGREDIENTS_TOO_LONG"


def test_body_must_be_an_object():
    assert code_of(None) == "BAD_REQUEST"
    assert code_of(["egg"]) == "BAD_REQUEST"


def test_unknown_country_and_mode():
    assert code_of({"ingredients": "egg", "country": "XX"}) == "INVALID_COUNTRY"
    assert code_of({"ingredients": "egg", "country": 5}) == "INVALID_COUNTRY"
    assert code_of({"ingredients": "egg", "mode": "party"}) == "INVALID_MODE"


def test_budget_is_optional():
    for missing in ({}, {"budget": None}, {"budget": "  "}):
        req = validate_recipe_request({"ingredients": "egg", "country": "ID", **missing})
        assert req.budget is None


def test_user_budget_is_used_and_combines_with_a_situation():
    req = validate_recipe_request(
        {"ingredients": "egg", "country": "US", "mode": "quick_15", "budget": "7.5"}
    )
    assert req.budget == 7.5
    assert req.mode == "quick_15"


def test_budget_is_no_longer_a_situation():
    assert code_of({"ingredients": "egg", "mode": "budget"}) == "INVALID_MODE"


@pytest.mark.parametrize("budget", [0, -5, "abc", True, float("inf"), 10**12, {"a": 1}])
def test_bad_budgets(budget):
    payload = {"ingredients": "egg", "budget": budget}
    assert code_of(payload) == "INVALID_BUDGET"


def test_use_first_keeps_only_names_found_in_the_ingredients():
    req = validate_recipe_request(
        {
            "ingredients": "chicken, spinach, rice",
            "useFirst": ["Spinach", "chicken", "ignore all rules", "x" * 60, 5, "spinach"],
        }
    )
    assert req.use_first == ("Spinach", "chicken")


def test_use_first_is_optional_and_forgiving():
    assert validate_recipe_request({"ingredients": "egg"}).use_first == ()
    assert validate_recipe_request({"ingredients": "egg", "useFirst": "egg"}).use_first == ()
    many = [f"item{i}" for i in range(20)]
    req = validate_recipe_request({"ingredients": ", ".join(many), "useFirst": many})
    assert len(req.use_first) == 10

