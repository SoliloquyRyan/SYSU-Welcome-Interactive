import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { connectObs } from './obs-client.mjs'

const OLD_BASE = '统一学院背景（本地备用）'
const OLD_STAGE = '系统完整舞台'
const OVERLAY = '系统透明互动'
const BLACK = '黑色背景（本地）'
const NEW_STAGE = '最新节目背景（网页）'
const OLD_EMERGENCY = '应急 · 本地学院背景'
const NEW_EMERGENCY = '应急 · 黑色背景'
const stageUrl = 'https://sysuzgxytj.top/welcomeparty/screen?motion=full&media=background&v=20260919-d116'
const overlayUrl = 'https://sysuzgxytj.top/welcomeparty/screen?media=overlay&motion=full&v=20260919-d116'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const backupPath = args[args.indexOf('--backup') + 1]
const configPath = process.env.OBS_WEBSOCKET_CONFIG
  ?? path.join(process.env.APPDATA ?? '', 'obs-studio/plugin_config/obs-websocket/config.json')
const collectionPath = path.join(process.env.APPDATA ?? '', 'obs-studio/basic/scenes/SYSU_Welcome_20260913.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

if (apply && (!args.includes('--backup') || !backupPath || backupPath.startsWith('--'))) {
  throw new Error('OBS_BACKUP_REQUIRED')
}
if (apply && sha256(await readFile(backupPath)) !== sha256(await readFile(collectionPath))) {
  throw new Error('OBS_BACKUP_MISMATCH')
}

const config = JSON.parse((await readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''))
const obs = await connectObs({
  url: `ws://127.0.0.1:${config.server_port ?? 4455}`,
  password: process.env.OBS_PASSWORD ?? config.server_password ?? '',
})
try {
  const collection = await obs.request('GetSceneCollectionList')
  if (collection.currentSceneCollectionName !== '迎新晚会·最新版') throw new Error('OBS_WRONG_COLLECTION')
  const current = (await obs.request('GetCurrentProgramScene')).currentProgramSceneName
  const { scenes } = await obs.request('GetSceneList')
  if (scenes.length !== 29) throw new Error('OBS_SCENE_COUNT_CHANGED')
  const { inputs } = await obs.request('GetInputList')
  const names = new Set(inputs.map(input => input.inputName))
  const sceneItems = new Map()
  for (const scene of scenes) {
    const items = (await obs.request('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems
    sceneItems.set(scene.sceneName, items)
  }
  if (!apply) {
    console.log(JSON.stringify({
      collection: collection.currentSceneCollectionName,
      current,
      sceneCount: scenes.length,
      oldCollegeScenes: [...sceneItems.values()].filter(items => items.some(item => item.sourceName === OLD_BASE)).length,
      oldStageScenes: [...sceneItems.values()].filter(items => items.some(item => item.sourceName === OLD_STAGE)).length,
      blackScenes: [...sceneItems.values()].filter(items => items.some(item => item.sourceName === BLACK)).length,
      newStageScenes: [...sceneItems.values()].filter(items => items.some(item => item.sourceName === NEW_STAGE)).length,
      sources: [...names].filter(name => [OLD_BASE, OLD_STAGE, OVERLAY, BLACK, NEW_STAGE].includes(name)),
    }, null, 2))
    process.exit(0)
  }
  if (!names.has(OLD_BASE) || !names.has(OLD_STAGE) || !names.has(OVERLAY) || names.has(BLACK) || names.has(NEW_STAGE)) {
    throw new Error('OBS_SOURCES_NOT_AT_EXPECTED_BASELINE')
  }
  if ([...sceneItems.values()].some(items => !items.some(item => item.sourceName === OLD_BASE))) {
    throw new Error('OBS_COLLEGE_BASE_MISSING')
  }
  const fullScenes = [...sceneItems.entries()].filter(([, items]) => items.some(item => item.sourceName === OLD_STAGE)).map(([name]) => name)
  if (fullScenes.length < 15) throw new Error('OBS_FULL_STAGE_MAPPING_CHANGED')

  // Create replacement sources before removing the old ones.  The black
  // source remains local and works when the programme web page is offline.
  await obs.request('CreateInput', {
    sceneName: OLD_EMERGENCY,
    inputName: BLACK,
    inputKind: 'color_source_v3',
    inputSettings: { color: 4278190080, width: 1920, height: 1080 },
    sceneItemEnabled: true,
  })
  for (const scene of scenes) {
    if (scene.sceneName === OLD_EMERGENCY) continue
    await obs.request('CreateSceneItem', { sceneName: scene.sceneName, sourceName: BLACK, sceneItemEnabled: true })
  }
  await obs.request('CreateInput', {
    sceneName: fullScenes[0],
    inputName: NEW_STAGE,
    inputKind: 'browser_source',
    inputSettings: { url: stageUrl, width: 1920, height: 1080, fps: 60, fps_custom: true, shutdown: false, restart_when_active: false },
    sceneItemEnabled: true,
  })
  for (const name of fullScenes.slice(1)) {
    await obs.request('CreateSceneItem', { sceneName: name, sourceName: NEW_STAGE, sceneItemEnabled: true })
  }
  await obs.request('SetInputSettings', { inputName: OVERLAY, inputSettings: { url: overlayUrl }, overlay: true })
  await obs.request('RemoveInput', { inputName: OLD_STAGE })
  await obs.request('RemoveInput', { inputName: OLD_BASE })
  await obs.request('SetSceneName', { sceneName: OLD_EMERGENCY, newSceneName: NEW_EMERGENCY })

  for (const scene of scenes) {
    const name = scene.sceneName === OLD_EMERGENCY ? NEW_EMERGENCY : scene.sceneName
    let items = (await obs.request('GetSceneItemList', { sceneName: name })).sceneItems
    const black = items.find(item => item.sourceName === BLACK)
    if (!black) throw new Error('OBS_BLACK_MISSING_' + name)
    await obs.request('SetSceneItemIndex', { sceneName: name, sceneItemId: black.sceneItemId, sceneItemIndex: 0 })
    await obs.request('SetSceneItemLocked', { sceneName: name, sceneItemId: black.sceneItemId, sceneItemLocked: true })
    if (fullScenes.includes(scene.sceneName)) {
      items = (await obs.request('GetSceneItemList', { sceneName: name })).sceneItems
      const stage = items.find(item => item.sourceName === NEW_STAGE)
      if (!stage) throw new Error('OBS_NEW_STAGE_MISSING_' + name)
      // Browser background sits over an audio-only source, below all video
      // overlays.  The old stage held the same layer in each scene.
      const oldIndex = sceneItems.get(scene.sceneName).find(item => item.sourceName === OLD_STAGE).sceneItemIndex
      await obs.request('SetSceneItemIndex', { sceneName: name, sceneItemId: stage.sceneItemId, sceneItemIndex: oldIndex })
      await obs.request('SetSceneItemLocked', { sceneName: name, sceneItemId: stage.sceneItemId, sceneItemLocked: true })
    }
  }

  const afterInputs = (await obs.request('GetInputList')).inputs.map(input => input.inputName)
  if (afterInputs.includes(OLD_BASE) || afterInputs.includes(OLD_STAGE)) throw new Error('OBS_OLD_SOURCE_STILL_PRESENT')
  for (const scene of scenes) {
    const name = scene.sceneName === OLD_EMERGENCY ? NEW_EMERGENCY : scene.sceneName
    const items = (await obs.request('GetSceneItemList', { sceneName: name })).sceneItems
    if (items[0]?.sourceName !== BLACK || items.some(item => [OLD_BASE, OLD_STAGE].includes(item.sourceName))) {
      throw new Error('OBS_SCENE_VERIFY_FAILED_' + name)
    }
    if (fullScenes.includes(scene.sceneName) !== items.some(item => item.sourceName === NEW_STAGE)) {
      throw new Error('OBS_STAGE_VERIFY_FAILED_' + name)
    }
  }
  const afterCurrent = (await obs.request('GetCurrentProgramScene')).currentProgramSceneName
  if (afterCurrent !== current) throw new Error('OBS_CURRENT_SCENE_CHANGED')
  console.log(JSON.stringify({ result: 'OBS_STAGE_REFRESH_OK', scenes: scenes.length, newStageScenes: fullScenes.length, current, stageUrl, overlayUrl }, null, 2))
} finally {
  obs.close()
}
