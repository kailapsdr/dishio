// "Read the steps": reads cooking steps aloud with the browser's own voices
// (Web Speech API). No key, no server needed.
//
// The voice follows the country the user picked ("Where do you live?"):
//   1. an English voice from that country, if the device has one (e.g. en-IN),
//   2. otherwise a voice in the local language (e.g. id-ID for Indonesia),
//      which reads the English steps with a local accent,
//   3. otherwise any English voice.
// Which voices exist depends on the browser and the device.
//
// Each step is spoken separately so the app knows which step is being read.
// "Pause" stops at the current step and "Resume" starts that step again.
// This behaves the same in every browser (built-in pause/resume is
// unreliable on Android).

export const speechSupported =
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

/** "id_ID" / "in-ID" (old Android code) / "ID-id" -> "id-id" */
function normalizeLang(lang) {
  const value = String(lang || "").replace(/_/g, "-").toLowerCase();
  return value.startsWith("in-") || value === "in" ? "id" + value.slice(2) : value;
}

/**
 * Pick the best voice for a list of preferred languages (best first).
 * Exported so it can be tested on its own.
 */
export function pickVoice(voices, preferredLangs = [], fallbackLang = "en-US") {
  const list = voices.map((voice) => ({ voice, lang: normalizeLang(voice.lang) }));
  const wanted = preferredLangs.map(normalizeLang);

  // 1. Exact language + region, in order of preference.
  for (const lang of wanted) {
    const hit = list.find((v) => v.lang === lang);
    if (hit) return hit.voice;
  }
  // 2. Same local language in another region (e.g. zh-TW for zh-CN).
  //    English is skipped here: "any English" is the last resort below.
  for (const lang of wanted) {
    const base = lang.split("-")[0];
    if (base === "en") continue;
    const hit = list.find((v) => v.lang.split("-")[0] === base);
    if (hit) return hit.voice;
  }
  // 3. Fallback English voice, then any English voice.
  const fallback = normalizeLang(fallbackLang);
  const hit =
    list.find((v) => v.lang === fallback) || list.find((v) => v.lang.startsWith("en"));
  return hit ? hit.voice : null;
}

/** Chrome loads its voice list a moment after the page opens. */
function loadVoices(timeoutMs = 1500) {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener("voiceschanged", done);
  });
}

export class StepReader {
  /**
   * @param {object} opts
   * @param {string[]} [opts.langs]  preferred voice languages, best first
   * @param {string} [opts.fallbackLang]  used when none of `langs` is available
   * @param {(index:number) => void} [opts.onStep]  called when a step starts (-1 when done)
   * @param {(state:"idle"|"speaking"|"paused") => void} [opts.onStateChange]
   */
  constructor({ langs = [], fallbackLang = "en-US", onStep = () => {}, onStateChange = () => {} } = {}) {
    this.langs = langs;
    this.fallbackLang = fallbackLang;
    this.onStep = onStep;
    this.onStateChange = onStateChange;
    this.steps = [];
    this.index = 0;
    this.state = "idle";
    this.voice = null;
    this._token = 0;
  }

  async start(steps) {
    if (!speechSupported || !steps.length) return;
    this._cancelSpeech();
    this.steps = steps;
    this.index = 0;
    this._setState("speaking");
    const token = this._token;
    const voices = await loadVoices();
    if (token !== this._token || this.state !== "speaking") return; // stopped meanwhile
    this.voice = pickVoice(voices, this.langs, this.fallbackLang);
    this._speakCurrent();
  }

  pause() {
    if (this.state !== "speaking") return;
    this._cancelSpeech();
    this._setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    this._setState("speaking");
    this._speakCurrent();
  }

  stop() {
    if (this.state === "idle") return;
    this._cancelSpeech();
    this.index = 0;
    this._setState("idle");
    this.onStep(-1);
  }

  _speakCurrent() {
    if (this.index >= this.steps.length) {
      this.stop();
      return;
    }
    if (!this.voice) {
      this.voice = pickVoice(window.speechSynthesis.getVoices(), this.langs, this.fallbackLang);
    }
    const token = ++this._token;
    const utterance = new SpeechSynthesisUtterance(this.steps[this.index]);
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    } else {
      utterance.lang = this.langs[0] || this.fallbackLang;
    }
    utterance.rate = 0.95;

    utterance.onend = () => {
      if (token !== this._token || this.state !== "speaking") return;
      this.index += 1;
      this._speakCurrent();
    };
    utterance.onerror = (event) => {
      if (token !== this._token) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      this.stop();
    };

    this.onStep(this.index);
    window.speechSynthesis.speak(utterance);
  }

  _cancelSpeech() {
    this._token += 1; // ignore events from the utterance being cancelled
    if (speechSupported) window.speechSynthesis.cancel();
  }

  _setState(state) {
    this.state = state;
    this.onStateChange(state);
  }
}
