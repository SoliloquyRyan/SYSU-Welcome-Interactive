import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  boundedMobileStars,
  mobileAmbientPlacement,
  mobileStarPlacement,
} from '../../frontend/src/pages/student/mobile-galaxy-renderer.js'
import {
  participantEventFrameValid,
  participantHelloAckValid,
  participantStreamsCaughtUp,
  participantSubscribedFrameValid,
  participantSubscriptionHighWaterValid,
  participantSubscriptionStreamsValid,
} from '../../frontend/src/composables/useV2ParticipantRealtime.js'
import {
  COLOR_CONFIRM_CINEMATIC_DURATION_MS,
  DISCOVERY_CINEMATIC_DURATION_MS,
  DISCOVERY_VISIBLE_STABLE_MS,
  DISCOVERY_VISIBLE_WAIT_MAX_MS,
  ORBIT_HANDOFF_CINEMATIC_DURATION_MS,
  actionAllowed,
  mobileSceneCopy,
  participantCommand,
  participantCommandAttempt,
  participantSnapshotCanReplace,
  shouldFinishCinematicOnHidden,
  shouldPlayDiscovery,
  shouldPlayOrbitHandoff,
  shouldPlayPullback,
  upsertPublicStar,
  visibleCharacterCount,
} from '../../frontend/src/pages/student/v2-mobile-state.js'

const ROOT = path.resolve(import.meta.dirname, '../..')

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '2',
    resetEpoch: 4,
    runtime: {
      mode: 'LIVE', status: 'RUNNING', currentScene: 'ASSEMBLY', runRevision: 3,
    },
    participant: {
      participantRevision: 5,
      onboardingState: 'ADMITTED',
      ownPublicStarId: 'L-4821',
      allowedActions: ['START_STAR'],
    },
    publicStars: [
      {
        publicStarId: 'L-4821', formationSlot: 'slot:opaque-001',
        displayColor: '#fff4df', starRevision: 1,
      },
    ],
    ...overrides,
  }
}

