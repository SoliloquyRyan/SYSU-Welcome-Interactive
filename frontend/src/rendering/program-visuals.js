// D-105: presentation presets only. Titles and credits always come from the server.
// D-106: convex empty-sky / mist regions in the 1672 × 941 source artwork.
// Project through background-size: cover before placing stars.
export const ART_SKY_REGIONS = Object.freeze({
  'night-flight': [[[.10,.035],[.94,.035],[.85,.36],[.72,.49],[.43,.61],[.20,.45],[.10,.24]]],
  haunted: [[[.38,.035],[.65,.035],[.70,.59],[.34,.59]]],
  'worth-it': [[[.44,.035],[.94,.035],[.94,.47],[.76,.45],[.55,.25]]],
  rooftops: [[[.13,.035],[.96,.035],[.92,.49],[.62,.55],[.27,.52],[.13,.40]]],
  summer: [[[.23,.035],[.55,.035],[.55,.39],[.39,.44],[.23,.33]]],
  'rain-window': [[[.27,.035],[.95,.035],[.90,.46],[.60,.52],[.36,.38]]],
  'mountain-city': [[[.055,.035],[.94,.035],[.93,.20],[.67,.29],[.46,.35],[.23,.41],[.055,.30]]],
  'glass-dialogue': [[[.49,.035],[.88,.035],[.88,.31],[.73,.59],[.49,.57]]],
  'rose-arcade': [[[.16,.035],[.52,.035],[.51,.25],[.39,.42],[.26,.36],[.16,.24]]],
  'light-years': [[[.12,.035],[.81,.035],[.82,.53],[.64,.59],[.35,.57],[.12,.41]]],
})
const collegeArea = { x: .03, y: .035, w: .27, h: .11 }
// D-115: every transient program cue uses one predictable lower-left safe zone.
// Keeping the safe area in the visual preset also keeps gift/barrage protection
// aligned with the rendered cue instead of relying on CSS defaults alone.
const cueArea = () => ({ x: .06, y: .53, w: .56, h: .35 })
const titleArea = layout => ({ x: layout === 'left' ? .12 : layout === 'right' ? .47 : .20, y: .30, w: layout === 'center' ? .60 : layout === 'left' ? .45 : .41, h: .48 })
const preset = (id, art, genre, font, layout, accent, secondary, strength, extras = {}) => Object.freeze({
  id, art, genre, font, layout, accent, secondary, strength,
  mode: art ? 'background' : 'overlay',
  skyRegions: ART_SKY_REGIONS[art] ?? ART_SKY_REGIONS['night-flight'],
  // Faint video stars may cover the picture; bright gifts still use subject masks.
  // Overlay stars stay distributed over the video frame.  The transient cue
  // remains a protected gift area below; faint stars may pass behind it so a
  // video scene does not develop a visibly empty lower-left quadrant.
  overlayUIAreas: [collegeArea, { x: .80, y: .79, w: .19, h: .20 }],
  backgroundUIAreas: [collegeArea, art ? titleArea(layout) : cueArea(id)],
  protectedAreas: [collegeArea, ...(art ? [titleArea(layout)] : [...(MEDIA_PROTECTION[id] ?? []), cueArea(id)])],
  cue: !art ? { x: .06, y: .53, w: .56, bottom: .12 } : null,
  ...extras,
})

// Reviewed first/middle/end frames of the local OBS files (D-105 media index).
// These masks cover original credits, lyrics and broad moving subject regions.
const MEDIA_PROTECTION = {
  'event2026-01': [{ x: .14, y: .24, w: .72, h: .66 }],
  'event2026-05': [{ x: .15, y: .09, w: .73, h: .86 }],
  'event2026-10': [{ x: .035, y: .72, w: .66, h: .18 }],
  'event2026-11': [{ x: .13, y: .04, w: .74, h: .94 }],
  'event2026-13': [{ x: .08, y: .24, w: .82, h: .61 }],
  'event2026-15': [{ x: .025, y: .31, w: .95, h: .33 }],
  'event2026-17': [{ x: .01, y: .04, w: .97, h: .70 }],
  'event2026-18': [{ x: .15, y: .30, w: .69, h: .53 }],
  'event2026-19': [{ x: .055, y: .15, w: .86, h: .73 }],
}

