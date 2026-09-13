<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'

const props = defineProps({ snapshot: { type: Object, required: true }, canWrite: Boolean, savedSignal: Number })
const emit = defineEmits(['command'])
const ranked = computed(() => props.snapshot.programs.filter(item => item.kind === 'PERFORMANCE').slice()
  .sort((a, b) => b.heat - a.heat || a.order - b.order))
const tied = computed(() => ranked.value.some((item, index, list) => index > 0 && index <= 3 && item.heat === list[index - 1].heat))
const preview = computed(() => ranked.value.filter(item => item.heat >= (ranked.value[2]?.heat ?? 0)).map(item => ({
  ...item, rank: ranked.value.findIndex(candidate => candidate.heat === item.heat) + 1,
  tied: ranked.value.filter(candidate => candidate.heat === item.heat).length > 1,
})))
const revealed = computed(() => props.snapshot.stage?.mode === 'AWARD' && props.snapshot.stage.revealed
  && props.snapshot.stage.award?.group === 'PROGRAM')
const writable = computed(() => props.canWrite && props.snapshot.roles.some(role => ['ALL', 'STAGE_CONTROLLER'].includes(role))
  && ['READY', 'RUNNING', 'PAUSED'].includes(props.snapshot.runtime.status) && !revealed.value)
const draft = ref(null)
const input = ref(null)
const latest = computed(() => ranked.value.find(item => item.id === draft.value?.id))
const stale = computed(() => draft.value && (!latest.value || (latest.value.heatRevision ?? 0) !== draft.value.revision
  || (latest.value.rawHeat ?? latest.value.heat) !== draft.value.rawHeat))
const target = computed(() => Number(draft.value?.target))
const invalid = computed(() => draft.value?.target === '' || !Number.isSafeInteger(target.value) || target.value < 0 || target.value > 1_000_000_000)
const sign = value => value > 0 ? `+${value}` : String(value)

