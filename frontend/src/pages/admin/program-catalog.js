import source from '../../../../docs/event-program-2026.json'

export const programKindLabels = Object.freeze({ PERFORMANCE: '节目', INTERLUDE: '互动环节', DEFERRED: '互动环节', AWARD: '颁奖', SPEECH: '讲话' })

export function eventProgramPreset() {
  return {
    label: '2026 迎新晚会节目单',
    items: [...source.items.slice(0, -1), ...source.ceremonyTail.slice(0, 1), source.items.at(-1), ...source.ceremonyTail.slice(1)].map((item, index) => ({
      id: item.id ?? `event2026-${String(item.sourceSequence).padStart(2, '0')}`,
      order: index + 1,
      title: item.interactionTitle ? `${item.titleAsProvided} · ${item.interactionTitle}` : item.titleAsProvided,
      kind: item.ceremonyType ?? (item.kind === 'performance' ? 'PERFORMANCE' : 'INTERLUDE'),
      giftsEnabled: item.kind === 'performance' && item.titleAsProvided !== '光年之外',
      awardGroup: item.awardGroup ?? null,
      formatLabel: item.systemFormat ?? item.formatAsProvided,
      durationLabel: item.durationAsProvided,
      performers: item.performers ?? '',
    })),
  }
}

export function editableCatalog(snapshot) {
  return {
    label: snapshot.programCatalog.label,
    items: snapshot.programs.map(({ id, title, kind, formatLabel, durationLabel, performers = '', giftsEnabled = true, awardGroup = null }, index) => ({
      id, title, kind, formatLabel, durationLabel, performers, giftsEnabled, awardGroup, order: index + 1,
    })),
  }
}

export function catalogChanges(before, after) {
  const old = new Map(before.items.map((item) => [item.id, item]))
  const next = new Set(after.items.map(({ id }) => id))
  return {
    added: after.items.filter(({ id }) => !old.has(id)).length,
    retired: before.items.filter(({ id }) => !next.has(id)).length,
    changed: after.items.filter((item) => old.has(item.id)
      && ['order', 'title', 'kind', 'formatLabel', 'durationLabel', 'performers', 'giftsEnabled', 'awardGroup'].some((key) => old.get(item.id)[key] !== item[key])).length,
  }
}

export function validateCatalog(catalog) {
  // Browser feedback only. The shared server schema independently validates
  // every write; no schema runtime is added to the phone bundle.
  const fail = (error) => ({ catalog: null, error })
  const text = (value, min, max) => typeof value === 'string'
    && value.trim().length >= min && value.trim().length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
  if (!exact(catalog, ['label', 'items'])) return fail('目录文件须包含名称与节目列表。')
  if (!text(catalog.label, 1, 80)) return fail('请填写 1–80 字的单行目录名称。')
  if (!Array.isArray(catalog.items) || catalog.items.length < 1 || catalog.items.length > 64) return fail('目录须有 1–64 项。')
  const ids = new Set()
  const items = []
  for (const [index, item] of catalog.items.entries()) {
    const prefix = `第 ${index + 1} 项：`
    if (!exact(item, ['id', 'order', 'title', 'kind', 'formatLabel', 'durationLabel', ...['performers', 'giftsEnabled', 'awardGroup'].filter(key => Object.hasOwn(item ?? {}, key))])) return fail(prefix + '目录字段不完整或有多余字段。')
    if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 128 || ids.has(item.id)) return fail(prefix + '节目标识无效或重复。')
    ids.add(item.id)
    if (item.order !== index + 1) return fail(prefix + '顺序须从 1 连续排列。')
    if (!text(item.title, 1, 120)) return fail(prefix + '请填写 1–120 字的单行节目名称。')
    if (typeof item.kind !== 'string' || !Object.hasOwn(programKindLabels, item.kind)) return fail(prefix + '请选择节目类型。')
    if (!text(item.formatLabel, 0, 40) || !text(item.durationLabel, 0, 40)) return fail(prefix + '形式和时长须为不超过 40 字的单行文字。')
    if (item.performers !== undefined && !text(item.performers, 0, 240)) return fail(prefix + '表演者须为不超过 240 字的单行文字。')
    if (item.giftsEnabled !== undefined && typeof item.giftsEnabled !== 'boolean') return fail(prefix + '礼物开关无效。')
    if (item.awardGroup != null && !['PROGRAM', 'CAMPUS'].includes(item.awardGroup)) return fail(prefix + '奖项分组无效。')
    items.push({ ...item, ...(item.performers !== undefined ? { performers: item.performers.trim() } : {}), title: item.title.trim(), formatLabel: item.formatLabel.trim(), durationLabel: item.durationLabel.trim() })
  }
  if (items.filter(({ kind }) => ['INTERLUDE','DEFERRED'].includes(kind)).length > 3) return fail('互动环节最多三项。')
  return { catalog: { label: catalog.label.trim(), items }, error: '' }
}
