<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import { createIdempotencyKey } from '../../services/api'
import { catalogChanges, editableCatalog, eventProgramPreset, programKindLabels, validateCatalog } from './program-catalog'

const props = defineProps({ snapshot: { type: Object, required: true }, canWrite: Boolean, savedSignal: Number })
const emit = defineEmits(['select', 'apply'])
const selected = ref('')
const draft = ref(null)
const baseCatalog = ref(null)
const baseRevision = ref(0)
const importError = ref('')
const importBusy = ref(false)
const editorHeading = ref(null)
const runtime = computed(() => props.snapshot.runtime)
const current = computed(() => props.snapshot.currentProgram)
const programs = computed(() => props.snapshot.programs)
const nextProgram = computed(() => programs.value.find(({ state }) => state === 'NEXT') ?? (!current.value ? programs.value[0] : null))
const canControl = computed(() => props.canWrite && props.snapshot.roles.some((role) => ['ALL', 'STAGE_CONTROLLER'].includes(role)))
const canEdit = computed(() => canControl.value && runtime.value.status === 'READY' && runtime.value.currentScene === null)
const canSelect = computed(() => canControl.value && runtime.value.status === 'RUNNING' && runtime.value.currentScene === 'PROGRAM_SUPPORT' && props.snapshot.presentation.type === 'NONE' && props.snapshot.liveInteraction?.phase === 'IDLE')
const validation = computed(() => draft.value ? validateCatalog(draft.value) : { catalog: null, error: '' })
const changes = computed(() => draft.value ? catalogChanges(baseCatalog.value, draft.value) : null)
const stale = computed(() => draft.value && baseRevision.value !== props.snapshot.programCatalog.revision)
const summary = computed(() => `${programs.value.filter(({ kind }) => kind === 'PERFORMANCE').length} 个节目 · ${programs.value.filter(({ kind }) => ['INTERLUDE', 'DEFERRED'].includes(kind)).length} 个互动环节`)

watch(() => props.snapshot.currentProgram?.id, (id) => { selected.value = id ?? programs.value[0]?.id ?? '' }, { immediate: true })
watch(() => props.snapshot.programCatalog.revision, () => {
  if (!programs.value.some(({ id }) => id === selected.value)) selected.value = current.value?.id ?? programs.value[0]?.id ?? ''
})
watch(() => props.savedSignal, () => { draft.value = null; importError.value = '' })

async function preview(catalog) {
  importError.value = ''
  baseCatalog.value = editableCatalog(props.snapshot)
  baseRevision.value = props.snapshot.programCatalog.revision
  draft.value = catalog
  await nextTick()
  editorHeading.value?.focus()
}
function renumber() { draft.value.items.forEach((item, index) => { item.order = index + 1 }) }
function move(index, delta) {
  const items = draft.value.items
  ;[items[index], items[index + delta]] = [items[index + delta], items[index]]
  renumber()
}
function remove(index) { draft.value.items.splice(index, 1); renumber() }
function add() {
  draft.value.items.push({ id: `program-${createIdempotencyKey()}`, order: draft.value.items.length + 1,
    title: '', performers: '', kind: 'PERFORMANCE', formatLabel: '', durationLabel: '' })
}
function draftDisplayCode(index) {
  const item = draft.value.items[index]
  if (item.kind !== 'PERFORMANCE') return ''
  return String(draft.value.items.slice(0, index + 1).filter(entry => entry.kind === 'PERFORMANCE').length).padStart(2, '0')
}
async function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !canEdit.value) return
  // 64 entries with UTF-8 programme titles and the new performer field fit here.
  if (file.size > 256 * 1024) { importError.value = '目录文件不能超过 256 KiB。'; return }
  importBusy.value = true
  const revision = props.snapshot.programCatalog.revision
  try {
    const result = validateCatalog(JSON.parse(await file.text()))
    if (result.error) { importError.value = result.error; return }
    if (!canEdit.value || revision !== props.snapshot.programCatalog.revision) { importError.value = '现场状态已变化，请重新打开目录预览。'; return }
    await preview(result.catalog)
  } catch { importError.value = '无法读取目录，请选择有效的节目目录 JSON 文件。' }
  finally { importBusy.value = false }
}
function apply() {
  if (!canEdit.value || stale.value || !validation.value.catalog) return
  emit('apply', { catalog: validation.value.catalog, expectedCatalogRevision: baseRevision.value })
}
</script>

