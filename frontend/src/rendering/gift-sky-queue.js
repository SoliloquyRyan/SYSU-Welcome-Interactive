export const GIFT_SKY_DURATIONS = Object.freeze({
  'gift-glimmer': 800, 'gift-beacon': 1400, 'gift-orbit': 1600, 'gift-starship': 2400,
})
export const NEUTRAL_GIFT_COLOR = '#DCE7F3'
export function giftDisplayColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : NEUTRAL_GIFT_COLOR
}

// Rendering budget only. Quantities and balances always come from the server.
export function createGiftSkyQueue({ compact = false, reduced = () => false, onChange,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const limit = compact ? 2 : 6, pending = [], active = [], seen = new Set()
  let timer = null, serial = 0, aggregate = null
  const publish = () => onChange?.({ effects: active.map(item => ({ ...item })), aggregate: aggregate ? { ...aggregate } : null, pending: pending.length })
  function summarize(item, at) {
    aggregate = { quantity: (aggregate?.quantity ?? 0) + item.quantity, batches: (aggregate?.batches ?? 0) + item.batches, until: at + 900 }
  }
  function start(item, at) {
    const used = new Set(active.map(effect => effect.anchor))
    let anchor = serial++ % 6
    while (used.has(anchor)) anchor = (anchor + 1) % 6
    active.push({ ...item, anchor, static: reduced(), duration: GIFT_SKY_DURATIONS[item.giftId], startedAt: at, until: at + (reduced() ? 1000 : GIFT_SKY_DURATIONS[item.giftId]) })
  }
  function schedule() {
    clearTimer(timer); timer = null
    const deadlines = [...active.map(i => i.until), ...pending.map(i => i.receivedAt + 3000), ...(aggregate ? [aggregate.until] : [])]
    if (deadlines.length) timer = setTimer(tick, Math.max(1, Math.min(...deadlines) - now()))
  }
  function tick() {
    const at = now()
    for (let i = active.length - 1; i >= 0; i--) if (active[i].until <= at) active.splice(i, 1)
    if (aggregate?.until <= at) aggregate = null
    for (let i = pending.length - 1; i >= 0; i--) if (at - pending[i].receivedAt >= 3000) summarize(pending.splice(i, 1)[0], at)
    while (active.length < limit && pending.length) start(pending.shift(), at)
    publish(); schedule()
  }
  return {
    enqueue(gift) {
      const id = gift.giftEventId ?? gift.id
      if (!id || seen.has(id) || !Object.hasOwn(GIFT_SKY_DURATIONS, gift.giftId)) return false
      seen.add(id); if (seen.size > 512) seen.delete(seen.values().next().value)
      const at = now(), item = { id, publicStarId: gift.publicStarId ?? null, giftId: gift.giftId, color: giftDisplayColor(gift.displayColor), quantity: Math.max(1, Math.min(20, Number(gift.quantity) || 1)), batches: 1, receivedAt: at }
      // A burst joins the already visible flash/trail without extending its life.
      const merged = [...pending, ...active].find(i => i.giftId === item.giftId && i.color === item.color && at - i.receivedAt < 320)
      if (merged) { merged.quantity += item.quantity; merged.batches++ }
      else if (active.length < limit) start(item, at)
      else if (pending.length < 12) pending.push(item)
      else summarize(item, at)
      publish(); schedule(); return true
    },
    clear({ forget = false } = {}) {
      clearTimer(timer); timer = null; active.length = 0; pending.length = 0; aggregate = null
      if (forget) seen.clear()
      publish()
    },
  }
}
