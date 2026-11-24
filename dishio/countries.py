"""Countries the user can pick in "Where do you live?".

Each country has a currency, a locale (used by the browser to write prices
the local way, e.g. "Rp10.000"), a sensible default for the "Budget" situation
an example price that shows Gemini how prices are written there, and the
voices used by "Read the steps" (best match first). The browser first looks
for an English voice from that country (e.g. en-IN for India); if there is
none, it uses a voice in the local language (e.g. id-ID for Indonesia), which
reads the English steps with a local accent.

To add a country, add one line to COUNTRIES. Nothing else needs to change.
"""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Country:
    code: str
    name: str
    currency: str
    locale: str
    default_budget: float
    price_example: str
    speech_langs: tuple[str, ...] = ()

    def to_public_dict(self) -> dict:
        data = asdict(self)
        return {
            "code": data["code"],
            "name": data["name"],
            "currency": data["currency"],
            "locale": data["locale"],
            "defaultBudget": data["default_budget"],
            "speechLangs": list(data["speech_langs"]),
        }


COUNTRIES: dict[str, Country] = {
    c.code: c
    for c in [
        Country("ID", "Indonesia", "IDR", "id-ID", 10000, "Rp25.000", ("id-ID",)),
        Country("MY", "Malaysia", "MYR", "ms-MY", 10, "RM12", ("en-MY", "ms-MY")),
        Country("SG", "Singapore", "SGD", "en-SG", 5, "S$6", ("en-SG", "en-GB")),
        Country("PH", "Philippines", "PHP", "en-PH", 150, "₱180", ("en-PH", "fil-PH")),
        Country("TH", "Thailand", "THB", "th-TH", 100, "฿120", ("th-TH",)),
        Country("VN", "Vietnam", "VND", "vi-VN", 50000, "60.000 ₫", ("vi-VN",)),
        Country("IN", "India", "INR", "en-IN", 150, "₹200", ("en-IN", "hi-IN")),
        Country("JP", "Japan", "JPY", "ja-JP", 800, "¥900", ("ja-JP",)),
        Country("KR", "South Korea", "KRW", "ko-KR", 8000, "₩9,000", ("ko-KR",)),
        Country("CN", "China", "CNY", "zh-CN", 30, "¥35", ("zh-CN",)),
        Country("AU", "Australia", "AUD", "en-AU", 8, "A$10", ("en-AU",)),
        Country("NZ", "New Zealand", "NZD", "en-NZ", 8, "NZ$10", ("en-NZ", "en-AU")),
        Country("US", "United States", "USD", "en-US", 5, "$6", ("en-US",)),
        Country("CA", "Canada", "CAD", "en-CA", 7, "C$8", ("en-CA", "en-US")),
        Country("GB", "United Kingdom", "GBP", "en-GB", 4, "£5", ("en-GB",)),
        Country("DE", "Germany", "EUR", "de-DE", 5, "6 €", ("de-DE",)),
        Country("FR", "France", "EUR", "fr-FR", 5, "6 €", ("fr-FR",)),
        Country("NL", "Netherlands", "EUR", "nl-NL", 5, "€ 6", ("nl-NL",)),
        Country("AE", "United Arab Emirates", "AED", "en-AE", 20, "AED 25", ("en-AE", "ar-AE", "ar-SA")),
        Country("SA", "Saudi Arabia", "SAR", "en-SA", 20, "SAR 25", ("en-SA", "ar-SA")),
    ]
}

DEFAULT_COUNTRY = "ID"
