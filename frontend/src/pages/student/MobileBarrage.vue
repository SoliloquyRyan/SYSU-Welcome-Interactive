<script setup>
import { nextTick, ref, watch } from 'vue'
import { barragePaint } from '../../services/barrage-colors'
const props = defineProps({ items: { type: Array, default: () => [] } })
const viewport = ref(null)
const following = ref(true)
const unread = ref(0)
let revision = 0
function onScroll() {
  const el = viewport.value
  if (!el) return
  following.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 24
  if (following.value) unread.value = 0
}
function toLatest() {
  if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
  following.value = true
  unread.value = 0
}
watch(() => props.items.map(item => item.barrageId), async (ids, previous = []) => {
  const ownRevision = ++revision
  const el = viewport.value
  const shouldFollow = following.value || !ids.length
  const top = el?.getBoundingClientRect().top ?? 0
  const anchor = [...(el?.querySelectorAll('[data-message-id]') ?? [])].find(item => item.getBoundingClientRect().bottom > top)
  const anchorId = anchor?.dataset.messageId
  const anchorOffset = anchor ? anchor.getBoundingClientRect().top - top : 0
  const known = new Set(previous)
  if (!shouldFollow) unread.value += ids.filter(id => !known.has(id)).length
  await nextTick()
  if (ownRevision !== revision) return
  if (shouldFollow) toLatest()
  else if (anchorId && el) {
    const retained = [...el.querySelectorAll('[data-message-id]')].find(item => item.dataset.messageId === anchorId)
    if (retained) el.scrollTop += retained.getBoundingClientRect().top - el.getBoundingClientRect().top - anchorOffset
  }
}, { immediate: true })
</script>
<template>
  <section class="mobile-live-barrage" aria-label="现场互动">
    <header><span>现场聊天</span><small>最近 {{ items.length }} 条</small></header>
    <div ref="viewport" class="mobile-chat-scroll" role="log" aria-label="现场聊天记录" :aria-live="following ? 'polite' : 'off'" aria-relevant="additions" tabindex="0" @scroll="onScroll">
      <p v-if="!items.length" class="mobile-chat-empty">暂无弹幕</p>
      <TransitionGroup v-if="items.length" name="chat-rise" tag="div" class="mobile-chat-stack">
        <p v-for="item in items" :key="item.barrageId" class="mobile-chat-message" :data-message-id="item.barrageId">
          <span class="mobile-chat-sender">{{ item.publicStarId || '星号待同步' }}</span><span :style="barragePaint(item.colorStyle, item.customColor)">{{ item.text }}</span>
        </p>
      </TransitionGroup>
    </div>
    <button v-if="!following" class="mobile-chat-latest" type="button" @click="toLatest">{{ unread ? `${unread} 条新消息 · ` : '' }}回到最新 ↓</button>
  </section>
</template>
<style scoped>
.mobile-live-barrage{position:relative;min-width:0;margin:4px 0 12px;padding:10px 12px;background:transparent;border:0;border-radius:10px}
.mobile-live-barrage header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:7px;color:#c4d5ee;font-size:12px}
.mobile-live-barrage header small{color:#8296b0;font-size:10px}
.mobile-chat-scroll{height:clamp(88px,14dvh,138px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;scrollbar-width:thin;scrollbar-color:#7899c955 transparent;overflow-anchor:none}
.mobile-chat-scroll:focus-visible{outline:1px solid #95bdff;outline-offset:3px}
.mobile-chat-stack{display:flex;min-height:100%;flex-direction:column;justify-content:flex-end;align-items:flex-start;gap:4px;padding:6px 3px 4px}
.mobile-chat-message{width:fit-content;max-width:88%;margin:0;padding:4px 8px;border:1px solid rgba(166,211,255,.11);border-radius:3px 7px 7px 7px;color:#eef6ff;background:linear-gradient(105deg,rgba(9,25,46,.5),rgba(11,28,48,.24));box-shadow:0 6px 18px rgba(0,4,14,.12);font-size:13px;line-height:1.55;overflow-wrap:anywhere;-webkit-backdrop-filter:blur(5px) saturate(112%);backdrop-filter:blur(5px) saturate(112%)}
.mobile-chat-sender{display:block;margin:0 0 2px;color:#8eacd0;font-size:10px;line-height:1.35;white-space:nowrap}
.mobile-chat-empty{display:grid;place-items:center;min-height:100%;margin:0;color:#8298b2;font-size:12px;letter-spacing:.05em;text-align:center}
.mobile-chat-latest{position:absolute;right:14px;bottom:10px;min-height:44px;padding:8px 12px;border:1px solid #779fd966;border-radius:22px;background:#162c49;color:#dbeaff;font:inherit;font-size:11px;box-shadow:0 4px 14px #0006}
.chat-rise-enter-active,.chat-rise-move{transition:opacity 260ms ease,transform 320ms cubic-bezier(.2,.78,.2,1)}
.chat-rise-enter-from{opacity:0;transform:translate3d(0,18px,0) scale(.98)}
.chat-rise-leave-active{position:absolute;transition:opacity 160ms ease}
.chat-rise-leave-to{opacity:0}
@media (prefers-reduced-motion:reduce){.chat-rise-enter-active,.chat-rise-move,.chat-rise-leave-active{transition:none}.chat-rise-enter-from{opacity:1;transform:none}}
</style>
