export const PROTOCOL_VERSION = Object.freeze({
  V1: '1',
  V2: '2',
})

export const PROTOCOL_POLICY = Object.freeze({
  V1_PREVIEW: 'v1-preview',
  V2_REQUIRED: 'v2-required',
})

export const PROTOCOL_ERROR_CODE = Object.freeze({
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED',
  VERSION_MISMATCH: 'PROTOCOL_VERSION_MISMATCH',
})

const POLICIES = new Set(Object.values(PROTOCOL_POLICY))
const V2_CLIENT_SURFACES = new Set(['WELCOME', 'SCREEN', 'ADMIN'])
const V2_CAPABILITY_KEYS = [
  'snapshotFirst',
  'splitStreams',
  'v1WriteAcceptedByV2',
  'v2BusinessWrites',
  'v2RealtimeEvents',
  'v2Snapshots',
]

export class ProtocolCompatibilityError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'ProtocolCompatibilityError'
    this.code = code
    this.expectedVersion = options.expectedVersion ?? null
    this.actualVersion = options.actualVersion ?? null
    this.context = options.context ?? 'protocol payload'
  }
}

function mismatch(context, expectedVersion, actualVersion, code) {
  const actualLabel =
    actualVersion === undefined ? 'missing' : JSON.stringify(actualVersion)
  return new ProtocolCompatibilityError(
    code,
    `${context} 使用了不兼容的协议版本（需要 ${expectedVersion}，收到 ${actualLabel}）。`,
    { context, expectedVersion, actualVersion },
  )
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  return (
    actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
  )
}

function malformed(context, actualVersion) {
  throw mismatch(
    context,
    PROTOCOL_VERSION.V2,
    actualVersion,
    PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
  )
}

export function upgradeRequired(context, actualVersion) {
  return mismatch(
    context,
    PROTOCOL_VERSION.V2,
    actualVersion,
    PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
  )
}

export function expectedVersionForPolicy(policy) {
  if (policy === PROTOCOL_POLICY.V1_PREVIEW) return PROTOCOL_VERSION.V1
  if (policy === PROTOCOL_POLICY.V2_REQUIRED) return PROTOCOL_VERSION.V2
  throw new TypeError(`Unknown protocol policy: ${String(policy)}`)
}

export function assertProtocolEnvelope(value, options = {}) {
  const policy = options.policy
  const context = options.context ?? 'protocol payload'
  if (!POLICIES.has(policy)) {
    throw new TypeError(`A supported protocol policy is required for ${context}.`)
  }

  const expectedVersion = expectedVersionForPolicy(policy)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mismatch(
      context,
      expectedVersion,
      undefined,
      PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
    )
  }

  const actualVersion = value.protocolVersion
  if (actualVersion === expectedVersion) return value

  const needsUpgrade =
    (policy === PROTOCOL_POLICY.V2_REQUIRED
      && (actualVersion === undefined || actualVersion === PROTOCOL_VERSION.V1))
    || (policy === PROTOCOL_POLICY.V1_PREVIEW
      && actualVersion === PROTOCOL_VERSION.V2)

  throw mismatch(
    context,
    expectedVersion,
    actualVersion,
    needsUpgrade
      ? PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED
      : PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
  )
}

export function createProtocolGate(policy) {
  expectedVersionForPolicy(policy)
  let failure = null

  return {
    accept(value, context) {
      if (failure) throw failure
      try {
        return assertProtocolEnvelope(value, { policy, context })
      } catch (error) {
        if (error instanceof ProtocolCompatibilityError) failure = error
        throw error
      }
    },
    get blocked() {
      return failure !== null
    },
    get failure() {
      return failure
    },
  }
}

function assertActivationFields(value, context) {
  if (
    value.contractVersion !== PROTOCOL_VERSION.V2
    || typeof value.serverTime !== 'string'
    || Number.isNaN(Date.parse(value.serverTime))
  ) {
    malformed(context, value.contractVersion)
  }

  const contractsReady =
    value.activationState === 'CONTRACTS_READY'
    && value.activeRuntimeVersion === PROTOCOL_VERSION.V1
  const active =
    value.activationState === 'ACTIVE'
    && value.activeRuntimeVersion === PROTOCOL_VERSION.V2
  if (!contractsReady && !active) malformed(context, value.activeRuntimeVersion)
  return active
}