export const PROGRAM_VISUALS = Object.freeze({
  'event2026-01': preset('event2026-01', null, '舞蹈', 'tech', 'left', '#b6b9d0', '#c8adb9', .55),
  'event2026-02': preset('event2026-02', 'haunted', '吉他弹唱', 'tech', 'center', '#b6c1d2', '#bcaec8', .55),
  'event2026-03': preset('event2026-03', 'night-flight', '演唱', 'cut', 'center', '#b8c2d1', '#c5b3c6', .65),
  'event2026-04': preset('event2026-04', 'worth-it', '舞蹈', 'tech', 'right', '#aebfc9', '#c2abbc', 1),
  'event2026-05': preset('event2026-05', null, '演唱', 'retro', 'left', '#c7bcae', '#aeb9c7', .4),
  'event2026-06': preset('event2026-06', 'rooftops', '演唱', 'cut', 'left', '#b8c4d0', '#c8b7bd', .65),
  'event2026-08': preset('event2026-08', 'summer', '钢琴独奏', 'retro', 'left', '#c5c3ba', '#b4bfce', .5),
  'event2026-09': preset('event2026-09', 'rain-window', '演唱', 'retro', 'right', '#bcb4c9', '#bcc7d0', .55),
  'event2026-10': preset('event2026-10', null, '声乐合唱', 'retro', 'left', '#c3b4bf', '#b5becd', .4),
  'event2026-11': preset('event2026-11', null, '演唱', 'cut', 'left', '#bcc9c0', '#c8b6b3', .4),
  'event2026-12': preset('event2026-12', 'mountain-city', '演唱', 'retro', 'center', '#c0b8c7', '#b3bdc9', .55),
  'event2026-13': preset('event2026-13', null, '舞蹈', 'tech', 'left', '#b4c5cc', '#c5b8cf', .55),
  'event2026-15': preset('event2026-15', null, '演唱', 'retro', 'left', '#c5b8aa', '#b9aabd', .4),
  'event2026-16': preset('event2026-16', 'glass-dialogue', '演唱', 'cut', 'right', '#bcb7d0', '#b2c5cb', .6),
  'event2026-17': preset('event2026-17', null, '演唱', 'cut', 'left', '#bdb8cd', '#cbbbaa', .45),
  'event2026-18': preset('event2026-18', null, '舞蹈', 'tech', 'left', '#afc3cc', '#c1b0c9', .6),
  'event2026-19': preset('event2026-19', null, '演唱', 'retro', 'left', '#b1bac9', '#c2b6a7', .4),
  'event2026-20': preset('event2026-20', 'rose-arcade', '演唱', 'retro', 'left', '#c5aeb7', '#bcb8c8', .6),
  'event2026-22': preset('event2026-22', 'light-years', '乐队表演', 'cut', 'center', '#aec3d1', '#c4b9cb', 1),
})

export const DEFAULT_PROGRAM_VISUAL = preset('theme', 'theme', '', 'cut', 'center', '#bdc0d0', '#c8b9c8', .5)
export function programVisual(program, stage) {
  if (stage?.mode && stage.mode !== 'PROGRAM') return DEFAULT_PROGRAM_VISUAL
  return PROGRAM_VISUALS[program?.id] ?? DEFAULT_PROGRAM_VISUAL
}
export function hasProgramArtwork(program) { return Boolean((PROGRAM_VISUALS[program?.id] ?? DEFAULT_PROGRAM_VISUAL).art) }
export function persistentProgramCredits(program, stage) {
  return program?.kind === 'PERFORMANCE' && (!stage?.mode || stage.mode === 'PROGRAM') && hasProgramArtwork(program)
}
export function programVisualStyle(visual = DEFAULT_PROGRAM_VISUAL) {
  return { '--program-accent': visual.accent, '--program-secondary': visual.secondary, '--program-music-strength': visual.strength,
    ...(visual.cue ? { '--cue-x': visual.cue.x * 100 + '%', '--cue-y': visual.cue.bottom ? 'auto' : visual.cue.y * 100 + '%', '--cue-bottom': visual.cue.bottom ? visual.cue.bottom * 100 + '%' : 'auto', '--cue-width': visual.cue.w * 100 + '%' } : {}) }
}
