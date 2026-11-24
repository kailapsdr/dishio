// Small line icons used across the app (24×24, drawn with currentColor).

const svg = (body, { fill = false } = {}) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" ` +
  (fill
    ? `fill="currentColor">`
    : `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`) +
  body +
  `</svg>`;

export const ICONS = {
  // Cooking pot on a gas burner, with three wisps of steam (loading screen).
  // Steam and flame are animated in CSS.
  pot:
    '<svg viewBox="0 0 120 142" width="1em" height="1.18em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path class="steam s1" d="M44 38c-6-7 6-11 0-18"/>' +
    '<path class="steam s2" d="M60 34c-6-7 6-11 0-18"/>' +
    '<path class="steam s3" d="M76 38c-6-7 6-11 0-18"/>' +
    '<path d="M22 56h76"/><path d="M12 56h10M98 56h10"/>' +
    '<path d="M26 56v28a14 14 0 0 0 14 14h40a14 14 0 0 0 14-14V56"/>' +
    '<path d="M52 49h16"/>' +
    '<g class="flame f1"><path d="M40 109c4 5 6.5 8.5 6.5 12a6.5 6.5 0 0 1-13 0c0-3.5 2.5-7 6.5-12Z" fill="#c2391f" stroke="none"/>' +
    '<path d="M40 116.5c2.5 3 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-7Z" fill="#e1a23a" stroke="none"/></g>' +
    '<g class="flame f2"><path d="M60 109c4 5 6.5 8.5 6.5 12a6.5 6.5 0 0 1-13 0c0-3.5 2.5-7 6.5-12Z" fill="#c2391f" stroke="none"/>' +
    '<path d="M60 116.5c2.5 3 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-7Z" fill="#e1a23a" stroke="none"/></g>' +
    '<g class="flame f3"><path d="M80 109c4 5 6.5 8.5 6.5 12a6.5 6.5 0 0 1-13 0c0-3.5 2.5-7 6.5-12Z" fill="#c2391f" stroke="none"/>' +
    '<path d="M80 116.5c2.5 3 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-7Z" fill="#e1a23a" stroke="none"/></g>' +
    '<path d="M30 134h60" stroke-width="5"/>' +
    "</svg>",

  // Place setting for the empty state.
  fork:
    '<svg viewBox="0 0 24 70" width="0.34em" height="1em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v15a7 7 0 0 0 14 0V3"/><path d="M12 3v15"/><path d="M12 25v40"/></svg>',
  spoon:
    '<svg viewBox="0 0 24 70" width="0.34em" height="1em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="7.5" ry="11"/><path d="M12 25v40"/></svg>',

  // My fridge
  fridge: svg('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M5 9.5h14"/><path d="M8.5 5.5v1.5"/><path d="M8.5 12.5v3"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),

  // Recipes
  heart: svg('<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.8 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.2 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z"/>'),
  swap: svg('<path d="M4 8h13"/><path d="M14 4.5L17.5 8 14 11.5"/><path d="M20 16H7"/><path d="M10 12.5L6.5 16l3.5 3.5"/>'),

  // Situation chips
  none: svg('<path d="M12 3l2.2 5.6L20 9.3l-4.4 3.9 1.3 5.8L12 16l-4.9 3 1.3-5.8L4 9.3l5.8-.7Z"/>'),
  riceCooker: svg(
    '<path d="M4 11h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M5 11a7 4 0 0 1 14 0"/><path d="M12 5V3.5"/><circle cx="12" cy="16" r="1.4"/>'
  ),
  wallet: svg(
    '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M4 7l11-3.5V7"/><path d="M15 13.5h2"/>'
  ),
  noStove: svg(
    '<path d="M12 21c-3.3 0-5.5-2.2-5.5-5 0-2.3 1.4-3.8 2.6-5.2.4 1.7 1.4 2.6 2.4 2.6-.7-2.7.4-5.1 2.4-6.4 0 2.7 4.1 4.5 4.1 8.7 0 3-2.4 5.3-6 5.3Z"/><path d="M3 3l18 18"/>'
  ),
  logo: svg(
    '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 3.5c-.8 1 .8 2 0 3"/><path d="M12 2.5c-.8 1 .8 2 0 3"/><path d="M15 3.5c-.8 1 .8 2 0 3"/><path d="M9 21h6"/>'
  ),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  dining: svg(
    '<path d="M7 3v8"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>'
  ),
  coins: svg(
    '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>'
  ),
  error: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/>'),
  speaker: svg(
    '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'
  ),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', {
    fill: true,
  }),
  play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z"/>', { fill: true }),
  stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', { fill: true }),
};
