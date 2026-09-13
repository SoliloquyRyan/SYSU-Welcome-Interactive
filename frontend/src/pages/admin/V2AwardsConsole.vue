<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import V2ProgramScores from './V2ProgramScores.vue'

const props = defineProps({ snapshot: { type: Object, required: true }, canWrite: Boolean, savedSignal: Number, heatSavedSignal: Number })
const emit = defineEmits(['command', 'select'])
const awards = computed(() => props.snapshot.awards ?? [])
const stage = computed(() => props.snapshot.stage ?? { revision: 0, mode: 'PROGRAM', revealed: false, page: 0, totalPages: 1 })
const current = computed(() => props.snapshot.currentProgram)
const operator = computed(() => props.snapshot.roles.some(role => ['ALL', 'STAGE_CONTROLLER'].includes(role)))
const writable = computed(() => props.canWrite && operator.value)
const controllable = computed(() => writable.value && props.snapshot.runtime.status === 'RUNNING'
  && props.snapshot.runtime.currentScene === 'PROGRAM_SUPPORT' && props.snapshot.presentation.type === 'NONE'
  && props.snapshot.liveInteraction?.phase === 'IDLE')
const selected = ref('program-honors')
const selectedAward = computed(() => awards.value.find(item => item.id === selected.value))
const draft = ref(null)
const heading = ref(null)
const stale = computed(() => draft.value && (awards.value.find(item => item.id === draft.value.id)?.revision ?? 0) !== draft.value.revision)
const parsed = computed(() => (draft.value?.text ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
  const [name, ...parts] = line.split(/[|｜\t]/)
  return { name: name.trim(), detail: parts.join(' · ').trim() }
}))
const invalid = computed(() => parsed.value.length > (draft.value?.id === 'points-top20' ? 20 : 300)
  || parsed.value.some(item => !item.name || item.name.length > 60 || item.detail.length > 120)
  || !draft.value?.title.trim() || draft.value.title.trim().length > 80)
const onStage = computed(() => stage.value.award?.id === selected.value && stage.value.mode === 'AWARD')
const modeLabel = computed(() => stage.value.mode === 'AWARD' ? stage.value.revealed ? '名单展示中' : '奖项标题' : stage.value.mode === 'HOST' ? '主持背景' : '节目画面')

watch(() => props.savedSignal, () => { draft.value = null })
watch(() => current.value?.awardGroup, group => {
  if (group) selected.value = awards.value.find(item => item.group === group)?.id ?? selected.value
})
function command(command, extra = {}) { emit('command', { command, expectedStageRevision: stage.value.revision, ...extra }) }
async function edit(award = selectedAward.value) {
  if (!award || award.group !== 'CAMPUS') return
  draft.value = { ...award, text: award.entries.map(item => `${item.name}${item.detail ? `｜${item.detail}` : ''}`).join('\n') }
  await nextTick(); heading.value?.focus()
}
function save(confirmed) {
  if (!writable.value || invalid.value || stale.value) return
  command('SAVE_AWARD', { awardId: draft.value.id, group: draft.value.group, title: draft.value.title.trim(),
    expectedAwardRevision: draft.value.revision, entries: parsed.value, confirmed })
}
</script>

