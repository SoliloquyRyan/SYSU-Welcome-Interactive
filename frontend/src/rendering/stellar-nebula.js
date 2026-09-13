import { galacticNoise } from './galactic-medium.js'
import { FLOW_GLSL } from './stellar-flow.js'
import { CLOUD_GLSL } from './stellar-cloud.js'
import { stellarSky, PERIPHERAL_DUST_GLSL } from './stellar-sky.js'

const VERTEX = `#version 300 es
out vec2 vUv;
void main(){vec2 p=gl_VertexID==0?vec2(-1.,-1.):(gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.));vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;out vec4 outColor;
uniform sampler2D uNoise,uSky;
uniform vec2 uResolution,uCenter;
uniform vec3 uCamera,uRight,uUp,uForward;
uniform float uTime,uCloudTime,uP,uGain,uFocal,uReveal;
float sat(float x){return clamp(x,0.,1.);}
float ease(float x){x=sat(x);return x*x*x*(x*(x*6.-15.)+10.);}
mat2 rot(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
${FLOW_GLSL}
${CLOUD_GLSL}
${PERIPHERAL_DUST_GLSL}
void main(){
  vec2 screen=vec2(vUv.x,1.-vUv.y);
  vec2 q=vec2((screen.x-uCenter.x)*uResolution.x/uResolution.y,uCenter.y-screen.y);
  vec3 ray=normalize(uForward*uFocal+uRight*q.x+uUp*q.y);
  float collapse=ease((uP-.10)/.47),compression=ease((uP-.476)/.19);
  float scale=exp(-collapse*1.5-compression*3.8);
  // Fit the distant atmospheric frame to both viewports so portrait keeps its
  // side clouds. The foreground galaxy retains its separate perspective camera.
  vec3 color=texture(uSky,screen).rgb*(1.-peripheralDustOpacity(screen,uTime));
  vec3 light=vec3(0.);
  for(int i=0;i<5;i++){
    float layer=float(i)-2.;
    float travel=(layer*.038*scale-uCamera.z)/ray.z;
    if(travel<=0.)continue;
    vec2 xy=(uCamera+ray*travel).xy/max(.0001,scale);
    float r=length(xy)/2.65;
    float edge=1.-smoothstep(.77,1.12,r);
    if(edge<.001)continue;
    xy=rot(-flowAngle(r,uTime)-collapse*1.65-compression*2.)*xy;
    float theta=atan(xy.y,xy.x);
    vec3 weather=cloudState(xy+layer*.045,uCloudTime);
    float evolving=smoothstep(.12,.36,r);
    vec2 drift=weather.xy*evolving;
    vec2 warp=texture(uNoise,xy*.12+vec2(.51,.28)).rg-.5;
    vec3 n=texture(uNoise,xy*.21+vec2(.23,.37)+warp*.045+drift+layer*.009).rgb;
    vec3 detail=texture(uNoise,xy*.92+vec2(.41,-.19)+warp*.08+drift*1.8+layer*.005).rgb;
    float phase=(theta-spiralAngle(r))*2.;
    float arm=pow(.5+.5*cos(phase+(n.r-.5)*1.05),3.2);
    float secondary=.73+.27*sin(theta+.8);
    float cloud=(.14+arm*.86*secondary)*(.22+n.r*.98)*mix(1.,weather.z,evolving);
    float gaps=.17+.83*smoothstep(.18,.82,n.g);
    float dust=1.-pow(.5+.5*cos(phase+.63+(n.r-.5)*1.4),14.)*.62;
    float grain=.80+pow(detail.b,3.)*.43;
    float heightWeight=exp(-layer*layer*.42);
    float outer=edge*exp(-r*.85)*smoothstep(.06,.27,r);
    vec3 tint=mix(vec3(.35,.38,.43),vec3(.55,.54,.46),exp(-r*r*5.));
    light+=tint*cloud*gaps*dust*grain*outer*heightWeight*.59;
    // Compact, textured nucleus; broad glow is deliberately weak.
    float core=exp(-r*r*240.)*(.70+detail.g*.30);
    float bulge=exp(-r*r*32.)*(.30+n.r*.38);
    light+=vec3(.88,.80,.64)*(core*.26+bulge*.12)*heightWeight;
  }
  color+=light*clamp(uGain,.84,1.08)*uReveal;
  if(uP>.59){
    float radius=length(q),angle=atan(q.y,q.x);
    float blast=ease((uP-.619)/.226);
    float eruption=ease((uP-.603)/.078)*(1.-ease((uP-.87)/.13));
    float reach=.006+pow(blast,1.32)*1.12;
    float contour=1.+.19*sin(angle*3.+.6)+.11*cos(angle*5.-1.2);
    float shellRadius=radius/max(.003,reach*contour);
    vec3 turbulent=textureLod(uNoise,q*(2.4/(.16+blast))+vec2(.27,.53),2.8).rgb;
    float interior=exp(-pow(shellRadius,2.3)*1.6);
    float streak=pow(sat(.5+.5*sin(angle*23.-radius*24.+turbulent.r*8.)),8.);
    vec3 tint=mix(vec3(.32,.53,.79),vec3(.87,.68,.45),sat(cos(angle-.5)*.5+.5));
    color+=tint*interior*(.65+turbulent.g*.20+streak*.18)*eruption*.48*smoothstep(.007,.06,radius);
    color+=vec3(1.,.97,.90)*exp(-pow(radius/max(.003,reach*.26),1.55))*eruption*2.3;
  }
  float vignette=1.-smoothstep(.28,.90,length((screen-.5)*vec2(1.,.85)))*.24;
  outColor=vec4((1.-exp(-color*1.35))*vignette,1.);
}`

