const DEFAULT_MAX_LONG_EDGE = 1280

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position = gl_VertexID == 0
    ? vec2(-1.0, -1.0)
    : (gl_VertexID == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0));
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uCollapse;
uniform float uCompression;
uniform float uIgnition;
uniform float uBlast;
uniform float uShockVisibility;
uniform float uExposure;
uniform float uTime;

in vec2 vUv;
out vec4 outColor;

float gaussian(float value, float center, float width) {
  float offset = (value - center) / max(width, 0.0001);
  return exp(-offset * offset);
}

float hash21(vec2 value) {
  vec3 fractal = fract(vec3(value.xyx) * 0.1031);
  fractal += dot(fractal, fractal.yzx + 33.33);
  return fract((fractal.x + fractal.y) * fractal.z);
}

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

vec4 sceneAt(vec2 uv) {
  return texture(uScene, clamp(uv, vec2(0.001), vec2(0.999)));
}

void main() {
  // Canvas has a top-left origin. This conversion keeps the post-process
  // registered to the exact collapse point used by the 2D star trajectories.
  vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 metric = vec2((screenUv.x - uCenter.x) * aspect, screenUv.y - uCenter.y);
  float radius = length(metric);
  float angle = atan(metric.y, metric.x);
  vec2 direction = radius > 0.0001 ? metric / radius : vec2(1.0, 0.0);

  float collapse = clamp(uCollapse, 0.0, 1.0);
  float compression = clamp(uCompression, 0.0, 1.0);
  float ignition = clamp(uIgnition, 0.0, 1.0);
  float blast = clamp(uBlast, 0.0, 1.0);
  float shockVisibility = clamp(uShockVisibility, 0.0, 1.0);
  float exposure = clamp(uExposure, 0.0, 1.0);

  // The live galaxy bends into its own centre before ignition. The warp starts
  // at zero displacement, so the first transition frame is tangent to the
  // continuously moving assembly scene instead of cutting to a new plate.
  float pullField = (1.0 - smoothstep(0.045, 0.92, radius)) * collapse;
  float angularTexture = sin(angle * 3.0 + radius * 8.0 - uTime * 0.035) * 0.0028
    + sin(angle * 7.0 - radius * 5.0) * 0.0013;
  float twist = pullField * (0.018 + compression * 0.105) + angularTexture * collapse;
  float sourceRadius = radius * (1.0 + pullField * (0.018 + compression * 0.13));
  vec2 collapsedMetric = rotate2d(twist) * direction * sourceRadius;
  vec2 collapsedUv = uCenter + vec2(collapsedMetric.x / aspect, collapsedMetric.y);
  vec4 source = sceneAt(collapsedUv);

  // The blast front is intentionally anisotropic and mostly refractive. Its
  // discontinuity comes from displaced live pixels, not a perfect glowing ring.
  float shockRadius = mix(0.012, 1.34, pow(blast, 0.74));
  float angularContour = 1.0
    + sin(angle * 3.0 + 0.63) * 0.052
    + sin(angle * 5.0 - 1.17) * 0.031
    + sin(angle * 11.0 + 0.28) * 0.014
    + cos(angle - 0.58) * 0.026;
  float irregularFront = shockRadius * angularContour;
  float shellWidth = mix(0.012, 0.054, blast);
  float shell = gaussian(radius, irregularFront, shellWidth) * shockVisibility;
  float brokenShell = smoothstep(0.30, 0.73,
    0.5
      + sin(angle * 4.0 + radius * 9.0 - uTime * 0.03) * 0.22
      + sin(angle * 9.0 - radius * 5.0 + 0.9) * 0.14);
  vec2 shockUv = collapsedUv + vec2(direction.x / aspect, direction.y)
    * shell * (0.008 + (1.0 - blast) * 0.019);
  vec3 shocked = sceneAt(shockUv).rgb;
  vec3 color = mix(source.rgb, shocked, shell * (0.42 + brokenShell * 0.38));

  // Uneven ejecta and broad polar lobes keep the explosion volumetric. The
  // masks are continuous fields, avoiding bead particles and stock lens flares.
  float insideFront = 1.0 - smoothstep(irregularFront * 0.86, irregularFront, radius);
  float outsideCore = smoothstep(0.009, 0.038 + blast * 0.052, radius);
  float domainWarpA = sin(metric.x * 23.0 + metric.y * 17.0 + angle * 4.0);
  float domainWarpB = sin(metric.y * 31.0 - metric.x * 13.0 - angle * 7.0);
  float filamentSignal = 0.5
    + sin(angle * 17.0 - radius * 46.0 + domainWarpA * 2.1) * 0.2
    + sin(angle * 29.0 + radius * 31.0 + domainWarpB * 1.6 - 0.8) * 0.135
    + sin(angle * 47.0 - radius * 67.0 + uTime * 0.014) * 0.075;
  float filamentExposureGate = 1.0 - smoothstep(0.18, 0.48, exposure);
  float filaments = pow(smoothstep(0.64, 0.86, filamentSignal), 3.1)
    * insideFront * outsideCore * blast * filamentExposureGate;
  float polarLobes = pow(max(0.0, cos(angle - 0.34)), 12.0)
    + pow(max(0.0, cos(angle - 0.34 + 3.14159265)), 9.0);
  polarLobes *= exp(-radius * mix(8.0, 2.0, blast))
    * blast * (1.0 - exposure * 0.72);
  float chromaDirection = direction.x * 0.5 + 0.5;
  vec3 ejectaTint = mix(vec3(0.39, 0.67, 1.0), vec3(1.0, 0.78, 0.48), chromaDirection);
  // High-frequency density only roughens the ejecta; it must not resolve into
  // a ring of bright bead-like droplets at Full HD.
  color += ejectaTint * (filaments * 0.048 + polarLobes * 0.32);
  color += vec3(0.62, 0.79, 1.0) * filaments * brokenShell * 0.014;

  // Compression resolves into a tiny high-temperature source before the main
  // exposure wave. Filmic roll-off retains texture instead of clipping early.
  float compressedRadius = mix(0.012, 0.0038, compression);
  float compressedCore = exp(-pow(radius / compressedRadius, 1.72))
    * compression * (1.0 - blast * 0.82);
  float ignitionRadius = mix(0.008, 0.19, pow(blast, 1.35));
  float ignitionCore = exp(-pow(radius / max(0.003, ignitionRadius), 1.62)) * ignition;
  float bloomRadius = mix(0.024, 0.92, pow(exposure, 0.82));
  float exposureField = exp(-pow(radius / max(0.006, bloomRadius), 1.43)) * exposure;
  color += vec3(0.80, 0.91, 1.0) * compressedCore * 1.25;
  color += vec3(1.0, 0.982, 0.93) * ignitionCore * (0.92 + blast * 1.28);
  color += vec3(0.93, 0.965, 1.0) * exposureField * 1.42;
  vec3 shockTint = mix(
    vec3(0.43, 0.67, 0.94),
    vec3(0.92, 0.79, 0.62),
    brokenShell * 0.28
  );
  color += shockTint * shell * brokenShell * 0.065;

  color = vec3(1.0) - exp(-max(color, vec3(0.0)) * (1.0 + exposure * 0.72));
  float grain = (hash21(gl_FragCoord.xy + uTime * 0.017) - 0.5) / 255.0;
  color += grain * max(max(collapse * 0.32, blast), exposure) * 0.74;
  outColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), source.a);
}
`

function clampDimension(value) {
  return Math.max(2, Math.round(Number.isFinite(value) ? value : 2))
}

export function supernovaRenderDimensions(width, height, maxLongEdge = DEFAULT_MAX_LONG_EDGE) {
  const sourceWidth = clampDimension(width)
  const sourceHeight = clampDimension(height)
  const limit = Math.max(320, Math.round(maxLongEdge))
  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(2, Math.round(sourceWidth * scale)),
    height: Math.max(2, Math.round(sourceHeight * scale)),
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to allocate a stellar-collapse shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) || 'unknown compile error'
    gl.deleteShader(shader)
    throw new Error(`Unable to compile the stellar-collapse shader: ${detail}`)
  }
  return shader
}

function linkProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to allocate a stellar-collapse program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) || 'unknown link error'
    gl.deleteProgram(program)
    throw new Error(`Unable to link the stellar-collapse program: ${detail}`)
  }
  return program
}

function unavailableRenderer(reason, onStatus) {
  onStatus?.({ engine: 'canvas2d-supernova-fallback', reason })
  return {
    get available() { return false },
    prepare() { return false },
    render() { return null },
    destroy() {},
  }
}

export function createStellarCollapseRenderer(options = {}) {
  if (typeof document === 'undefined') {
    return unavailableRenderer('document-unavailable', options.onStatus)
  }

  const sourceCanvas = document.createElement('canvas')
  const outputCanvas = document.createElement('canvas')
  const sourceContext = sourceCanvas.getContext('2d', {
    alpha: true,
    desynchronized: true,
  })
  if (!sourceContext) return unavailableRenderer('staging-context-unavailable', options.onStatus)

  const gl = outputCanvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return unavailableRenderer('webgl2-unavailable', options.onStatus)

  let vertexShader
  let fragmentShader
  let program
  let vertexArray
  let texture
  let uniforms
  let available = true
  let reportedReady = false
  let textureWidth = 0
  let textureHeight = 0

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
    program = linkProgram(gl, vertexShader, fragmentShader)
    vertexArray = gl.createVertexArray()
    texture = gl.createTexture()
    if (!vertexArray || !texture) throw new Error('Unable to allocate stellar-collapse GPU resources')

    gl.useProgram(program)
    gl.bindVertexArray(vertexArray)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    uniforms = {
      scene: gl.getUniformLocation(program, 'uScene'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      center: gl.getUniformLocation(program, 'uCenter'),
      collapse: gl.getUniformLocation(program, 'uCollapse'),
      compression: gl.getUniformLocation(program, 'uCompression'),
      ignition: gl.getUniformLocation(program, 'uIgnition'),
      blast: gl.getUniformLocation(program, 'uBlast'),
      shockVisibility: gl.getUniformLocation(program, 'uShockVisibility'),
      exposure: gl.getUniformLocation(program, 'uExposure'),
      time: gl.getUniformLocation(program, 'uTime'),
    }
    gl.uniform1i(uniforms.scene, 0)
  } catch (error) {
    available = false
    options.onStatus?.({
      engine: 'canvas2d-supernova-fallback',
      reason: error instanceof Error ? error.message : 'webgl2-initialization-failed',
    })
  }

  function resize(sourceWidth, sourceHeight) {
    const next = supernovaRenderDimensions(
      sourceWidth,
      sourceHeight,
      options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE,
    )
    if (next.width === textureWidth && next.height === textureHeight) return
    textureWidth = next.width
    textureHeight = next.height
    sourceCanvas.width = textureWidth
    sourceCanvas.height = textureHeight
    outputCanvas.width = textureWidth
    outputCanvas.height = textureHeight
    gl.viewport(0, 0, textureWidth, textureHeight)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      textureWidth,
      textureHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
  }

  function fail(reason) {
    if (!available) return
    available = false
    options.onStatus?.({ engine: 'canvas2d-supernova-fallback', reason })
  }

  outputCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    fail('webgl2-context-lost')
  })

  return {
    get available() { return available && !gl.isContextLost() },
    prepare(sourceWidth, sourceHeight) {
      if (!available || gl.isContextLost()) return false
      try {
        resize(sourceWidth, sourceHeight)
        return true
      } catch (error) {
        fail(error instanceof Error ? error.message : 'webgl2-prepare-failed')
        return false
      }
    },
    render(sceneCanvas, parameters) {
      if (!available || gl.isContextLost() || !program || !texture || !vertexArray || !uniforms) return null
      try {
        resize(sceneCanvas.width, sceneCanvas.height)
        sourceContext.setTransform(1, 0, 0, 1, 0, 0)
        sourceContext.globalAlpha = 1
        sourceContext.globalCompositeOperation = 'copy'
        sourceContext.drawImage(sceneCanvas, 0, 0, textureWidth, textureHeight)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          sourceCanvas,
        )
        gl.useProgram(program)
        gl.bindVertexArray(vertexArray)
        gl.uniform2f(uniforms.resolution, textureWidth, textureHeight)
        gl.uniform2f(uniforms.center, parameters.centerX, parameters.centerY)
        gl.uniform1f(uniforms.collapse, parameters.collapse ?? 0)
        gl.uniform1f(uniforms.compression, parameters.compression ?? 0)
        gl.uniform1f(uniforms.ignition, parameters.ignition ?? 0)
        gl.uniform1f(uniforms.blast, parameters.blast ?? 0)
        gl.uniform1f(uniforms.shockVisibility, parameters.shockVisibility ?? 0)
        gl.uniform1f(uniforms.exposure, parameters.exposure ?? 0)
        gl.uniform1f(uniforms.time, parameters.time ?? 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.flush()

        if (!reportedReady) {
          reportedReady = true
          options.onStatus?.({ engine: 'webgl2-supernova-postprocess' })
        }
        return outputCanvas
      } catch (error) {
        fail(error instanceof Error ? error.message : 'webgl2-render-failed')
        return null
      }
    },
    destroy() {
      available = false
      if (texture) gl.deleteTexture(texture)
      if (vertexArray) gl.deleteVertexArray(vertexArray)
      if (program) gl.deleteProgram(program)
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      sourceCanvas.width = 2
      sourceCanvas.height = 2
      outputCanvas.width = 2
      outputCanvas.height = 2
    },
  }
}
