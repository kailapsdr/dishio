// Countries the user can pick in "Where do you live?".
// Same list as dishio/countries.py (the Python server). If you add a
// country, add it in both files.

function country(code, name, currency, locale, defaultBudget, priceExample, speechLangs) {
  return { code, name, currency, locale, defaultBudget, priceExample, speechLangs };
}

const LIST = [
  country("ID", "Indonesia", "IDR", "id-ID", 10000, "Rp25.000", ["id-ID"]),
  country("MY", "Malaysia", "MYR", "ms-MY", 10, "RM12", ["en-MY", "ms-MY"]),
  country("SG", "Singapore", "SGD", "en-SG", 5, "S$6", ["en-SG", "en-GB"]),
  country("PH", "Philippines", "PHP", "en-PH", 150, "₱180", ["en-PH", "fil-PH"]),
  country("TH", "Thailand", "THB", "th-TH", 100, "฿120", ["th-TH"]),
  country("VN", "Vietnam", "VND", "vi-VN", 50000, "60.000 ₫", ["vi-VN"]),
  country("IN", "India", "INR", "en-IN", 150, "₹200", ["en-IN", "hi-IN"]),
  country("JP", "Japan", "JPY", "ja-JP", 800, "¥900", ["ja-JP"]),
  country("KR", "South Korea", "KRW", "ko-KR", 8000, "₩9,000", ["ko-KR"]),
  country("CN", "China", "CNY", "zh-CN", 30, "¥35", ["zh-CN"]),
  country("AU", "Australia", "AUD", "en-AU", 8, "A$10", ["en-AU"]),
  country("NZ", "New Zealand", "NZD", "en-NZ", 8, "NZ$10", ["en-NZ", "en-AU"]),
  country("US", "United States", "USD", "en-US", 5, "$6", ["en-US"]),
  country("CA", "Canada", "CAD", "en-CA", 7, "C$8", ["en-CA", "en-US"]),
  country("GB", "United Kingdom", "GBP", "en-GB", 4, "£5", ["en-GB"]),
  country("DE", "Germany", "EUR", "de-DE", 5, "6 €", ["de-DE"]),
  country("FR", "France", "EUR", "fr-FR", 5, "6 €", ["fr-FR"]),
  country("NL", "Netherlands", "EUR", "nl-NL", 5, "€ 6", ["nl-NL"]),
  country("AE", "United Arab Emirates", "AED", "en-AE", 20, "AED 25", ["en-AE", "ar-AE", "ar-SA"]),
  country("SA", "Saudi Arabia", "SAR", "en-SA", 20, "SAR 25", ["en-SA", "ar-SA"]),
];

export const COUNTRIES = new Map(LIST.map((c) => [c.code, c]));
export const DEFAULT_COUNTRY = "ID";

export function findCountry(code) {
  return typeof code === "string" ? COUNTRIES.get(code.toUpperCase()) || null : null;
}

export function publicCountry(c) {
  return {
    code: c.code,
    name: c.name,
    currency: c.currency,
    locale: c.locale,
    defaultBudget: c.defaultBudget,
    speechLangs: [...c.speechLangs],
  };
}
