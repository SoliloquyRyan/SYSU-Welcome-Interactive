import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { connectObs } from './obs-client.mjs'

const OLD_BASE = '统一学院背景（本地备用）'
const OLD_STAGE = '系统完整舞台'
const BLACK = '黑色背景（本地）'
const NEW_STAGE = '最新节目背景（网页）'
const EMERGENCY = '应急 · 黑色背景'
const apply = process.argv.includes('--apply')
const configPath = process.env.OBS_WEBSOCKET_CONFIG
  ?? path.join(process.env.APPDATA ?? '', 'obs-studio/plugin_config/obs-websocket/config.json')
const config = JSON.parse((await readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''))
const obs = await connectObs({ url: `ws://127.0.0.1:${config.server_port ?? 4455}`, password: process.env.OBS_PASSWORD ?? config.server_password ?? '' })
try {
  const { scenes } = await obs.request('GetSceneList')
  if (scenes.length !== 29) throw new Error('OBS_SCENE_COUNT_CHANGED')
  const current = (await obs.request('GetCurrentProgramScene')).currentProgramSceneName
  const report = []
  for (const scene of scenes) {
    const items = (await obs.request('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems
    const old = items.filter(item => [OLD_BASE, OLD_STAGE].includes(item.sourceName))
    const black = items.find(item => item.sourceName === BLACK)
    const stage = items.find(item => item.sourceName === NEW_STAGE)
    report.push({ scene: scene.sceneName, old: old.map(item => item.sourceName), black: Boolean(black), stage: Boolean(stage) })
    if (!apply) continue
    for (const item of old) await obs.request('RemoveSceneItem', { sceneName: scene.sceneName, sceneItemId: item.sceneItemId })
    const after = (await obs.request('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems
    const replacement = after.find(item => item.sourceName === BLACK)
    if (!replacement) throw new Error('OBS_BLACK_MISSING_' + scene.sceneName)
    await obs.request('SetSceneItemIndex', { sceneName: scene.sceneName, sceneItemId: replacement.sceneItemId, sceneItemIndex: 0 })
    await obs.request('SetSceneItemLocked', { sceneName: scene.sceneName, sceneItemId: replacement.sceneItemId, sceneItemLocked: true })
    const newStage = after.find(item => item.sourceName === NEW_STAGE)
    if (newStage) {
      await obs.request('SetSceneItemLocked', { sceneName: scene.sceneName, sceneItemId: newStage.sceneItemId, sceneItemLocked: true })
    }
  }
  if (apply) {
    for (const input of [OLD_BASE, OLD_STAGE]) {
      try { await obs.request('RemoveInput', { inputName: input }) } catch { /* absent after item cleanup */ }
    }
    const { inputs } = await obs.request('GetInputList')
    const stale = inputs.filter(input => [OLD_BASE, OLD_STAGE].includes(input.inputName))
    if (stale.length) throw new Error('OBS_OLD_SOURCE_STILL_PRESENT')
    for (const scene of scenes) {
      const name = scene.sceneName
      const items = (await obs.request('GetSceneItemList', { sceneName: name })).sceneItems
      if (items[0]?.sourceName !== BLACK || items.some(item => [OLD_BASE, OLD_STAGE].includes(item.sourceName))) throw new Error('OBS_SCENE_VERIFY_FAILED_' + name)
    }
    const afterCurrent = (await obs.request('GetCurrentProgramScene')).currentProgramSceneName
    if (afterCurrent !== current) throw new Error('OBS_CURRENT_SCENE_CHANGED')
    console.log(JSON.stringify({ result: 'OBS_STAGE_REFRESH_FINISHED', sceneCount: scenes.length, current }, null, 2))
  } else {
    console.log(JSON.stringify({ current, report }, null, 2))
  }
} finally { obs.close() }