describe('V2-08 mobile state and motion gates', () => {
  it('uses human scene copy without exposing numeric stages or raw runtime state', () => {
    expect(mobileSceneCopy(snapshot())).toEqual({
      title: '星海集结', subtitle: '让你的星，在此刻正式启程',
    })
    expect(mobileSceneCopy(snapshot({
      runtime: { mode: 'LIVE', status: 'READY', currentScene: null, runRevision: 0 },
    })).title).toBe('已抵达，等待全场启程')
    expect(mobileSceneCopy(snapshot({
      runtime: {
        mode: 'LIVE', status: 'COMPLETED', currentScene: 'COOPERATIVE_LIGHT', runRevision: 7,
      },
    })).title).toBe('今夜的星河，已经成形')
  })

  it('plays discovery only for a newly created normal-motion identity', () => {
    expect(shouldPlayDiscovery({
      activationCreated: true, onboardingState: 'NEEDS_COLOR', reducedMotion: false,
    })).toBe(true)
    for (const input of [
      { activationCreated: false, onboardingState: 'NEEDS_COLOR', reducedMotion: false },
      { activationCreated: true, onboardingState: 'ADMITTED', reducedMotion: false },
      { activationCreated: true, onboardingState: 'NEEDS_COLOR', reducedMotion: true },
    ]) expect(shouldPlayDiscovery(input)).toBe(false)
  })

  it('uses one bounded D-027 timing contract and only finishes an already-playing cinematic on hide', () => {
    expect(DISCOVERY_CINEMATIC_DURATION_MS).toBe(5400)
    expect(DISCOVERY_VISIBLE_STABLE_MS).toBeGreaterThanOrEqual(180)
    expect(DISCOVERY_VISIBLE_STABLE_MS).toBeLessThanOrEqual(250)
    expect(DISCOVERY_VISIBLE_WAIT_MAX_MS).toBeGreaterThan(DISCOVERY_VISIBLE_STABLE_MS)
    expect(DISCOVERY_VISIBLE_WAIT_MAX_MS).toBeLessThanOrEqual(5000)
    expect(shouldFinishCinematicOnHidden('discovery-pending')).toBe(false)
    expect(shouldFinishCinematicOnHidden('discovering')).toBe(true)
    expect(COLOR_CONFIRM_CINEMATIC_DURATION_MS).toBe(1000)
    expect(ORBIT_HANDOFF_CINEMATIC_DURATION_MS).toBe(4200)
    expect(shouldFinishCinematicOnHidden('color-confirm')).toBe(true)
    expect(shouldFinishCinematicOnHidden('orbit-handoff')).toBe(true)
    expect(shouldFinishCinematicOnHidden('')).toBe(false)
  })

  it('starts pullback only after the authoritative snapshot contains the own public star', () => {
    expect(shouldPlayPullback({
      previousState: 'NEEDS_COLOR', nextSnapshot: {
        participant: { onboardingState: 'ADMITTED', ownPublicStarId: 'L-4821' },
        publicStars: [{ publicStarId: 'L-4821' }],
      }, reducedMotion: false,
    })).toBe(true)
    expect(shouldPlayPullback({
      previousState: 'NEEDS_COLOR', nextSnapshot: {
        participant: { onboardingState: 'ADMITTED', ownPublicStarId: 'L-4821' },
        publicStars: [],
      }, reducedMotion: false,
    })).toBe(false)
    expect(shouldPlayPullback({
      previousState: 'NEEDS_COLOR', nextSnapshot: {
        participant: { onboardingState: 'ADMITTED', ownPublicStarId: 'L-4821' },
        publicStars: [{ publicStarId: 'L-4821' }],
      }, reducedMotion: true,
    })).toBe(false)
  })

  it('starts the final orbit handoff after locking color directly admits the participant', () => {
    const admittedSnapshot = {
      participant: { onboardingState: 'ADMITTED', ownPublicStarId: 'L-4821' },
      publicStars: [{ publicStarId: 'L-4821' }],
    }
    expect(shouldPlayOrbitHandoff({
      previousState: 'NEEDS_COLOR', nextSnapshot: admittedSnapshot, reducedMotion: false,
    })).toBe(true)
    expect(shouldPlayOrbitHandoff({
      previousState: 'ADMITTED', nextSnapshot: admittedSnapshot, reducedMotion: false,
    })).toBe(false)
    expect(shouldPlayOrbitHandoff({
      previousState: 'NEEDS_COLOR', nextSnapshot: admittedSnapshot, reducedMotion: true,
    })).toBe(false)
    expect(shouldPlayOrbitHandoff({
      previousState: 'NEEDS_COLOR',
      nextSnapshot: { ...admittedSnapshot, publicStars: [] },
      reducedMotion: false,
    })).toBe(false)
  })

  it('derives writes only from server allowedActions and current revisions', () => {
    const current = snapshot()
    expect(actionAllowed(current, 'START_STAR')).toBe(true)
    expect(actionAllowed(current, 'POST_BARRAGE')).toBe(false)
    expect(participantCommand(current, 'START_STAR', 'mobile-key-0001')).toEqual({
      protocolVersion: '2', resetEpoch: 4, idempotencyKey: 'mobile-key-0001',
      expectedParticipantRevision: 5, command: 'START_STAR',
    })
  })

  it('reuses the exact request after an unknown result but creates a new key for changed input', () => {
    const first = participantCommandAttempt(
      snapshot(),
      'SEND_GIFT',
      { programId: 'program-01', giftId: 'gift-star' },
      null,
      () => 'mobile-key-0001',
    )
    const advanced = snapshot({
      participant: {
        participantRevision: 6,
        onboardingState: 'ADMITTED',
        ownPublicStarId: 'L-4821',
        allowedActions: ['SEND_GIFT'],
      },
    })
    const retry = participantCommandAttempt(
      advanced,
      'SEND_GIFT',
      { programId: 'program-01', giftId: 'gift-star' },
      first,
      () => 'mobile-key-0002',
    )
    expect(retry).toBe(first)
    expect(retry.request.expectedParticipantRevision).toBe(5)

    const changedGift = participantCommandAttempt(
      advanced,
      'SEND_GIFT',
      { programId: 'program-01', giftId: 'gift-comet' },
      first,
      () => 'mobile-key-0002',
    )
    expect(changedGift.key).toBe('mobile-key-0002')
    expect(changedGift.request.expectedParticipantRevision).toBe(6)
  })

  it('rejects stale snapshot responses and stale public-star revisions', () => {
    const current = {
      ...snapshot(),
      publicSeq: 9,
      participantSeq: 7,
      participantStreamId: 'participant:synthetic-001',
      presentationRevision: 4,
      aggregateRevision: 6,
      interaction: { interactionRevision: 3 },
    }
    expect(participantSnapshotCanReplace(current, {
      ...current,
      publicSeq: 10,
      participantSeq: 8,
      participant: { ...current.participant, participantRevision: 6 },
    })).toBe(true)
    expect(participantSnapshotCanReplace(current, {
      ...current,
      publicSeq: 8,
    })).toBe(false)
    expect(participantSnapshotCanReplace(current, {
      ...current,
      participant: { ...current.participant, participantRevision: 4 },
    })).toBe(false)

    const stars = [{ publicStarId: 'L-4821', starRevision: 3, displayColor: '#fff' }]
    expect(upsertPublicStar(stars, {
      publicStarId: 'L-4821', starRevision: 2, displayColor: '#f00',
    })).toBe(false)
    expect(stars[0].displayColor).toBe('#fff')
    expect(upsertPublicStar(stars, {
      publicStarId: 'L-4821', starRevision: 4, displayColor: '#0ff',
    })).toBe(true)
    expect(stars[0].displayColor).toBe('#0ff')
  })

  it('keeps writes closed until both authorized realtime streams reach the subscribed high-water marks', () => {
    const current = {
      publicSeq: 7,
      participantSeq: 11,
      participantStreamId: 'participant:synthetic-001',
    }
    const accepted = [
      { streamId: 'public', streamSeq: 8 },
      { streamId: 'participant:synthetic-001', streamSeq: 11 },
    ]
    expect(participantSubscriptionStreamsValid(current, accepted)).toBe(true)
    expect(participantStreamsCaughtUp(current, accepted)).toBe(false)
    expect(participantStreamsCaughtUp({ ...current, publicSeq: 8 }, accepted)).toBe(true)
    for (const invalid of [
      [{ streamId: 'public', streamSeq: 8 }, { streamId: 'public', streamSeq: 8 }],
      [{ streamId: 'public', streamSeq: 8 }, { streamId: 'admin', streamSeq: 0 }],
      [{ streamId: 'public', streamSeq: -1 }, ...accepted.slice(1)],
    ]) {
      expect(participantSubscriptionStreamsValid(current, invalid)).toBe(false)
      expect(participantStreamsCaughtUp(current, invalid)).toBe(false)
    }
  })

  it('accepts only a strict ACTIVE v2 welcome HELLO_ACK', () => {
    const current = { resetEpoch: 4 }
    const frame = {
      type: 'HELLO_ACK',
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '2',
      activationState: 'ACTIVE',
      resetEpoch: 4,
      clientSurface: 'WELCOME',
      serverTime: '2026-08-14T03:00:00.000Z',
      capabilities: {
        v2BusinessWrites: true,
        v2Snapshots: true,
        v2RealtimeEvents: true,
        snapshotFirst: true,
        splitStreams: true,
        v1WriteAcceptedByV2: false,
      },
    }

    expect(participantHelloAckValid(current, frame)).toBe(true)
    for (const invalid of [
      { ...frame, protocolVersion: '1' },
      { ...frame, contractVersion: '1' },
      { ...frame, activeRuntimeVersion: '1' },
      { ...frame, activationState: 'CONTRACTS_READY' },
      { ...frame, resetEpoch: 5 },
      { ...frame, clientSurface: 'SCREEN' },
      { ...frame, unexpected: true },
      {
        ...frame,
        capabilities: { ...frame.capabilities, v2RealtimeEvents: false },
      },
    ]) expect(participantHelloAckValid(current, invalid)).toBe(false)
  })

  it('requires exact participant subscription streams and non-regressing high-water marks', () => {
    const requested = {
      resetEpoch: 4,
      publicSeq: 7,
      participantSeq: 11,
      participantStreamId: 'participant:synthetic-001',
    }
    const streams = [
      { streamId: 'public', streamSeq: 8 },
      { streamId: 'participant:synthetic-001', streamSeq: 11 },
    ]
    const frame = {
      type: 'SUBSCRIBED', protocolVersion: '2', resetEpoch: 4, streams,
    }

    expect(participantSubscriptionHighWaterValid(requested, streams)).toBe(true)
    expect(participantSubscribedFrameValid(requested, frame)).toBe(true)

    const regressed = [
      { streamId: 'public', streamSeq: 6 },
      { streamId: 'participant:synthetic-001', streamSeq: 11 },
    ]
    expect(participantSubscriptionStreamsValid(requested, regressed)).toBe(true)
    expect(participantSubscriptionHighWaterValid(requested, regressed)).toBe(false)
    for (const invalid of [
      { ...frame, protocolVersion: '1' },
      { ...frame, resetEpoch: 5 },
      { ...frame, streams: regressed },
      { ...frame, streams: streams.slice(0, 1) },
      { ...frame, streams: [streams[0], streams[0]] },
      { ...frame, streams: [{ ...streams[0], streamSeq: 7.5 }, streams[1]] },
      { ...frame, contractVersion: '2' },
    ]) expect(participantSubscribedFrameValid(requested, invalid)).toBe(false)
  })

  it('accepts only strict authorized v2 event envelopes from the current epoch', () => {
    const current = {
      resetEpoch: 4,
      participantStreamId: 'participant:synthetic-001',
    }
    const publicFrame = {
      protocolVersion: '2',
      resetEpoch: 4,
      streamId: 'public',
      streamSeq: 8,
      eventId: '4:public:8',
      name: 'aggregate.changed',
      revision: 6,
      payload: {
        projection: 'PUBLIC_AGGREGATE',
        aggregateRevision: 6,
        aggregate: {
          activatedCount: 1,
          publicStarCount: 1,
          admittedCount: 1,
          starStartedCount: 0,
          cooperativeLightCount: 0,
          totalStarlight: 0,
        },
      },
    }
    const participantFrame = {
      protocolVersion: '2',
      resetEpoch: 4,
      streamId: 'participant:synthetic-001',
      streamSeq: 12,
      eventId: '4:participant:synthetic-001:12',
      name: 'participant.snapshot.changed',
      revision: 9,
      payload: {
        projection: 'SELF', participantRevision: 9, requiresSnapshot: true,
      },
    }

    expect(participantEventFrameValid(current, publicFrame)).toBe(true)
    expect(participantEventFrameValid(current, participantFrame)).toBe(true)
    for (const invalid of [
      { ...publicFrame, protocolVersion: '1' },
      { ...publicFrame, resetEpoch: 5, eventId: '5:public:8' },
      { ...publicFrame, streamSeq: 0, eventId: '4:public:0' },
      { ...publicFrame, streamId: 'admin', eventId: '4:admin:8' },
      { ...publicFrame, eventId: 'forged' },
      { ...publicFrame, revision: 7 },
      { ...publicFrame, name: 'unknown.changed' },
      { ...publicFrame, contractVersion: '2' },
      { ...participantFrame, payload: { ...participantFrame.payload, requiresSnapshot: false } },
    ]) expect(participantEventFrameValid(current, invalid)).toBe(false)
  })

  it('counts visible graphemes rather than UTF-16 units', () => {
    expect(visibleCharacterCount(` ${'👨‍👩‍👧‍👦'.repeat(80)} `)).toBe(80)
    expect(visibleCharacterCount('e\u0301')).toBe(1)
  })

  it('keeps real star placement stable by opaque slot and inside phone canvases', () => {
    const source = { formationSlot: 'slot:opaque-042' }
    const first = mobileStarPlacement(source, 390, 844, 0, true)
    expect(mobileStarPlacement({ ...source, publicStarId: 'DIFFERENT' }, 390, 844, 0, true))
      .toEqual(first)
    expect(mobileStarPlacement({ formationSlot: 'slot:opaque-043' }, 390, 844, 0, true))
      .not.toEqual(first)
    for (const width of [375, 390, 667]) {
      for (const height of [420, 667, 844]) {
        for (let index = 0; index < 300; index += 1) {
          const point = mobileStarPlacement(
            { formationSlot: `slot:synthetic-${index}` }, width, height, 60_000, false,
          )
          expect(point.x).toBeGreaterThanOrEqual(8)
          expect(point.x).toBeLessThanOrEqual(width - 8)
          expect(point.y).toBeGreaterThanOrEqual(8)
          expect(point.y).toBeLessThanOrEqual(height - 8)
        }
      }
    }
  })

  it('reports a protocol capacity violation instead of silently accepting more than 300 stars', () => {
    const stars = Array.from({ length: 301 }, (_, index) => ({ publicStarId: `S-${index}` }))
    const violations: number[] = []
    expect(boundedMobileStars(stars, (count) => violations.push(count))).toHaveLength(300)
    expect(violations).toEqual([301])
    expect(boundedMobileStars(stars.slice(0, 300), (count) => violations.push(count))).toHaveLength(300)
    expect(violations).toEqual([301])
  })

  it('keeps decorative orbit dust deterministic, bounded, and static in reduced motion', () => {
    for (const reduced of [false, true]) {
      for (let index = 0; index < 112; index += 1) {
        const point = mobileAmbientPlacement(index, 390, 844, 24_000, reduced)
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(390)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(844)
        expect(point.alpha).toBeLessThanOrEqual(0.26)
      }
    }
    expect(mobileAmbientPlacement(18, 390, 844, 0, false))
      .not.toEqual(mobileAmbientPlacement(18, 390, 844, 24_000, false))
    expect(mobileAmbientPlacement(18, 390, 844, 0, true))
      .toEqual(mobileAmbientPlacement(18, 390, 844, 24_000, true))
  })

  it('keeps the mobile implementation free of GSAP and stage-one-to-six wording', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/V2WelcomeExperience.vue'), 'utf8',
    )
    const template = page.match(/<template>([\s\S]*?)<\/template>/u)?.[1] ?? ''
    expect(page).not.toMatch(/\bgsap\b/iu)
    expect(template).not.toMatch(/>\s*RUNNING\s*<|\d\s*\/\s*6|实时同步/u)
    expect(template).not.toContain('跳过动画')
  })

  it('uses the shared production journey renderer for the D-030 personal-star sequence', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/V2WelcomeExperience.vue'), 'utf8',
    )
    const stage = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/PersonalJourneyStage.vue'), 'utf8',
    )
    const renderer = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/personal-journey-renderer.js'), 'utf8',
    )
    const timeline = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/personal-journey-timeline.js'), 'utf8',
    )
    const activationFlow = page.match(
      /async function acceptActivation[\s\S]*?\r?\n\}\r?\n\r?\nasync function activate/u,
    )?.[0] ?? ''
    expect(activationFlow.indexOf("cinematic.value = 'discovery-pending'"))
      .toBeLessThan(activationFlow.indexOf('await waitForStableDocumentVisibility()'))
    expect(activationFlow.indexOf('await waitForStableDocumentVisibility()'))
      .toBeLessThan(activationFlow.indexOf("cinematic.value = 'discovering'"))
    expect(activationFlow).toContain('await nextTick()')
    expect(activationFlow).toContain(
      'await waitForJourneyPhase(PERSONAL_JOURNEY_PHASES.DISCOVERY, DISCOVERY_CINEMATIC_DURATION_MS)',
    )
    expect(activationFlow.indexOf('realtimeConnection = realtime.connect()'))
      .toBeLessThan(activationFlow.indexOf('if (shouldPlayDiscovery({'))

    const activationEntry = page.match(
      /async function activate\(method, fields\)[\s\S]*?const activationSession/u,
    )?.[0] ?? ''
    expect(activationEntry).toContain("if (busy.value === 'activation') return")

    const journeyWait = page.match(
      /function waitForJourneyPhase[\s\S]*?\r?\n\}\r?\n\r?\nasync function acceptActivation/u,
    )?.[0] ?? ''
    expect(journeyWait).toContain('journeyStage.value?.waitForPhase(phase)')
    expect(journeyWait).toContain('duration + 450')

    const template = page.match(/<template>([\s\S]*?)<\/template>/u)?.[1] ?? ''
    expect(template.match(/<PersonalJourneyStage/gu)).toHaveLength(1)
    expect(template.match(/data-testid="persistent-color-controls"/gu)).toHaveLength(1)
    expect(template.match(/participant\?\.onboardingState === 'NEEDS_COLOR'/gu)?.length).toBeGreaterThanOrEqual(2)
    expect(template).toContain(':inert="discoveryActive ? true : undefined"')
    expect(template).toContain("connectionMessage && participant?.onboardingState !== 'NEEDS_COLOR'")
    expect(template).toContain('{{ colorConnectionMessage }}')
    expect(template).not.toContain('selected-star')
    expect(template).not.toContain('cinematic__flight')
    expect(stage).toContain('nebula-master.webp')
    expect(stage).toContain('data-background-system="orbital-signal-reset"')
    expect(stage).toContain('publicStars: []')
    expect(stage).toContain('renderer?.waitForPhase(phase)')
    expect(renderer).toContain('drawDiscoveryMotes')
    expect(renderer).toContain('drawOrbitDust(context, width, height, frame, false)')
    expect(renderer).toContain('drawHeroStar')
    expect(renderer).toContain('drawOrbitDust(context, width, height, frame, true)')
    expect(timeline).toContain('farStars: 150')
    expect(timeline).toContain('discoveryMotes: 78')
    expect(timeline).toContain('orbitDust: 156')
  })

  it('uses the approved local college wordmark as an accessible official-site link', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'frontend/src/pages/student/V2WelcomeExperience.vue'), 'utf8',
    )
    const template = page.match(/<template>([\s\S]*?)<\/template>/u)?.[1] ?? ''
    const wordmark = fs.readFileSync(
      path.join(ROOT, 'frontend/src/assets/brand/sysu-intelligent-engineering-white.png'),
    )
    expect(createHash('sha256').update(wordmark).digest('hex').toUpperCase())
      .toBe('5E665D84994508A6A5BF106EF87A22E0CC443EA63634B5384A310EF3A498C008')
    expect(page).toContain("const COLLEGE_WEBSITE_URL = 'https://ise.sysu.edu.cn/'")
    expect(page).toContain("import collegeWordmarkUrl from '../../assets/brand/sysu-intelligent-engineering-white.png'")
    expect(template).toContain(':href="COLLEGE_WEBSITE_URL"')
    expect(template).toContain('target="_blank"')
    expect(template).toContain('rel="noopener noreferrer external"')
    expect(template).toContain('aria-label="访问中山大学智能工程学院官网（新窗口打开）"')
    expect(template).toContain(':inert="headerUnavailable ? true : undefined"')
    expect(template).not.toContain('SYSU · 智能工程学院')
    expect(template).not.toContain('<h1>星际信标</h1>')
    expect(template).not.toContain('own-star-identity')
    expect(page).toMatch(/\.v2-welcome__college-link\s*\{[\s\S]*?min-height:\s*44px/u)
  })
})