<template>
  <BaseCard padding="md" class="catalog-panel">
    <div class="catalog-heading">
      <div><h2>节目编排</h2><p>{{ snapshot.programCatalog.label }} · {{ summary }}</p></div>
      <div v-if="runtime.status === 'READY'" class="catalog-actions">
        <BaseButton variant="secondary" :disabled="!canEdit || importBusy" @click="preview(eventProgramPreset())">载入本场节目单</BaseButton>
        <BaseButton variant="secondary" :disabled="!canEdit || importBusy" @click="preview(editableCatalog(snapshot))">编辑当前目录</BaseButton>
      </div>
    </div>
    <p v-if="runtime.status === 'READY'" class="catalog-note">开始前确认节目单。</p>
    <div class="program-cues" aria-label="现场编排">
      <div><small>当前项</small><strong>{{ current?.title ?? '尚未选择' }}</strong><span>{{ current ? programKindLabels[current.kind] : '进入节目应援后选择首项' }}</span></div>
      <div><small>接下来</small><strong>{{ nextProgram?.title ?? '目录已到最后一项' }}</strong><span>{{ nextProgram ? `${programKindLabels[nextProgram.kind]} · ${nextProgram.durationLabel || '时长待定'}` : '确认最后节目结束后，再推进协同点亮' }}</span></div>
    </div>
    <div class="program-control">
      <label for="v2-current-program">当前节目</label>
      <select id="v2-current-program" v-model="selected" :disabled="!canSelect">
        <option v-for="program in programs" :key="program.id" :value="program.id">{{ program.kind === 'PERFORMANCE' ? `${program.displayCode} · ${program.title}` : program.title }}</option>
      </select>
      <BaseButton variant="secondary" :disabled="!canSelect || !selected || selected === current?.id" @click="emit('select', selected)">设为当前节目</BaseButton>
      <BaseButton :disabled="!canSelect || !nextProgram" @click="emit('select', nextProgram.id)">{{ current ? '切换到下一项' : '开始首个节目' }}</BaseButton>
    </div>
    <p v-if="current && !current.giftsEnabled" class="interlude-notice" role="status">{{ current.title }} · 礼物已关闭</p>
    <details class="catalog-overview"><summary>查看完整目录 · {{ programs.length }} 项</summary>
      <ol class="running-list">
        <li v-for="program in programs" :key="program.id" :class="{ current: program.state === 'CURRENT', interaction: program.kind !== 'PERFORMANCE' }">
          <span v-if="program.kind === 'PERFORMANCE'">{{ program.displayCode }}</span>
          <div><strong>{{ program.title }}</strong><small v-if="program.kind === 'PERFORMANCE' && program.performers">{{ program.performers }}</small><small v-if="program.kind === 'PERFORMANCE'">{{ program.formatLabel || '形式待定' }} · {{ program.durationLabel || '时长待定' }}</small></div>
          <span v-if="program.state === 'CURRENT' || program.kind === 'PERFORMANCE'" class="program-status">{{ program.state === 'CURRENT' ? '进行中' : `动力值 ${program.heat}` }}</span>
        </li>
      </ol>
    </details>
    <details v-if="runtime.status === 'READY'" class="catalog-import"><summary>从目录文件导入</summary><label>选择节目目录 JSON<input type="file" accept="application/json,.json" :disabled="!canEdit || importBusy" @change="importFile"></label><p>文件只进入预览；检查后点击“确认应用”才更新现场目录。</p></details>
    <p v-if="importError" role="alert" class="catalog-error">{{ importError }}</p>
    <section v-if="draft" class="catalog-editor" aria-labelledby="catalog-editor-title">
      <h3 id="catalog-editor-title" ref="editorHeading" tabindex="-1">节目目录预览</h3>
      <p>新增 {{ changes.added }} 项 · 调整 {{ changes.changed }} 项 · 从当前目录移出 {{ changes.retired }} 项。历史节目记录保留。</p>
      <details class="catalog-guidance"><summary>编排说明</summary><p>开场白 3 分钟、结束语 2 分钟由主持人控制；标注时长仅供导播参考。</p></details>
      <label>目录名称<input v-model="draft.label" maxlength="80" :disabled="!canEdit"></label>
      <ol class="editor-list">
        <li v-for="(item, index) in draft.items" :key="item.id" :class="{ 'is-segment': item.kind !== 'PERFORMANCE' }">
          <div v-if="item.kind === 'PERFORMANCE'" class="editor-number">{{ draftDisplayCode(index) }}</div>
          <div class="editor-fields">
            <label class="title-field">节目名称<input v-model="item.title" :aria-label="`第 ${index + 1} 项名称`" maxlength="120" :disabled="!canEdit"></label>
            <label class="performers-field">表演者<input v-model="item.performers" :aria-label="`第 ${index + 1} 项表演者`" maxlength="240" placeholder="姓名 / 团队，用顿号分隔" :disabled="!canEdit"></label>
            <label>类型<select v-model="item.kind" :aria-label="`第 ${index + 1} 项类型`" :disabled="!canEdit"><option v-for="(label, kind) in programKindLabels" :key="kind" :value="kind">{{ label }}</option></select></label>
            <label v-if="item.kind === 'AWARD'">奖项组<select v-model="item.awardGroup" :disabled="!canEdit"><option value="PROGRAM">节目颁奖</option><option value="CAMPUS">校园图鉴</option></select></label>
            <label v-if="item.kind === 'PERFORMANCE'">礼物<select v-model="item.giftsEnabled" :disabled="!canEdit || item.title.replace(/[《》]/g, '') === '光年之外'"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
            <label>形式<input v-model="item.formatLabel" :aria-label="`第 ${index + 1} 项形式`" maxlength="40" :disabled="!canEdit"></label>
            <label>标注时长<input v-model="item.durationLabel" :aria-label="`第 ${index + 1} 项时长`" maxlength="40" :disabled="!canEdit"></label>
          </div>
          <div class="row-actions"><BaseButton size="sm" variant="ghost" :aria-label="`上移第 ${index + 1} 项`" :disabled="!canEdit || index === 0" @click="move(index, -1)">上移</BaseButton><BaseButton size="sm" variant="ghost" :aria-label="`下移第 ${index + 1} 项`" :disabled="!canEdit || index === draft.items.length - 1" @click="move(index, 1)">下移</BaseButton><BaseButton size="sm" variant="ghost" class="remove-entry" :aria-label="`移出第 ${index + 1} 项`" :disabled="!canEdit || draft.items.length === 1" @click="remove(index)">移出</BaseButton></div>
        </li>
      </ol>
      <p v-if="stale" role="alert" class="catalog-error">其他主控已更新目录。此预览已过期；请保留需要的修改并重新打开最新目录。</p>
      <p v-else-if="validation.error" role="alert" class="catalog-error">{{ validation.error }}</p>
      <div class="catalog-actions"><BaseButton variant="secondary" :disabled="!canEdit || draft.items.length >= 64" @click="add">添加一项</BaseButton><BaseButton variant="secondary" :disabled="!canWrite" @click="draft = null">取消预览</BaseButton><BaseButton :disabled="!canEdit || stale || !validation.catalog" @click="apply">确认应用 {{ draft.items.length }} 项</BaseButton></div>
    </section>
  </BaseCard>
