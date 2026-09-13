// A distant, low-contrast environment underneath the moving galaxy. Generated
// once, with no image request, participant data or extra animation loop.
const clamp = value => Math.max(0, Math.min(1, value))
function grain(index) {
  let h=Math.imul(index^0x6d2b79f5,0x45d9f3b)
  h^=h>>>16;h=Math.imul(h,0x45d9f3b);h^=h>>>16
  return (h>>>0)/4294967295
}
const cached=[]
export function stellarSky(noise,portrait=false) {
  const key=portrait?1:0
  if(cached[key])return cached[key]
  const size=1024,data=new Uint8Array(size*size*4)
  // Neutral black occupies the frame. Colour belongs to a few distant patches,
  // rather than tinting the entire sky blue, including on the portrait crop.
  const floor=[.013,.013,.015],lift=[.012,.012,.013]
  const silver=[.014,.014,.016]
  // Distant colour frames the galaxy; it must not trace or tint its moving arms.
  const warm=[.133,.084,.040],violet=[.167,.063,.215],cyan=[.027,.119,.153]
  const rimColor=[.080,.087,.098],edgeColor=[.040,.046,.057]
  const shadow=[.008,.008,.010],dustColor=[.91,.92,1]
  const depthColor=[.030,.035,.042],clusterColor=[.036,.038,.043]
  const aspect=portrait?.46:1.94
  // Unresolved distant associations are material grain, never participant stars.
  const groups=[[.13,.25,.035,.85],[.93,.38,.022,.80],[.24,.91,.036,.65],[.89,.79,.024,.65]]
  const sample=(x,y,c)=>{
    const fx=((x%1+1)%1)*noise.size,fy=((y%1+1)%1)*noise.size
    const ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy
    const at=(a,b)=>noise.data[((b%noise.size)*noise.size+a%noise.size)*4+c]/255
    const top=at(ix,iy)*(1-tx)+at(ix+1,iy)*tx
    const bottom=at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx
    return top*(1-ty)+bottom*ty
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,dx=u-.56,dy=v-.43
    const materialU=portrait?(u-.5)*.28+.5:u
    const along=dx*.88-dy*.48,across=dx*.48+dy*.88
    const n=sample(u*.67+.19,v*.67+.31,0)
    const lace=sample(u*1.23+.41+(n-.5)*.12,v*1.23+.13,1)
    const wide=Math.exp(-((across-(n-.5)*.22)**2)*22-along*along*2.5)
    const veil=wide*(.20+Math.pow(lace,1.6)*.80)
    // Break the distant wash into soft, irregular veils and dark openings.
    // These cached fields stay outside the moving disk and use unrelated detail.
    const driftX=sample(materialU*.71+.12,v*.63+.42,0)-.5
    const driftY=sample(materialU*.67+.58,v*.79+.16,1)-.5
    const farU=u+driftX*.15,farV=v+driftY*.085
    const cloudU=materialU+driftX*.15
    const mist=sample(cloudU*.92+.57,farV*.88+.23,0)
    const fold=sample(cloudU*1.63+.16,farV*1.42+.61,1)
    const fine=sample(cloudU*2.7+.38,farV*2.3+.18,0)
    const density=clamp((mist*.60+fold*.30+fine*.10-.20)/.66)
    const dust=clamp((fold-.54)*2.8)*clamp((mist-.38)*2.2)
    const air=(.10+.90*Math.pow(density,1.25))*(1.-dust*.62)
    const plum=Math.exp(-((farU-.28)**2*22+(farV-.17)**2*60))
    const ice=Math.exp(-((farU-.77)**2*20+(farV-.91)**2*65))
    const pearl=Math.exp(-((farU-.69)**2*38+(farV-.065)**2*95))
    // A broken, neutral dust field surrounds all four sides; its centre stays open.
    const borderDistance=Math.max(Math.abs(farU-.5),Math.abs(farV-.5))*2
    const perimeter=Math.pow(clamp((borderDistance-.42)/.58),1.65)
    // Broken silver edges imply illuminated gas around darker dust pockets.
    // Only one facing side is lit; these are soft rims, not closed contour lines.
    const upstream=sample((cloudU-.012)*.92+.57,(farV+.009)*.88+.23,0)
    const facing=clamp((mist-upstream)*9.+.035)
    const rim=Math.pow(clamp((density-.12)/.65),.8)*facing*(.25+fine*.75)
      *Math.max(plum,ice,pearl,perimeter*.65)*(1.-dust*.45)
    const space=Math.exp(-(dx*dx*2.1+dy*dy*3.8))
    const shade=Math.pow(clamp((.52-lace)*1.8),2)*wide
    const random=grain(y*size+x),dither=(random-.5)*.0028
    // A second, softer gas sheet sits behind the near dust; extinction, not
    // extra glow, separates their depths and leaves the central stage clear.
    const backMist=sample(materialU*.53+.29,v*.61+.77,0)
    const backDetail=sample(materialU*1.19+.81,v*1.37+.32,1)
    const backVeil=Math.pow(clamp((backMist*.68+backDetail*.32-.30)/.58),1.6)*perimeter
    const transmission=Math.exp(-(density*.85+dust*1.65)*perimeter)
    let cluster=0
    for(const [cx,cy,radius,weight] of groups){
      const gx=(u-cx)*aspect/radius,gy=(v-cy)/radius
      if(Math.abs(gx)<3&&Math.abs(gy)<3)cluster+=Math.exp(-(gx*gx+gy*gy)*1.6)*weight
    }
    cluster*=.45+backDetail*.55
    // Distant pinpoints are tiny, neutral, irregular and dimmed by foreground
    // dust. They have no labels, public IDs, flares, animation or count semantics.
    const chance=.00055+perimeter*.00045+cluster*.014
    const fleck=random>1-chance ? (.04+grain(x*53+y*971)*.08)*transmission : 0
    const i=(y*size+x)*4
    for(let c=0;c<3;c++)data[i+c]=Math.round(clamp(
      floor[c]+(lift[c]*space+silver[c]*veil)*(1.-dust*perimeter*.25)
      +(depthColor[c]*backVeil+clusterColor[c]*cluster)*transmission
      +(warm[c]*pearl+violet[c]*plum+cyan[c]*ice+edgeColor[c]*perimeter)*air*.56
      +rimColor[c]*rim*.42-shadow[c]*shade+dither+fleck*dustColor[c])*255)
    data[i+3]=255
  }
  cached[key]={size,data};return cached[key]
}