// The owning surface supplies its one animation clock. This creates no RAF,
// image loads, event replay or business state; a lost context fails once.
export function createStellarNebulaRenderer(onFailure = () => {}, { personal = false } = {}) {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: personal ? 'low-power' : 'high-performance' })
  if (!gl) throw new Error('WebGL2 unavailable')
  const shaders = []
  let program, texture, skyTexture, vao, destroyed = false, failed = false, skyPortrait = personal
  const cleanup = () => {
    if (destroyed) return
    destroyed = true
    canvas.removeEventListener('webglcontextlost', lost)
    if (texture) gl.deleteTexture(texture)
    if (skyTexture) gl.deleteTexture(skyTexture)
    if (vao) gl.deleteVertexArray(vao)
    if (program) gl.deleteProgram(program)
    for (const shader of shaders) gl.deleteShader(shader)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.width = 2; canvas.height = 2
  }
  const lost = event => { event.preventDefault(); if (!failed && !destroyed) { failed = true; onFailure('WebGL context lost') } }
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type); shaders.push(shader)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
    }
    program = gl.createProgram(); shaders.forEach(shader => gl.attachShader(program, shader)); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    texture = gl.createTexture(); vao = gl.createVertexArray()
    const noise = galacticNoise()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, noise.size, noise.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise.data)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    const sky=stellarSky(noise,personal)
    skyTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,skyTexture)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,sky.size,sky.size,0,gl.RGBA,gl.UNSIGNED_BYTE,sky.data)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    canvas.addEventListener('webglcontextlost', lost)
  } catch (error) { cleanup(); throw error }
  const uniforms = Object.fromEntries(['Noise','Sky','Resolution','Camera','Right','Up','Forward','Center','Time','CloudTime','P','Gain','Focal','Reveal']
    .map(k => [k, gl.getUniformLocation(program, `u${k}`)]))
  return {
    canvas,
    draw(camera, seconds, width, height, gain = 1, reveal = 1, cloudSeconds = seconds) {
      if (destroyed || failed || gl.isContextLost()) return null
      // Full HD detail for the stage, bounded mobile fill cost at native CSS
      // density. The visible star cores remain on the full-resolution canvas.
      const ratio = Math.min(1, (personal ? 1000 : 1920) / Math.max(width, height))
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h) }
      gl.useProgram(program); gl.bindVertexArray(vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,skyTexture);gl.uniform1i(uniforms.Sky,1)
      if (skyPortrait !== (height > width)) {
        const sky = stellarSky(galacticNoise(), height > width)
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,sky.size,sky.size,0,gl.RGBA,gl.UNSIGNED_BYTE,sky.data)
        gl.generateMipmap(gl.TEXTURE_2D); skyPortrait = height > width
      }
      gl.uniform1i(uniforms.Noise, 0); gl.uniform2f(uniforms.Resolution, w, h)
      gl.uniform3fv(uniforms.Camera, camera.position); gl.uniform3fv(uniforms.Right, camera.right)
      gl.uniform3fv(uniforms.Up, camera.up); gl.uniform3fv(uniforms.Forward, camera.forward)
      gl.uniform2fv(uniforms.Center, camera.center); gl.uniform1f(uniforms.Time, seconds)
      gl.uniform1f(uniforms.CloudTime, cloudSeconds)
      gl.uniform1f(uniforms.P, camera.p); gl.uniform1f(uniforms.Gain, gain)
      gl.uniform1f(uniforms.Focal, camera.focal); gl.uniform1f(uniforms.Reveal, reveal)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return canvas
    },
    loseContext() { gl.getExtension('WEBGL_lose_context')?.loseContext() },
    destroy: cleanup,
  }
}