</template>

<style scoped>
.catalog-panel { display: grid; gap: 16px; }
h2, h3, p { margin: 0; }
h2 { font-size: var(--font-size-lg); }
p, .catalog-note, small { color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.65; }
.catalog-heading, .catalog-actions, .program-control { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.catalog-heading { justify-content: space-between; }
.catalog-heading p { margin-top: 6px; }
.program-cues { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; background: var(--color-orbit-surface-1); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); }
.program-cues > div { min-width: 0; display: grid; gap: 6px; }
.program-cues strong { font-size: 1.1rem; overflow-wrap: anywhere; }
.program-cues span { color: var(--color-text-secondary); font-size: .8rem; }
label { display: grid; gap: 6px; font-size: .8rem; color: var(--color-text-secondary); }
input, select { min-width: 0; width: 100%; min-height: 44px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--color-text-primary); background: var(--color-orbit-surface-2); font: inherit; }
input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--color-orbit-focus); outline-offset: 3px; }
input:disabled, select:disabled { color: var(--color-control-disabled-text); background: var(--color-control-disabled-bg); }
.program-control > select { flex: 1; max-width: 460px; }
.interlude-notice { padding: 12px 16px; border-left: 2px solid var(--color-warning); background: var(--color-orbit-surface-1); }
summary { cursor: pointer; min-height: 44px; display: list-item; align-content: center; }
.running-list, .editor-list { list-style: none; padding: 0; margin: 12px 0; }
.running-list { max-height: 410px; overflow: auto; }
.running-list li { display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; padding: 12px 6px; border-top: 1px solid var(--color-border-subtle); font-size: .85rem; }
.running-list li.current { background: var(--color-orbit-surface-1); }
.running-list li.interaction { grid-template-columns: minmax(0, 1fr); gap: 4px; margin: 1px 0; padding: 11px 12px; border: 0; border-radius: 0; background: transparent; text-align: center; }
.running-list li.interaction > div { display: flex; align-items: center; justify-content: center; gap: 12px; }
.running-list li.interaction > div::before,.running-list li.interaction > div::after { content: ''; flex: 0 1 48px; height: 1px; background: linear-gradient(90deg, transparent, var(--color-border-strong)); }
.running-list li.interaction > div::after { transform: rotate(180deg); }
.running-list li.interaction strong { color: var(--color-orbit-signal-soft); letter-spacing: .06em; }
.running-list li.interaction .program-status { justify-self: center; color: var(--color-orbit-signal-soft); font-size: .75rem; }
.running-list strong, .running-list small { display: block; overflow-wrap: anywhere; }
.catalog-editor { display: grid; gap: 16px; padding: 20px 0 0; border-top: 1px solid var(--color-border-strong); }
.catalog-editor h3:focus { outline: none; }
.editor-list { max-height: 580px; overflow: auto; overscroll-behavior: contain; }
.editor-list li { display: grid; grid-template-columns: 26px 1fr auto; gap: 12px; padding: 16px 4px; border-top: 1px solid var(--color-border-subtle); }
.editor-number { padding-top: 24px; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
.editor-fields { display: grid; grid-template-columns: repeat(3, minmax(90px, 1fr)); gap: 10px; }
.title-field { grid-column: span 1; } .performers-field { grid-column: span 2; }
.row-actions { display: flex; gap: 6px; align-items: end; }
.row-actions :deep(.remove-entry) { color: var(--color-danger); }
.catalog-error { color: var(--color-danger); }
@media (max-width: 900px) { .editor-fields { grid-template-columns: 1fr 1fr; } .row-actions { flex-direction: column; justify-content: center; } }
@media (max-width: 600px) { .program-cues { grid-template-columns: 1fr; } .program-control > select { flex-basis: 100%; max-width: none; } .editor-list li { grid-template-columns: 20px 1fr; } .row-actions { grid-column: 2; flex-direction: row; justify-content: start; } .catalog-actions :deep(button) { flex: 1 1 auto; } .running-list li { grid-template-columns: 24px 1fr; } .running-list li > span:last-child { grid-column: 2; } }
.editor-list li.is-segment { grid-template-columns: minmax(0, 1fr) auto; padding-block: 24px; }
.editor-list li.is-segment .row-actions { grid-column: 2; }
.running-list li.interaction { grid-template-columns: minmax(0, 1fr); }
.running-list li.interaction > .program-status { grid-column: 1; }
@media (max-width: 600px) { .editor-list li.is-segment { grid-template-columns: minmax(0, 1fr); } .editor-list li.is-segment .row-actions { grid-column: 1; } }

.catalog-panel{gap:15px}.catalog-heading{align-items:flex-start}.catalog-heading h2{font-size:1.08rem}.catalog-heading p{font-size:.79rem;line-height:1.6;max-width:65ch}.program-cues{padding:0;gap:0;border-radius:12px;background:#08132485;border-color:#91b9e42b}.program-cues>div{padding:17px 18px;gap:7px}.program-cues>div+div{border-left:1px solid #91b9e42b}.program-cues small{font-size:.74rem;letter-spacing:.06em}.program-cues>div:first-child small{color:#a9d3f2}.program-cues strong{font-size:1.12rem;line-height:1.5;font-weight:500}.program-cues span{font-size:.75rem}.program-control{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:10px}.program-control>select{max-width:none;background:#06101da8;border-radius:10px}.program-control>label{font-size:.8rem}.program-control>button{white-space:nowrap;padding-inline:16px}.catalog-note{font-size:.8rem}.catalog-overview,.catalog-import{border-top:1px solid #91b9e424;padding-top:4px}.catalog-overview>summary,.catalog-import>summary{font-size:.85rem}.running-list{padding-right:5px;scrollbar-gutter:stable}.running-list li{align-items:center;grid-template-columns:28px minmax(0,1fr) auto}.running-list li.current{background:#8ebbf00b;border-radius:8px}.running-list strong{font-weight:500;line-height:1.6}.running-list small{font-size:.75rem}.program-status{font-size:.75rem;color:#acc8e0}.interlude-notice{padding:9px 12px;background:#a9c5e909;border-left-color:#91b9e457;border-radius:0 8px 8px 0;font-size:.8rem}.catalog-editor{padding-top:18px;gap:14px}.catalog-editor h3{font-size:1rem}.catalog-editor>p{font-size:.8rem}.catalog-guidance{font-size:.8rem}.catalog-guidance summary{min-height:32px}.catalog-guidance p{padding-block:6px;font-size:.8rem}.editor-list{border:1px solid #91b9e42b;border-radius:12px;padding:0 14px;background:#07111d66}.editor-list li{padding-block:18px}.editor-list li:first-child{border-top:0}.editor-list li.is-segment{padding-block:18px}.editor-fields{gap:12px}.editor-fields input,.editor-fields select,.catalog-editor>label>input{border-radius:9px;background:#050e1999;box-sizing:border-box}.row-actions{gap:4px}.editor-number{font-family:var(--font-family-data);color:#a5c6e3}.catalog-editor>.catalog-actions{padding-top:12px;border-top:1px solid #91b9e426}.catalog-import p{font-size:.8rem;margin-top:8px}.catalog-error{padding:10px 12px;border:1px solid #d9978a40;border-radius:8px;background:#ad51450b}
@media(max-width:850px){.program-control{grid-template-columns:minmax(0,1fr) auto auto}.program-control>label{grid-column:1/-1}.program-control>select{min-width:0}}
@media(max-width:600px){.program-cues>div{padding:14px}.program-cues>div+div{border-left:0;border-top:1px solid #91b9e426}.program-control{grid-template-columns:1fr 1fr}.program-control>select{grid-column:1/-1;width:100%}.program-control>button{padding-inline:8px;white-space:normal;line-height:1.4}.catalog-actions{gap:8px}.catalog-actions>button{flex:1 1 130px;min-width:0;white-space:normal;line-height:1.4}.running-list li{grid-template-columns:24px minmax(0,1fr);gap:6px 10px}.running-list li>.program-status{grid-column:2}.editor-list{padding:0 10px;max-height:60vh}.editor-list li{gap:8px}.editor-fields{grid-template-columns:minmax(0,1fr);gap:10px}.title-field,.performers-field{grid-column:1}.row-actions{gap:6px}.row-actions>button{flex:1;min-width:0;padding-inline:8px}.catalog-editor>.catalog-actions>button:last-child{flex-basis:100%}.program-cues strong{font-size:1rem}}
</style>