<template>
  <BaseCard padding="md" class="awards-console">
    <header><div><h2>舞台与颁奖</h2><p role="status">{{ modeLabel }}<template v-if="stage.mode === 'AWARD'"> · {{ stage.award?.title }}</template></p></div>
      <div class="award-actions"><BaseButton variant="secondary" :disabled="!controllable || stage.mode === 'HOST'" @click="command('SET_STAGE_MODE', { mode: 'HOST' })">主持背景</BaseButton><BaseButton variant="secondary" :disabled="!controllable || !current || ['AWARD', 'SPEECH'].includes(current.kind) || stage.mode === 'PROGRAM'" @click="command('SET_STAGE_MODE', { mode: 'PROGRAM' })">返回节目</BaseButton></div>
    </header>
    <nav class="ceremony-shortcuts" aria-label="颁奖流程"><BaseButton v-for="item in snapshot.programs.filter(item => ['AWARD','SPEECH'].includes(item.kind) || item.title.replace(/[《》]/g, '') === '光年之外')" :key="item.id" variant="secondary" :aria-current="item.id === current?.id ? 'step' : undefined" :disabled="!controllable || item.id === current?.id" @click="emit('select', item.id)">{{ item.title }}</BaseButton></nav>
    <details class="award-workspace" :open="current?.kind === 'AWARD' || Boolean(draft)">
      <summary>奖项管理<span>{{ selectedAward?.title ?? '选择奖项' }}</span></summary>
      <div class="award-workspace-content">
    <div class="award-selection"><label for="award-choice">奖项</label><select id="award-choice" v-model="selected" :disabled="!canWrite">
      <optgroup label="节目颁奖"><option v-for="award in awards.filter(a => a.group === 'PROGRAM')" :key="award.id" :value="award.id">{{ award.title }} · 动力值前三名</option></optgroup>
      <optgroup label="校园图鉴"><option v-for="award in awards.filter(a => a.group === 'CAMPUS')" :key="award.id" :value="award.id">{{ award.title }} · {{ award.confirmed ? `${award.entryCount} 人已确认` : '名单待确认' }}</option></optgroup>
    </select><BaseButton v-if="selectedAward?.group === 'CAMPUS'" variant="secondary" :disabled="!writable || snapshot.runtime.status === 'COMPLETED' || onStage && stage.revealed" @click="edit()">录入名单</BaseButton></div>
    <V2ProgramScores v-if="selectedAward?.group === 'PROGRAM'" :snapshot="snapshot" :can-write="canWrite" :saved-signal="heatSavedSignal" @command="body => command(body.command, body)" />
    <p v-if="selectedAward?.group === 'CAMPUS' && !selectedAward.confirmed" class="award-note">名单待确认</p>
    <div class="award-actions award-reveal-controls">
      <BaseButton variant="secondary" :disabled="!controllable || current?.kind !== 'AWARD' || current?.awardGroup !== selectedAward?.group" @click="command('SELECT_AWARD', { awardId: selected })">展示奖项</BaseButton>
      <BaseButton :disabled="!controllable || !onStage || !selectedAward?.confirmed || stage.revealed" @click="command('REVEAL_AWARD')">揭晓名单</BaseButton>
      <BaseButton variant="secondary" :disabled="!controllable || !onStage || !stage.revealed" @click="command('HIDE_AWARD')">收起名单</BaseButton>
      <div v-if="stage.revealed" class="award-pagination"><BaseButton size="sm" variant="secondary" :disabled="!controllable || stage.page === 0" @click="command('SET_AWARD_PAGE', { page: stage.page - 1 })">上一页</BaseButton><span>{{ stage.page + 1 }} / {{ stage.totalPages }}</span><BaseButton size="sm" variant="secondary" :disabled="!controllable || stage.page + 1 >= stage.totalPages" @click="command('SET_AWARD_PAGE', { page: stage.page + 1 })">下一页</BaseButton></div>
    </div>
    <section v-if="draft && draft.id === selected" class="award-editor" aria-label="名单编辑">
      <h3 ref="heading" tabindex="-1">{{ draft.group === 'CAMPUS' ? draft.title : '节目奖项' }}</h3>
      <label v-if="draft.group === 'PROGRAM'">奖项名称<input v-model="draft.title" maxlength="80" :disabled="!writable"></label>
      <label>获奖名单<textarea v-model="draft.text" rows="8" :disabled="!writable" placeholder="每行：姓名｜作品或备注（可选）"></textarea></label>
      <p>{{ parsed.length }} 项<template v-if="draft.id === 'points-top20'"> · 按第 1 至 20 名顺序录入</template></p>
      <ul v-if="parsed.length" class="award-preview" aria-label="名单预览"><li v-for="(entry, i) in parsed" :key="i"><span>{{ draft.id === 'points-top20' ? `${i + 1}. ` : '' }}{{ entry.name }}</span><small>{{ entry.detail }}</small></li></ul>
      <p v-if="stale" role="alert">其他主控已更新此名单。请保留你的文字，返回后重新打开。</p>
      <p v-else-if="invalid" role="alert">请核对名称、人数及文字长度（姓名 60 字，备注 120 字）。</p>
      <div class="award-actions"><BaseButton variant="secondary" @click="draft = null">返回</BaseButton><BaseButton variant="secondary" :disabled="!writable || invalid || stale" @click="save(false)">保存草稿</BaseButton><BaseButton :disabled="!writable || invalid || stale || !parsed.length || draft.id === 'points-top20' && parsed.length !== 20" @click="save(true)">确定</BaseButton></div>
    </section>
      </div>
    </details>
  </BaseCard>
</template>

