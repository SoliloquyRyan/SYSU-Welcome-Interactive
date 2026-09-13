// Local cloud evolution in co-moving disk coordinates. Different patches thin
// and gather at different times; the arm skeleton and participant slots persist.
export function cloudState(x, y, seconds) {
  const a = x * 1.65 - y * 1.12 + seconds * .24
  const b = x * .76 + y * 1.84 - seconds * .19
  const vapor = .5 + .5 * Math.sin(a + .7 * Math.sin(b))
  const t = Math.max(0, Math.min(1, (vapor - .12) / .80))
  return {
    density: .40 + .80 * t * t * (3 - 2 * t),
    x: .040 * Math.sin(b) + .018 * Math.sin(a * .63 + b),
    y: .038 * Math.cos(a) + .016 * Math.sin(b * .71 - a),
  }
}

// xy = bounded turbulent displacement; z = local density. Material evolution
// is independent of the camera and orbital time, allowing a fixed-pose audit.
export const CLOUD_GLSL = `
vec3 cloudState(vec2 xy,float seconds){
  float a=xy.x*1.65-xy.y*1.12+seconds*.24;
  float b=xy.x*.76+xy.y*1.84-seconds*.19;
  float vapor=.5+.5*sin(a+.7*sin(b));
  return vec3(.040*sin(b)+.018*sin(a*.63+b),
    .038*cos(a)+.016*sin(b*.71-a),.40+.80*smoothstep(.12,.92,vapor));
}`
