export const BARRAGE_COLORS = Object.freeze([
  { id:'white', name:'星白', paint:'#eef6ff', cost:0 },
  { id:'warm', name:'暖红', paint:'#ffb6a3', cost:0 },
  { id:'gold', name:'日光', paint:'#ffe3ad', cost:0 },
  { id:'blue', name:'冷蓝', paint:'#9bd4ff', cost:0 },
  { id:'aurora', name:'极光', paint:'linear-gradient(100deg,#a4ffdf,#9dd6ff,#deb8ff)', cost:10 },
  { id:'sunset', name:'日落', paint:'linear-gradient(100deg,#ffaaa8,#ffe2a6,#ffb8df)', cost:10 },
  { id:'nebula', name:'星云', paint:'linear-gradient(100deg,#a7c6ff,#e1bbff,#ffbdcc)', cost:10 },
  { id:'personal', name:'我的星色', paint:'#eef6ff', cost:0, personal:true },
])
export function barragePaint(id, customColor = null) {
  if (id === 'violet') return { color:'#d1beff' } // Historical messages retain their colour.
  if (id === 'personal') return { color: customColor || '#eef6ff', textShadow:`0 0 14px ${customColor || '#9bd4ff'}88` }
  const style = BARRAGE_COLORS.find(item => item.id === id) ?? BARRAGE_COLORS[0]
  return style.cost ? {backgroundImage:style.paint, backgroundClip:'text', WebkitBackgroundClip:'text', color:'transparent', textShadow:'none', filter:'drop-shadow(0 1px 3px #000)'} : {color:style.paint}
}