<style scoped>
.awards-console{display:grid;gap:18px}.awards-console header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.awards-console h2,.awards-console h3,.awards-console p{margin:0}.awards-console h2{font-size:var(--font-size-lg)}.awards-console p{color:var(--color-text-secondary);font-size:.85rem;line-height:1.65}.awards-console header p{margin-top:6px}.award-actions,.award-selection,.award-pagination,.ceremony-shortcuts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ceremony-shortcuts{padding-bottom:16px;border-bottom:1px solid var(--color-border-subtle)}.award-selection select{flex:1;min-width:220px}.award-selection label{font-size:.85rem;color:var(--color-text-secondary)}.award-editor{display:grid;gap:14px;border-top:1px solid var(--color-border-subtle);padding-top:18px}.award-editor label{display:grid;gap:8px;font-size:.85rem}.awards-console input,.awards-console textarea,.awards-console select{min-height:44px;border-radius:12px;border:1px solid var(--color-border-strong);padding:10px 12px;color:var(--color-text-primary);background:var(--color-orbit-surface-2);font:inherit;min-width:0}.awards-console textarea{resize:vertical;line-height:1.7}.awards-console :focus-visible{outline:2px solid var(--color-orbit-focus);outline-offset:3px}.award-pagination{margin-left:auto;font-size:.9rem;font-variant-numeric:tabular-nums}.award-preview{display:grid;grid-template-columns:1fr 1fr;max-height:240px;overflow:auto;list-style:none;margin:0;padding:12px;background:var(--color-orbit-surface-1);border-radius:12px;gap:10px}.award-preview li{display:grid;gap:4px;overflow-wrap:anywhere}.award-preview small{color:var(--color-text-secondary)}[role=alert]{color:var(--color-danger)!important}@media(max-width:600px){.award-selection select{flex-basis:100%}.award-actions>button{flex:1 1 130px;white-space:nowrap}.award-pagination{margin-left:0}.award-preview{grid-template-columns:1fr}}

.awards-console{gap:16px}.awards-console>header{align-items:center}.awards-console>header>.award-actions{justify-content:flex-end}.awards-console header p{font-size:.8rem}.ceremony-shortcuts{gap:8px;padding-bottom:0;border-bottom:0}.ceremony-shortcuts>button{flex:1;min-width:130px}.ceremony-shortcuts>button[aria-current=step]{border-color:#a0c9ef70;background:#7faeed14;color:#c7e5ff}
.award-workspace{border-top:1px solid var(--color-border-subtle);padding-top:4px;min-width:0}.award-workspace>summary{min-height:44px;align-content:center;cursor:pointer;font-size:.9rem;line-height:1.5}.award-workspace>summary>span{color:var(--color-text-secondary);font-size:.78rem;margin-left:12px}.award-workspace-content{display:grid;gap:16px;padding-top:10px}.award-selection{gap:10px}.award-selection>label{min-width:30px}.award-selection select{background:#07101eb3;border-radius:10px}.award-reveal-controls{padding-top:4px}.award-pagination{padding:4px 0;gap:10px}.award-pagination>span{min-width:44px;text-align:center;color:var(--color-text-secondary)}.award-editor{padding:18px;border:1px solid #91b9e432;border-radius:14px;background:#08132496}.award-editor h3{font-size:1rem;line-height:1.5}.award-editor textarea,.award-editor input{background:#050c178f;box-sizing:border-box}.award-preview{background:#030a1366;border:1px solid #91b9e41a;border-radius:10px}.award-preview li{padding:8px;border-bottom:1px solid #91b9e417}.award-note{padding-left:10px;border-left:2px solid #9bc6eb4d}
@media(max-width:600px){.awards-console>header{gap:12px}.awards-console>header>.award-actions{width:100%;justify-content:flex-start}.ceremony-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ceremony-shortcuts>button{min-width:0;padding-inline:8px;line-height:1.4}.award-selection>label{flex-basis:100%}.award-selection>select{width:100%;flex-basis:100%;min-width:0}.award-selection>button{width:100%}.award-reveal-controls{display:grid;grid-template-columns:1fr 1fr}.award-reveal-controls>button:first-child{grid-column:1/-1}.award-pagination{grid-column:1/-1;justify-content:space-between;width:100%}.award-pagination>button{flex:1}.award-editor{padding:14px}.award-workspace>summary>span{display:inline-block;margin-left:8px;font-size:.72rem}}
</style>