watch(() => props.savedSignal, () => { void cancel() })
watch(() => props.snapshot.resetEpoch, () => { draft.value = null })
async function edit(program) {
  draft.value = { id: program.id, title: program.title, target: String(program.heat),
    original: program.heat, rawHeat: program.rawHeat ?? program.heat, revision: program.heatRevision ?? 0 }
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
async function cancel() {
  const id = draft.value?.id
  draft.value = null
  await nextTick()
  document.getElementById(`score-edit-${id}`)?.focus()
}
function save() {
  if (!writable.value || !draft.value || invalid.value || stale.value || target.value === draft.value.original) return
  emit('command', { command: 'SET_PROGRAM_HEAT', programId: draft.value.id, heat: target.value,
    expectedHeatRevision: draft.value.revision, expectedRawHeat: draft.value.rawHeat })
}
</script>

<template>
  <section class="program-scores" aria-labelledby="program-scores-title">
    <header><h3 id="program-scores-title">节目动力榜</h3><span>{{ tied ? '名次待定' : '前三名' }}</span></header>
    <ol v-if="ranked.some(item => item.heat > 0)" class="score-podium" aria-label="前三名预览">
      <li v-for="program in preview" :key="program.id">
        <span class="score-place">{{ String(program.rank).padStart(2, '0') }}<small v-if="program.tied">并列</small></span>
        <strong>{{ program.title }}</strong><span class="score-total">{{ program.heat.toLocaleString('zh-CN') }}<small>动力值</small></span>
      </li>
    </ol>
    <p v-if="ranked.length < 3" class="score-note" role="status">至少需要三个正式节目。</p>
    <p v-else-if="tied" class="score-note" role="status">前三名存在并列，请调整动力值后揭晓。</p>
    <p v-if="revealed" class="score-note">名单展示中，收起后可调整动力值。</p>
    <details class="score-details">
      <summary>调整节目动力值 <span>{{ ranked.length }} 个节目</span></summary>
      <form v-if="draft" class="score-editor" aria-label="调整动力值" @submit.prevent="save">
        <label for="program-heat-input">{{ draft.title }}<input id="program-heat-input" ref="input" v-model="draft.target" type="number" inputmode="numeric" min="0" max="1000000000" step="1" required :disabled="!writable" aria-describedby="score-edit-note"></label>
        <p id="score-edit-note">当前 {{ draft.original }} → {{ invalid ? '—' : target }} 动力值</p>
        <p v-if="stale" role="alert">数值已变化，请返回后重新打开。</p>
        <p v-else-if="invalid" role="alert">请输入 0～1,000,000,000 的整数。</p>
        <div><BaseButton variant="secondary" type="button" :disabled="!canWrite" @click="cancel">返回</BaseButton><BaseButton type="submit" :disabled="!writable || invalid || stale || target === draft.original">确定</BaseButton></div>
      </form>
      <ol class="score-list" aria-label="节目动力值">
        <li v-for="program in ranked" :key="program.id" :class="{ 'is-editing': draft?.id === program.id }">
          <span class="score-order">{{ ranked.findIndex(item => item.heat === program.heat) + 1 }}</span>
          <div><strong>{{ program.title }}</strong><small>送礼 {{ program.rawHeat ?? program.heat }}<template v-if="program.heatAdjustment"> · 调整 {{ sign(program.heatAdjustment) }}</template></small></div>
          <b>{{ program.heat.toLocaleString('zh-CN') }}</b>
          <BaseButton :id="`score-edit-${program.id}`" variant="ghost" size="sm" :aria-label="`修改${program.title}动力值`" :disabled="!writable" @click="edit(program)">修改</BaseButton>
        </li>
      </ol>

    </details>
  </section>
</template>

<style scoped>
.program-scores{display:grid;gap:12px;border-block:1px solid var(--color-border-subtle);padding-block:16px}.program-scores header{display:flex;align-items:baseline;gap:12px}.program-scores h3{margin:0;font-size:1rem;font-weight:600}.program-scores header>span,.score-note,.score-details summary>span{font-size:.8rem;color:var(--color-text-secondary)}.score-podium{max-height:240px;overflow:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));list-style:none;padding:0;margin:0;gap:12px}.score-podium li{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:8px 12px;padding:14px;border:1px solid var(--color-border-subtle);border-radius:12px;background:var(--color-orbit-surface-1)}.score-place{grid-row:span 2;font:500 1.5rem/1.2 var(--font-family-data);color:var(--color-orbit-signal-soft)}.score-place small{display:block;font:.65rem/1.5 var(--font-family-cjk);color:var(--color-text-secondary)}.score-podium strong{font-size:.9rem;line-height:1.5;overflow-wrap:anywhere}.score-total{font:600 1.1rem/1.5 var(--font-family-data)}.score-total small{margin-left:6px;font:400 .7rem var(--font-family-cjk);color:var(--color-text-secondary)}.score-note{margin:0;line-height:1.6}.score-details summary{min-height:44px;align-content:center;cursor:pointer;font-size:.9rem}.score-details summary>span{margin-left:8px}.score-list{list-style:none;padding:0;margin:4px 0;max-height:380px;overflow:auto;overscroll-behavior:contain}.score-list li{display:grid;grid-template-columns:24px minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--color-border-subtle)}.score-order{font:.8rem var(--font-family-data);color:var(--color-text-secondary)}.score-list strong{font-size:.85rem;overflow-wrap:anywhere}.score-list small{display:block;margin-top:4px;font-size:.75rem;color:var(--color-text-secondary)}.score-list b{font:500 .95rem var(--font-family-data)}.score-editor{display:grid;gap:12px;margin-top:12px;padding:16px;border:1px solid var(--color-border-strong);border-radius:12px;background:var(--color-orbit-surface-2)}.score-editor label{display:grid;gap:8px;font-size:.9rem}.score-editor input{min-height:44px;max-width:260px;width:100%;box-sizing:border-box;border:1px solid var(--color-border-strong);border-radius:8px;background:var(--color-orbit-surface-1);color:var(--color-text-primary);padding:8px 12px;font:inherit}.score-editor p{margin:0;font-size:.8rem;color:var(--color-text-secondary)}.score-editor [role=alert]{color:var(--color-danger)}.score-editor>div{display:flex;gap:10px}.score-editor>div>button{min-width:100px}.program-scores :focus-visible{outline:2px solid var(--color-orbit-focus);outline-offset:3px}@media(max-width:680px){.score-podium{grid-template-columns:minmax(0,1fr);gap:6px}.score-podium li{grid-template-columns:30px minmax(0,1fr) auto;padding:10px 12px;align-items:center}.score-place{grid-row:auto;font-size:1.15rem}.score-total{font-size:1rem;white-space:nowrap}.score-total small{display:block;margin:0;font-size:.65rem;text-align:right}.score-list li{gap:8px;grid-template-columns:20px minmax(0,1fr) auto auto}.score-editor>div>button{flex:1;min-width:0}}

.program-scores{gap:14px;border-block:0;padding-block:4px 8px}.program-scores header{justify-content:space-between}.program-scores header>span{color:#b8d5ed}.score-podium{gap:10px}.score-podium li{background:linear-gradient(150deg,#14273a66,#07101e70);border-color:#91b9e429;border-radius:12px}.score-place{color:#bcdcf3}.score-note{padding:9px 12px;border-radius:8px;background:#b4cce909;color:#bdcee0}.score-details{border-top:1px solid #91b9e424;padding-top:4px}.score-list{margin-top:8px;scroll-padding:10px}.score-list li{padding:12px 4px;gap:12px}.score-list li.is-editing{background:#7db3e80e;border-radius:8px}.score-list strong{font-weight:500;line-height:1.5}.score-list b{font-variant-numeric:tabular-nums}.score-list :deep(.base-button--sm){min-height:38px;border-color:#91b9e426;background:#7da8d509}.score-editor{margin:10px 0 16px;padding:18px;background:#0b1c2dbc;border-color:#a4c9eb57}.score-editor input{max-width:100%;background:#030a1480;font-size:1.2rem;font-family:var(--font-family-data);border-radius:10px}.score-editor>div{justify-content:flex-end}.score-editor label{line-height:1.5}.score-editor p{line-height:1.6}
@media(max-width:680px){.score-podium li{padding:12px 10px;gap:10px}.score-list li{grid-template-columns:18px minmax(0,1fr) auto;gap:8px}.score-list li>button{grid-column:3;grid-row:2}.score-list li>div{grid-row:span 2}.score-list li>b{grid-column:3;text-align:right}.score-list li>.score-order{grid-row:span 2}.score-editor{padding:14px}.score-editor>div>button{flex:1}}
</style>
