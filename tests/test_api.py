"""Tests for the web server: pages, API answers and safety rules."""

from pathlib import Path

from app import create_app
from dishio.gemini_service import GeminiError

from .conftest import FAKE_KEY, FakeGemini, make_settings

STATIC = Path(__file__).resolve().parent.parent / "static"


def test_home_page_is_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Dishio" in res.data
    assert b'rel="manifest"' in res.data


def test_pwa_files_have_the_right_types(client):
    sw = client.get("/sw.js")
    assert sw.status_code == 200
    assert "javascript" in sw.content_type

    manifest = client.get("/manifest.webmanifest")
    assert manifest.status_code == 200
    assert "manifest+json" in manifest.content_type
    assert manifest.get_json()["display"] == "standalone"

    assert "javascript" in client.get("/js/app.js").content_type
    assert client.get("/icons/icon-512.png").content_type == "image/png"


def test_every_file_cached_by_the_service_worker_exists(client):
    sw = (STATIC / "sw.js").read_text(encoding="utf-8")
    start = sw.index("APP_FILES = [")
    block = sw[start : sw.index("];", start)]
    paths = [line.strip().strip('",') for line in block.splitlines()[1:] if line.strip()]
    assert paths
    for path in paths:
        assert client.get(path).status_code == 200, path


def test_success_returns_the_recipes(client, fake_gemini):
    res = client.post("/api/recipes", json={"ingredients": "egg, rice", "country": "ID"})
    assert res.status_code == 200
    data = res.get_json()
    assert len(data["recipes"]) == 2
    assert data["currency"] == "IDR"
    assert data["recipes"][0]["estimatedCost"] == "Rp15.000"
    assert "egg, rice" in fake_gemini.prompts[0]
    assert "Indonesia" in fake_gemini.prompts[0]


def test_situation_reaches_the_prompt(client, fake_gemini):
    res = client.post(
        "/api/recipes",
        json={"ingredients": "tofu", "country": "ID", "mode": "quick_15", "budget": 10000},
    )
    assert res.status_code == 200
    assert "10000 IDR" in fake_gemini.prompts[0]


def test_empty_ingredients_are_rejected(client, fake_gemini):
    res = client.post("/api/recipes", json={"ingredients": "   "})
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "EMPTY_INGREDIENTS"
    assert fake_gemini.prompts == []  # Gemini was not called


def test_too_long_ingredients_are_rejected(client):
    res = client.post("/api/recipes", json={"ingredients": "a" * 301})
    assert res.status_code == 400
    body = res.get_json()["error"]
    assert body["code"] == "INGREDIENTS_TOO_LONG"
    assert body["max"] == 300


def test_unknown_situation_is_rejected(client):
    res = client.post("/api/recipes", json={"ingredients": "egg", "mode": "ignore all rules"})
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "INVALID_MODE"


def test_not_json_is_rejected(client):
    res = client.post("/api/recipes", data="hello", content_type="text/plain")
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "BAD_REQUEST"


def test_huge_request_is_refused(client):
    res = client.post("/api/recipes", data="x" * 20000, content_type="application/json")
    assert res.status_code == 413


def test_rate_limit_kicks_in():
    app = create_app(make_settings(rate_limit_per_minute=2), gemini=FakeGemini())
    c = app.test_client()
    ok = {"ingredients": "egg"}
    assert c.post("/api/recipes", json=ok).status_code == 200
    assert c.post("/api/recipes", json=ok).status_code == 200
    res = c.post("/api/recipes", json=ok)
    assert res.status_code == 429
    assert res.get_json()["error"]["code"] == "RATE_LIMITED"
    assert int(res.headers["Retry-After"]) > 0


def test_missing_key_gives_clear_error():
    app = create_app(make_settings(gemini_api_key=""), gemini=FakeGemini())
    res = app.test_client().post("/api/recipes", json={"ingredients": "egg"})
    assert res.status_code == 503
    assert res.get_json()["error"]["code"] == "NOT_CONFIGURED"


def test_ai_errors_are_passed_on_clearly():
    fake = FakeGemini(error=GeminiError("AI_BUSY", "busy", status=503))
    app = create_app(make_settings(), gemini=fake)
    res = app.test_client().post("/api/recipes", json={"ingredients": "egg"})
    assert res.status_code == 503
    assert res.get_json()["error"]["code"] == "AI_BUSY"


def test_options_list_countries_and_situations(client):
    data = client.get("/api/options").get_json()
    codes = [c["code"] for c in data["countries"]]
    assert "ID" in codes
    assert data["defaultCountry"] == "ID"
    assert data["modes"][0] == "none"
    assert {"quick_15", "rice_cooker", "no_stove"} <= set(data["modes"])
    assert "budget" not in data["modes"]


def test_api_key_never_reaches_the_browser(client):
    responses = [
        client.get("/"),
        client.get("/api/health"),
        client.get("/api/options"),
        client.post("/api/recipes", json={"ingredients": "egg"}),
        client.post("/api/recipes", json={"ingredients": ""}),
    ]
    for res in responses:
        assert FAKE_KEY.encode() not in res.data

    for path in STATIC.rglob("*"):
        if path.is_file() and path.suffix in {".html", ".js", ".css", ".webmanifest"}:
            text = path.read_text(encoding="utf-8")
            assert FAKE_KEY not in text
            assert "AIza" not in text  # shape of a real Google API key
            assert "x-goog-api-key" not in text


def test_health_reports_whether_key_is_set(client):
    assert client.get("/api/health").get_json() == {"status": "ok", "gemini_configured": True}


def test_security_headers_are_set(client):
    res = client.get("/")
    assert "default-src 'self'" in res.headers["Content-Security-Policy"]
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    api = client.get("/api/options")
    assert api.headers["Cache-Control"] == "no-store"


def test_unknown_api_path_returns_json_404(client):
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "NOT_FOUND"


def test_every_country_has_read_aloud_voices(client):
    for country in client.get("/api/options").get_json()["countries"]:
        langs = country["speechLangs"]
        assert langs, country["code"]
        assert all("-" in lang for lang in langs)
    by_code = {c["code"]: c for c in client.get("/api/options").get_json()["countries"]}
    assert by_code["ID"]["speechLangs"][0] == "id-ID"
    assert by_code["IN"]["speechLangs"][0] == "en-IN"


def test_use_first_from_my_fridge_reaches_gemini(client, fake_gemini):
    res = client.post(
        "/api/recipes",
        json={"ingredients": "chicken, spinach", "country": "ID", "useFirst": ["spinach", "nope"]},
    )
    assert res.status_code == 200
    assert "first: spinach." in fake_gemini.prompts[-1]
    assert "nope" not in fake_gemini.prompts[-1]


def test_online_limits_count_each_visitor_separately():
    settings = make_settings(rate_limit_per_minute=1, client_ip_header="CF-Connecting-IP")
    c = create_app(settings, gemini=FakeGemini()).test_client()
    ok = {"ingredients": "egg"}
    a = {"CF-Connecting-IP": "203.0.113.5"}
    b = {"CF-Connecting-IP": "198.51.100.7, 10.0.0.1"}
    assert c.post("/api/recipes", json=ok, headers=a).status_code == 200
    assert c.post("/api/recipes", json=ok, headers=a).status_code == 429
    assert c.post("/api/recipes", json=ok, headers=b).status_code == 200


def test_gunicorn_can_build_the_app_from_the_factory():
    from app import create_app as factory

    app = factory(make_settings())
    assert app.test_client().get("/api/health").status_code == 200