function assertV2Capabilities(value, context, runtimeActive) {
  if (!hasExactKeys(value, V2_CAPABILITY_KEYS)) malformed(context)
  if (
    value.v2BusinessWrites !== runtimeActive
    || value.v2Snapshots !== runtimeActive
    || value.v2RealtimeEvents !== runtimeActive
    || value.snapshotFirst !== true
    || value.splitStreams !== true
    || value.v1WriteAcceptedByV2 !== false
  ) {
    malformed(context)
  }
  return value
}

export function isV2RuntimeActive(value) {
  return Boolean(
    value
    && value.contractVersion === PROTOCOL_VERSION.V2
    && value.activeRuntimeVersion === PROTOCOL_VERSION.V2
    && value.activationState === 'ACTIVE'
    && value.capabilities?.v2BusinessWrites === true
    && value.capabilities?.v2Snapshots === true
    && value.capabilities?.v2RealtimeEvents === true,
  )
}

function classifyMissingContract(value, context) {
  const actualVersion = isRecord(value) ? value.contractVersion : undefined
  if (
    isRecord(value)
    && (actualVersion === undefined || actualVersion === PROTOCOL_VERSION.V1)
  ) {
    throw upgradeRequired(context, actualVersion)
  }
  if (!isRecord(value)) malformed(context, actualVersion)
}

export function assertV2CapabilityDiscovery(value) {
  const context = 'protocol capability discovery'
  classifyMissingContract(value, context)
  const active = value?.activationState === 'ACTIVE'
  if (
    !hasExactKeys(value, [
      'service',
      'contractVersion',
      'activeRuntimeVersion',
      'activationState',
      ...(active ? ['resetEpoch'] : []),
      'serverTime',
      'endpoints',
      'capabilities',
    ])
    || value.service !== 'sysu-welcome-backend'
    || !hasExactKeys(value.endpoints, ['v2Handshake', 'v2Realtime'])
    || value.endpoints.v2Handshake !== '/api/v2/handshake'
    || value.endpoints.v2Realtime !== '/ws/v2'
  ) {
    malformed(context, value.contractVersion)
  }
  const runtimeActive = assertActivationFields(value, context)
  if (runtimeActive && (!Number.isInteger(value.resetEpoch) || value.resetEpoch < 1)) {
    malformed(context, value.activeRuntimeVersion)
  }
  assertV2Capabilities(value.capabilities, context, runtimeActive)
  return value
}

export function createV2HandshakeRequest(input) {
  if (
    !hasExactKeys(input, ['clientSurface', 'clientBuild'])
    || !V2_CLIENT_SURFACES.has(input.clientSurface)
    || typeof input.clientBuild !== 'string'
    || input.clientBuild.trim() === ''
  ) {
    malformed('v2 handshake request')
  }
  return {
    protocolVersion: PROTOCOL_VERSION.V2,
    clientSurface: input.clientSurface,
    clientBuild: input.clientBuild,
  }
}

export function assertV2HandshakeResponse(value, options = {}) {
  const context = 'v2 handshake response'
  assertProtocolEnvelope(value, {
    policy: PROTOCOL_POLICY.V2_REQUIRED,
    context,
  })
  const active = value?.activationState === 'ACTIVE'
  if (
    !hasExactKeys(value, [
      'status',
      'protocolVersion',
      'contractVersion',
      'activeRuntimeVersion',
      'activationState',
      ...(active ? ['resetEpoch'] : []),
      'clientSurface',
      'serverTime',
      'capabilities',
    ])
    || value.status !== 'ok'
    || !V2_CLIENT_SURFACES.has(value.clientSurface)
    || (
      options.expectedSurface !== undefined
      && value.clientSurface !== options.expectedSurface
    )
  ) {
    malformed(context, value.protocolVersion)
  }
  const runtimeActive = assertActivationFields(value, context)
  if (runtimeActive && (!Number.isInteger(value.resetEpoch) || value.resetEpoch < 1)) {
    malformed(context, value.activeRuntimeVersion)
  }
  assertV2Capabilities(value.capabilities, context, runtimeActive)
  return value
}

export function protocolErrorMessage(error) {
  if (!(error instanceof ProtocolCompatibilityError)) {
    return '协议检查失败，请刷新后重试。'
  }
  if (error.code === PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED) {
    return '当前页面版本与服务端不兼容，请升级或切换到对应版本后重试。'
  }
  return '服务端返回了无法识别的协议数据，连接已停止。'
}