const exposedPlates=[]
export function stellarSkyPlate(noise,portrait=false) {
  const key=portrait?1:0
  if(exposedPlates[key])return exposedPlates[key]
  if(typeof document==='undefined')return null
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')
  if(!ctx?.createImageData)return null
  const sky=stellarSky(noise,portrait);canvas.width=sky.size;canvas.height=sky.size
  const pixels=ctx.createImageData(sky.size,sky.size)
  for(let i=0;i<sky.data.length;i+=4){
    for(let c=0;c<3;c++)pixels.data[i+c]=Math.round((1-Math.exp(-sky.data[i+c]/255*1.35))*255)
    pixels.data[i+3]=255
  }
  ctx.putImageData(pixels,0,0);exposedPlates[key]=canvas;return canvas
}

// A faint, advected extinction veil; distant specks stay in place. The owner
// supplies elapsed time, so zero/reduced, pause and hidden states need no timer.
// Compare with the initial field to preserve the accepted still exactly at t=0.
export function peripheralDustOpacity(noise,u,v,seconds,portrait=false) {
  const edge=clamp((Math.max(Math.abs(u-.5),Math.abs(v-.5))*2-.42)/.52)
  if(edge===0||seconds===0)return 0
  const materialU=portrait?(u-.5)*.28+.5:u
  const x=materialU*.92+.57,y=v*.88+.23
  const dx=.036*(Math.sin(seconds*.058+v*5.7)-Math.sin(v*5.7))
  const dy=.027*(Math.sin(seconds*.043-u*6.1)-Math.sin(-u*6.1))
  const sample=(px,py,c)=>{
    const fx=((px%1+1)%1)*noise.size,fy=((py%1+1)%1)*noise.size
    const ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy
    const at=(a,b)=>noise.data[((b%noise.size)*noise.size+a%noise.size)*4+c]/255
    return (at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)
      +(at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty
  }
  const density=(px,py)=>sample(px,py,0)*.72+sample(px,py,1)*.28
  return Math.min(.14,Math.max(0,density(x+dx,y+dy)-density(x,y))*.34)*edge*edge*(3-2*edge)
}

export const PERIPHERAL_DUST_GLSL = `
float peripheralDustOpacity(vec2 uv,float seconds){
  float edge=smoothstep(.42,.94,max(abs(uv.x-.5),abs(uv.y-.5))*2.);
  if(edge==0.||seconds==0.)return 0.;
  float materialU=uResolution.y>uResolution.x?(uv.x-.5)*.28+.5:uv.x;
  vec2 p=vec2(materialU*.92+.57,uv.y*.88+.23)+vec2(.5/512.);
  vec2 drift=vec2(.036*(sin(seconds*.058+uv.y*5.7)-sin(uv.y*5.7)),
    .027*(sin(seconds*.043-uv.x*6.1)-sin(-uv.x*6.1)));
  float initial=dot(textureLod(uNoise,p,0.).rg,vec2(.72,.28));
  float passing=dot(textureLod(uNoise,p+drift,0.).rg,vec2(.72,.28));
  return min(.14,max(0.,passing-initial)*.34)*edge;
}`

// Two bounded, small masks cover both orientations. Only the fallback needs
// them; update at 12 Hz inside the existing renderer, without rerasterizing sky.
const dustMasks=[]
export function peripheralDustMask(noise,portrait,seconds) {
  const key=portrait?1:0
  if(!dustMasks[key]) {
    if(typeof document==='undefined')return null
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d')
    if(!context?.createImageData)return null
    canvas.width=128;canvas.height=128
    dustMasks[key]={canvas,context,image:context.createImageData(128,128),tick:null}
  }
  const mask=dustMasks[key],tick=Math.floor(seconds*12)
  if(mask.tick!==tick) {
    for(let y=0;y<128;y++)for(let x=0;x<128;x++)
      mask.image.data[(y*128+x)*4+3]=Math.round(peripheralDustOpacity(noise,(x+.5)/128,(y+.5)/128,tick/12,portrait)*255)
    mask.context.putImageData(mask.image,0,0);mask.tick=tick
  }
  return mask.canvas
}
