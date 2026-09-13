// Shared, deterministic interstellar matter. No network assets or identity data.
const clamp = (v) => Math.max(0, Math.min(1, v))
const mix = (a, b, t) => a + (b - a) * t
function random(index) {
  let h = Math.imul(index ^ 0x6a09e667, 0x45d9f3b)
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16
  return (h >>> 0) / 4294967295
}
import { FLOW, flowAngle, spiralAngle, flowCamera, projectFlowPoint } from './stellar-flow.js'
import { cloudState } from './stellar-cloud.js'
import { stellarSkyPlate, peripheralDustMask } from './stellar-sky.js'

let noiseCache
export function galacticNoise() {
  if (noiseCache) return noiseCache
  const grids = [8, 16, 32, 64, 128, 256].map((n, band) => ({ n,
    data: Float32Array.from({ length: n * n }, (_, i) => random(i + band * 7817)),
  }))
  const sample = (x, y, band) => {
    const { n, data } = grids[band]
    const fx = ((x % 1 + 1) % 1) * n, fy = ((y % 1 + 1) % 1) * n
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const tx = fx - ix, ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const at = (a, b) => data[(b % n) * n + a % n]
    return mix(mix(at(ix, iy), at(ix + 1, iy), sx), mix(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy)
  }
  const size = 512, data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const values = grids.map((_, band) => sample(x / size, y / size, band))
    const p = (y * size + x) * 4
    data[p] = clamp((values[0] * .32 + values[1] * .28 + values[2] * .2 + values[3] * .12 + values[4] * .08 - .25) * 2) * 255
    data[p + 1] = clamp((values[1] * .32 + values[2] * .3 + values[3] * .23 + values[4] * .15 - .25) * 2) * 255
    data[p + 2] = clamp((values[3] * .2 + values[4] * .3 + values[5] * .5 - .28) * 2.4) * 255
    data[p + 3] = 255
  }
  noiseCache = { size, data, sample }
  return noiseCache
}

