// Canvas and WebGL cannot consume CSS custom properties directly. Keep their
// source colours in one JS object; tokens.css exposes the same values to DOM UI.
export const ORBITAL_SIGNAL_PALETTE = Object.freeze({
  midnight: '#01030a',
  deep: '#07101f',
  signal: '#427eee',
  signalSoft: '#7eb0ff',
  cyan: '#4adbe9',
  star: '#eef4ff',
  warm: '#ffd79a',
})
