// Presentation only. Program identity, star ownership and phase stay server-owned.
export const STAR_CITY_THEMES = Object.freeze({
  program: { id: 'program', accent: '#c1b9f4', secondary: '#a9dbea', haze: '#74688f', label: '雾紫星城' },
  host: { id: 'host', accent: '#b2d6ed', secondary: '#c7c0e3', haze: '#647e99', label: '雾蓝新程' },
  interaction: { id: 'interaction', accent: '#a3e0df', secondary: '#cbc0f6', haze: '#647f91', label: '星光共振' },
  award: { id: 'award', accent: '#edd2a6', secondary: '#d4b8e8', haze: '#8e748d', label: '荣光时刻' },
})
export function starCityTheme({ program, stage, presentation, liveInteraction } = {}) {
  if (presentation?.type === 'RAFFLE' || (liveInteraction?.phase && liveInteraction.phase !== 'IDLE')) return STAR_CITY_THEMES.interaction
  if (stage?.mode === 'AWARD' || program?.kind === 'AWARD') return STAR_CITY_THEMES.award
  if (stage?.mode === 'HOST' || program?.kind === 'SPEECH') return STAR_CITY_THEMES.host
  if (program && ['INTERLUDE', 'DEFERRED'].includes(program.kind)) return STAR_CITY_THEMES.interaction
  return STAR_CITY_THEMES.program
}
export function starCityStyle(theme = STAR_CITY_THEMES.program) {
  return { '--city-accent': theme.accent, '--city-secondary': theme.secondary, '--city-haze': theme.haze }
}

// Stable catalog IDs, deliberately independent of editable titles and ordering.
export const PROGRAM_BACKGROUNDS = Object.freeze({
  'event2026-03': 'lyric', 'event2026-06': 'lyric', 'event2026-09': 'lyric',
  'event2026-12': 'lyric', 'event2026-16': 'lyric', 'event2026-20': 'lyric',
  'event2026-04': 'rhythm', 'event2026-22': 'rhythm',
  'event2026-02': 'instrumental', 'event2026-08': 'instrumental',
})
export function programBackground(program, stage) {
  return stage?.mode && stage.mode !== 'PROGRAM' ? 'theme' : PROGRAM_BACKGROUNDS[program?.id] ?? 'theme'
}