// Static / Canvas fallback shares the same shape, light and orientation.
export const STELLAR_ART = Object.freeze({ skyTop:'#050506', skyBottom:'#09090b', silver:'#bbcbd0', gold:'#e1d2b1' })
export function onStellarPlateReady() { return () => {} }
export function stellarPlateStatus() { return 'procedural-spiral' }
let fallbackPlate
export function galacticPlate() {
  if (fallbackPlate) return fallbackPlate
  if (typeof document === 'undefined') return null
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')
  if(!ctx?.createImageData)return null
  canvas.width=1024;canvas.height=1024
  const image=ctx.createImageData(1024,1024),noise=galacticNoise()
  const sample=(x,y,c)=>{const ix=((Math.floor(x*512)%512)+512)%512,iy=((Math.floor(y*512)%512)+512)%512;return noise.data[(iy*512+ix)*4+c]/255}
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)}
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
    const px=(x/1024-.5)*6.2,py=(y/1024-.5)*6.2,r=Math.hypot(px,py)/FLOW.radius,theta=Math.atan2(py,px)
    const wx=sample(px*.12+.51,py*.12+.28,0)-.5,wy=sample(px*.12+.51,py*.12+.28,1)-.5
    const n=sample(px*.21+.23+wx*.045,py*.21+.37+wy*.045,0),ng=sample(px*.21+.23+wx*.045,py*.21+.37+wy*.045,1),d=sample(px*.92+.41+wx*.08,py*.92-.19+wy*.08,2)
    const phase=(theta-spiralAngle(r))*2
    const arm=(.5+.5*Math.cos(phase+(n-.5)*1.05))**3.2
    const cloud=(.14+arm*.86*(.73+.27*Math.sin(theta+.8)))*(.22+n*.98)
    const dust=1-(.5+.5*Math.cos(phase+.63+(n-.5)*1.4))**14*.62
    const edge=1-smooth(.77,1.12,r)
    const outer=edge*Math.exp(-r*.85)*smooth(.06,.27,r)
    const density=cloud*(.17+.83*smooth(.18,.82,ng))*dust*(.8+d**3*.43)*outer*.59*2.73
    const core=(Math.exp(-r*r*240)*(.70+d*.30)*.26+Math.exp(-r*r*32)*(.30+n*.38)*.12)*2.73
    const warm=Math.exp(-r*r*5),tints=[mix(.35,.55,warm),mix(.38,.54,warm),mix(.43,.46,warm)]
    const i=(y*1024+x)*4
    for(let c=0;c<3;c++) image.data[i+c]=(1-Math.exp(-(tints[c]*density+[.88,.80,.64][c]*core)*1.35))*255
    image.data[i+3]=255
  }
  ctx.putImageData(image,0,0);fallbackPlate=canvas;return canvas
}
export function drawStellarAtmosphere(context,width,height,seconds=0,strength=1) {
  context.save();context.globalCompositeOperation='source-over';context.globalAlpha=strength
  const plate=stellarSkyPlate(galacticNoise(),width<height)
  if(plate){
    // Match the WebGL background framing, including the portrait side clouds.
    context.drawImage(plate,0,0,width,height)
    if(seconds!==0) {
      const mask=peripheralDustMask(galacticNoise(),width<height,seconds)
      if(mask)context.drawImage(mask,0,0,width,height)
    }
    context.restore();return
  }
  const sky=context.createRadialGradient(width*.53,height*.44,0,width*.53,height*.44,Math.max(width,height)*.72)
  sky.addColorStop(0,'#0c0b0e');sky.addColorStop(.52,'#08080a');sky.addColorStop(1,'#040405')
  context.fillStyle=sky;context.fillRect(0,0,width,height);context.restore()
}
// The fallback evolves a small smooth density mask, not a megapixel noise field
// each frame. Only one cached material and one 96px mask exist per module.
let cloudMaterial
function cloudPlate(plate,seconds) {
  if(!cloudMaterial) {
    const mask=document.createElement('canvas'),canvas=document.createElement('canvas')
    mask.width=96;mask.height=96;canvas.width=plate.width;canvas.height=plate.height
    const maskContext=mask.getContext('2d'),context=canvas.getContext('2d')
    if(!maskContext?.createImageData||!context)return plate
    cloudMaterial={mask,canvas,maskContext,context,image:maskContext.createImageData(96,96),tick:null}
  }
  const m=cloudMaterial,tick=Math.floor(seconds*10)
  if(m.tick===tick)return m.canvas
  for(let y=0;y<96;y++)for(let x=0;x<96;x++) {
    const px=(x/96-.5)*6.2,py=(y/96-.5)*6.2,r=Math.hypot(px,py)/FLOW.radius
    const evolving=clamp((r-.12)/.24),density=cloudState(px,py,tick/10).density
    const value=Math.round(mix(1,Math.min(1,density),evolving*evolving*(3-2*evolving))*255),i=(y*96+x)*4
    m.image.data[i]=value;m.image.data[i+1]=value;m.image.data[i+2]=value;m.image.data[i+3]=255
  }
  m.maskContext.putImageData(m.image,0,0)
  m.context.globalCompositeOperation='copy';m.context.drawImage(plate,0,0)
  m.context.globalCompositeOperation='multiply';m.context.drawImage(m.mask,0,0,m.canvas.width,m.canvas.height)
  m.tick=tick
  return m.canvas
}
export function drawGalacticPlate(context,width,height,{seconds=0,reveal=1,scale=1,personal=false,cloudSeconds=seconds}={}) {
  if(reveal<=0)return false
  const source=galacticPlate();if(!source)return false
  const plate=cloudPlate(source,cloudSeconds)
  const camera=flowCamera(seconds,0,{personal,width,height})
  camera.focal*=scale
  const grid=12,points=[]
  for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++){
    const px=(x/grid-.5)*6.2,py=(y/grid-.5)*6.2
    const a=flowAngle(Math.hypot(px,py)/FLOW.radius,seconds),c=Math.cos(a),sn=Math.sin(a)
    points.push({...projectFlowPoint([px*c-py*sn,px*sn+py*c,0],camera,width,height),u:x/grid*1024,v:y/grid*1024})
  }
  context.save();context.globalCompositeOperation='screen';context.globalAlpha=reveal
  const triangle=(a,b,c)=>{
    const u1=b.u-a.u,v1=b.v-a.v,u2=c.u-a.u,v2=c.v-a.v,det=u1*v2-u2*v1
    const x1=b.x-a.x,y1=b.y-a.y,x2=c.x-a.x,y2=c.y-a.y
    const xx=(x1*v2-x2*v1)/det,yx=(y1*v2-y2*v1)/det,xy=(x2*u1-x1*u2)/det,yy=(y2*u1-y1*u2)/det
    context.save();context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.lineTo(c.x,c.y);context.closePath();context.clip()
    context.transform(xx,yx,xy,yy,a.x-xx*a.u-xy*a.v,a.y-yx*a.u-yy*a.v)
    context.drawImage(plate,0,0);context.restore()
  }
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
    const i=y*(grid+1)+x,a=points[i],b=points[i+1],c=points[i+grid+1],d=points[i+grid+2]
    triangle(a,b,d);triangle(a,d,c)
  }
  context.restore();return true
}
