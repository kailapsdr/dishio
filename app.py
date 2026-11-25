"""Dishio server.

On your laptop:  python app.py   (then open http://localhost:5000)
Online (Render): gunicorn "app:create_app()"   (see render.yaml)

This one Flask server does two jobs:
  1. serves the web app (everything in the "static" folder), and
  2. answers /api/... requests, calling Gemini with the key from .env.
"""

import mimetypes
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from dishio.config import Settings, load_settings
from dishio.countries import COUNTRIES, DEFAULT_COUNTRY
from dishio.gemini_service import GeminiError, GeminiService
from dishio.prompts import (
    DEFAULT_MODE,
    MODES,
    build_recipe_prompt,
    build_shelf_life_prompt,
    build_substitute_prompt,
)
from dishio.rate_limit import RateLimiter
from dishio.validation import (
    ValidationError,
    validate_recipe_request,
    validate_shelf_life_request,
    validate_substitute_request,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"

# Some Windows computers have wrong file types in the registry (for example
# .js as text/plain), which stops browsers from running the scripts.
# Setting them here makes the app work the same on every machine.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/png", ".png")

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "manifest-src 'self'; "
    "worker-src 'self'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


def error_response(code: str, message: str, status: int, **details):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"].update(details)
    return jsonify(body), status


def create_app(settings: Settings | None = None, gemini: GeminiService | None = None) -> Flask:
    settings = settings or load_settings()
    gemini = gemini or GeminiService(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
        timeout=settings.gemini_timeout_seconds,
        fallback_models=settings.gemini_fallback_models,
    )
    limiter = RateLimiter(settings.rate_limit_per_minute, settings.rate_limit_per_day)
    # "How long does this keep?" has its own, separate limit.
    shelf_limiter = RateLimiter(settings.shelf_life_per_minute, settings.shelf_life_per_day)
    # Answers are remembered so the same food is never asked twice.
    shelf_cache: dict[str, int | None] = {}
    # "What can I use instead?" also has its own limit and memory.
    swap_limiter = RateLimiter(settings.substitute_per_minute, settings.substitute_per_day)
    swap_cache: dict[str, dict] = {}

    def visitor():
        """Who is asking, for the per-visitor limits."""
        if settings.client_ip_header:
            forwarded = request.headers.get(settings.client_ip_header, "")
            first = forwarded.split(",")[0].strip()[:64]
            if first:
                return first
        return request.remote_addr or "unknown"

    def rate_limited(limit):
        response, status = error_response(
            "RATE_LIMITED",
            f"Too many requests. Please wait {limit.retry_after} seconds and try again.",
            429,
            retryAfter=limit.retry_after,
        )
        response.headers["Retry-After"] = str(limit.retry_after)
        return response, status

    def not_configured():
        return error_response(
            "NOT_CONFIGURED",
            "The Gemini API key is missing. Add it to the .env file and restart Dishio.",
            503,
        )

    # static_url_path="" serves static/sw.js at /sw.js, which lets the
    # service worker control the whole app.
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # requests are tiny; refuse big ones
    app.config["JSON_SORT_KEYS"] = False
    app.json.sort_keys = False
    app.extensions["dishio"] = {"settings": settings, "limiter": limiter}

    # -- Pages -------------------------------------------------------------
    @app.get("/")
    def index():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.get("/sw.js")
    def service_worker():
        response = send_from_directory(STATIC_DIR, "sw.js")
        response.headers["Cache-Control"] = "no-cache"
        return response

    # -- API ---------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "gemini_configured": settings.gemini_configured})

    @app.get("/api/options")
    def options():
        return jsonify(
            {
                "countries": [c.to_public_dict() for c in COUNTRIES.values()],
                "defaultCountry": DEFAULT_COUNTRY,
                "modes": list(MODES.keys()),
                "defaultMode": DEFAULT_MODE,
                "maxIngredientsChars": settings.max_ingredients_chars,
            }
        )

    @app.post("/api/recipes")
    def recipes():
        payload = request.get_json(silent=True)
        try:
            req = validate_recipe_request(payload, settings.max_ingredients_chars)
        except ValidationError as err:
            return error_response(err.code, err.message, 400, **err.details)

        if not settings.gemini_configured:
            return error_response(
                "NOT_CONFIGURED",
                "The Gemini API key is missing. Add it to the .env file and restart Dishio.",
                503,
            )

        limit = limiter.hit(visitor())
        if not limit.allowed:
            response, status = error_response(
                "RATE_LIMITED",
                f"Too many requests. Please wait {limit.retry_after} seconds and try again.",
                429,
                retryAfter=limit.retry_after,
            )
            response.headers["Retry-After"] = str(limit.retry_after)
            return response, status

        prompt = build_recipe_prompt(
            req.ingredients, req.country, req.mode, req.budget, use_first=req.use_first
        )
        try:
            result = gemini.generate_recipes(prompt)
        except GeminiError as err:
            return error_response(err.code, err.message, err.status)

        return jsonify(
            {
                "recipes": result,
                "country": req.country.code,
                "currency": req.country.currency,
                "mode": req.mode,
            }
        )

    @app.post("/api/shelf-life")
    def shelf_life():
        """How many days a food keeps. Used by My fridge for names in any language."""
        try:
            name, country = validate_shelf_life_request(request.get_json(silent=True))
        except ValidationError as err:
            return error_response(err.code, err.message, 400, **err.details)

        key = f"{name.lower()}|{country.code if country else ''}"
        if key in shelf_cache:
            return jsonify({"name": name, "days": shelf_cache[key], "isFood": shelf_cache[key] is not None})

        if not settings.gemini_configured:
            return not_configured()
        limit = shelf_limiter.hit(visitor())
        if not limit.allowed:
            return rate_limited(limit)

        try:
            days = gemini.estimate_shelf_life(build_shelf_life_prompt(name, country))
        except GeminiError as err:
            return error_response(err.code, err.message, err.status)

        if len(shelf_cache) > 2000:
            shelf_cache.clear()
        shelf_cache[key] = days
        return jsonify({"name": name, "days": days, "isFood": days is not None})

    @app.post("/api/substitute")
    def substitute():
        """What to use instead of an ingredient the cook doesn't have."""
        try:
            req = validate_substitute_request(request.get_json(silent=True))
        except ValidationError as err:
            return error_response(err.code, err.message, 400, **err.details)

        key = "|".join(
            [req.ingredient.lower(), req.recipe.lower(), ",".join(sorted(f.lower() for f in req.fridge)),
             req.country.code if req.country else ""]
        )
        if key in swap_cache:
            return jsonify(swap_cache[key])
        if not settings.gemini_configured:
            return not_configured()
        limit = swap_limiter.hit(visitor())
        if not limit.allowed:
            return rate_limited(limit)
        try:
            result = gemini.suggest_substitutes(
                build_substitute_prompt(req.ingredient, req.recipe, req.fridge, req.country)
            )
        except GeminiError as err:
            return error_response(err.code, err.message, err.status)
        if len(swap_cache) > 1000:
            swap_cache.clear()
        swap_cache[key] = result
        return jsonify(result)

    # -- Errors as JSON for the API ------------------------------------------
    @app.errorhandler(404)
    def not_found(_err):
        if request.path.startswith("/api/"):
            return error_response("NOT_FOUND", "This API address does not exist.", 404)
        return send_from_directory(STATIC_DIR, "index.html"), 404

    @app.errorhandler(405)
    def method_not_allowed(_err):
        return error_response("METHOD_NOT_ALLOWED", "This method is not allowed here.", 405)

    @app.errorhandler(413)
    def too_large(_err):
        return error_response("REQUEST_TOO_LARGE", "That request is too large.", 413)

    @app.errorhandler(500)
    def server_error(_err):
        return error_response("SERVER_ERROR", "Something went wrong on the server.", 500)

    # -- Security headers ----------------------------------------------------
    @app.after_request
    def security_headers(response):
        response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    return app


if __name__ == "__main__":
    settings = load_settings()
    app = create_app(settings)
    shown_host = "localhost" if settings.host in ("127.0.0.1", "0.0.0.0") else settings.host
    print()
    print("  Dishio is running.")
    print(f"  Open this address in Chrome or Edge:  http://{shown_host}:{settings.port}")
    if not settings.gemini_configured:
        print()
        print("  WARNING: GEMINI_API_KEY is empty. Open the .env file, paste your key,")
        print("  then stop (Ctrl+C) and start Dishio again.")
    print("  To stop Dishio, press Ctrl+C in this window.")
    print()
    app.run(host=settings.host, port=settings.port, debug=False)
