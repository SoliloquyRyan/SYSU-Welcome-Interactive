import {
  PROTOCOL_POLICY,
  ProtocolCompatibilityError,
  assertProtocolEnvelope,
  assertV2CapabilityDiscovery,
  assertV2HandshakeResponse,
  createV2HandshakeRequest,
  protocolErrorMessage,
  upgradeRequired,
} from './protocol-compatibility'

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'SERVICE_UNAVAILABLE'
    this.status = options.status ?? 0
    this.requestId = options.requestId ?? null
    this.details = options.details ?? null
    this.retryable = options.retryable ?? false
    this.resetEpoch = options.resetEpoch ?? null
    this.recovery = options.recovery ?? null
  }
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const random = Math.random().toString(36).slice(2)
  return `web-${Date.now().toString(36)}-${random}`
}

export function commandVersion(snapshot) {
  const runtime = snapshot?.runtime ?? snapshot
  return {
    resetEpoch: runtime?.resetEpoch ?? 1,
    stageRevision: runtime?.stageRevision ?? 0,
  }
}

async function parseResponse(response, signal) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey)
  }

  const requestController = new AbortController()
  let timedOut = false
  const abortFromCaller = () => requestController.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true
    requestController.abort()
  }, 15_000)
  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: requestController.signal,
    })
    const payload = await parseResponse(response, requestController.signal)
    if (!response.ok) {
      const apiError = payload?.error
      throw new ApiError(apiError?.message ?? '操作未完成，请稍后重试。', {
        code: apiError?.code,
        status: response.status,
        requestId: apiError?.requestId,
        details: apiError?.details,
        retryable: apiError?.retryable,
        resetEpoch: payload?.resetEpoch,
        recovery: payload?.recovery,
      })
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (requestController.signal.aborted) {
      if (options.signal?.aborted && !timedOut) throw error
      throw new ApiError('请求等待超时；结果可能尚未确认，请使用原操作重试。')
    }
    throw new ApiError('无法连接现场服务，请检查网络后重试。')
  } finally {
    globalThis.clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function write(path, method, body, idempotencyKey) {
  return apiRequest(path, {
    method,
    body,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
  })
}

async function v1SnapshotResponse(responsePromise, context) {
  return assertProtocolEnvelope(await responsePromise, {
    policy: PROTOCOL_POLICY.V1_PREVIEW,
    context,
  })
}

export const participantApi = {
  activate(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/activate', 'POST', body, idempotencyKey),
      'participant activation snapshot',
    )
  },
  snapshot() {
    return v1SnapshotResponse(
      apiRequest('/api/participant/snapshot'),
      'participant snapshot',
    )
  },
  logout(idempotencyKey) {
    return write('/api/participant/logout', 'POST', {}, idempotencyKey)
  },
  submitCapsuleMessage(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/capsule-message', 'PUT', body, idempotencyKey),
      'participant capsule message snapshot',
    )
  },
  lockStarTemperature(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/star-temperature', 'PUT', body, idempotencyKey),
      'participant star temperature snapshot',
    )
  },
  startStar(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/star/start', 'POST', body, idempotencyKey),
      'participant star start snapshot',
    )
  },
  sendGift(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/gifts', 'POST', body, idempotencyKey),
      'participant gift snapshot',
    )
  },
  sendBarrage(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/barrages', 'POST', body, idempotencyKey),
      'participant barrage snapshot',
    )
  },
  light(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/participant/cooperative-light', 'POST', body, idempotencyKey),
      'participant cooperative light snapshot',
    )
  },
}

export const adminApi = {
  login(body) {
    return v1SnapshotResponse(
      apiRequest('/api/admin/login', { method: 'POST', body }),
      'admin login snapshot',
    )
  },
  logout(idempotencyKey) {
    return write('/api/admin/logout', 'POST', {}, idempotencyKey)
  },
  snapshot() {
    return v1SnapshotResponse(
      apiRequest('/api/admin/snapshot'),
      'admin snapshot',
    )
  },
  setRoles(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/admin/roles', 'PUT', body, idempotencyKey),
      'admin roles snapshot',
    )
  },
  runtime(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/admin/runtime', 'POST', body, idempotencyKey),
      'admin runtime snapshot',
    )
  },
  removeBarrage(id, body, idempotencyKey) {
    return v1SnapshotResponse(
      write(`/api/admin/barrages/${encodeURIComponent(id)}/remove`, 'POST', body, idempotencyKey),
      'admin barrage removal snapshot',
    )
  },
  blockSource(sourceId, body, idempotencyKey) {
    return v1SnapshotResponse(
      write(`/api/admin/sources/${encodeURIComponent(sourceId)}/block`, 'POST', body, idempotencyKey),
      'admin source block snapshot',
    )
  },
  pauseBarrages(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/admin/barrages/pause', 'POST', body, idempotencyKey),
      'admin barrage pause snapshot',
    )
  },
  clearBarrages(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/admin/barrages/clear', 'POST', body, idempotencyKey),
      'admin barrage clear snapshot',
    )
  },
  moderateCapsule(identityId, body, idempotencyKey) {
    return v1SnapshotResponse(
      write(`/api/admin/capsules/${encodeURIComponent(identityId)}/moderate`, 'POST', body, idempotencyKey),
      'admin capsule moderation snapshot',
    )
  },
  setInvitationStatus(id, body, idempotencyKey) {
    return v1SnapshotResponse(
      write(`/api/admin/invitations/${encodeURIComponent(id)}/status`, 'POST', body, idempotencyKey),
      'admin invitation status snapshot',
    )
  },
  reset(body, idempotencyKey) {
    return v1SnapshotResponse(
      write('/api/admin/reset', 'POST', body, idempotencyKey),
      'admin reset snapshot',
    )
  },
}

async function v2Response(responsePromise, context) {
  return assertProtocolEnvelope(await responsePromise, {
    policy: PROTOCOL_POLICY.V2_REQUIRED,
    context,
  })
}

export const v2AdminApi = {
  login(body) {
    return v2Response(apiRequest('/api/v2/admin/login', { method: 'POST', body }), 'v2 admin login')
  },
  logout() {
    return v2Response(apiRequest('/api/v2/admin/logout', { method: 'POST', body: {} }), 'v2 admin logout')
  },
  snapshot() {
    return v2Response(apiRequest('/api/v2/admin/snapshot'), 'v2 admin snapshot')
  },
  command(body) {
    return v2Response(apiRequest('/api/v2/admin/commands', { method: 'POST', body }), 'v2 admin command')
  },
}

export const v2ScreenApi = {
  snapshot() {
    return v2Response(apiRequest('/api/v2/screen/snapshot'), 'v2 screen snapshot')
  },
}

export const v2ParticipantApi = {
  activate(body) {
    return v2Response(
      apiRequest('/api/v2/participant/activate', { method: 'POST', body }),
      'v2 participant activation',
    )
  },
  snapshot(options = {}) {
    return v2Response(apiRequest('/api/v2/participant/snapshot', options), 'v2 participant snapshot')
  },
  command(body) {
    return v2Response(
      apiRequest('/api/v2/participant/commands', { method: 'POST', body }),
      'v2 participant command',
    )
  },
  logout() {
    return v2Response(
      apiRequest('/api/v2/participant/logout', { method: 'POST', body: {} }),
      'v2 participant logout',
    )
  },
}

export const screenApi = {
  ready() {
    return v1SnapshotResponse(
      apiRequest('/api/ready'),
      'screen readiness snapshot',
    )
  },
  snapshot() {
    return v1SnapshotResponse(
      apiRequest('/api/screen/snapshot'),
      'screen snapshot',
    )
  },
}

export const protocolCapabilityApi = {
  async discover() {
    try {
      return assertV2CapabilityDiscovery(
        await apiRequest('/api/protocol-capabilities'),
      )
    } catch (error) {
      if (error instanceof ProtocolCompatibilityError) throw error
      if (error instanceof ApiError && error.status === 404) {
        throw upgradeRequired('protocol capability discovery')
      }
      throw error
    }
  },
  async handshake(input) {
    const body = createV2HandshakeRequest(input)
    try {
      return assertV2HandshakeResponse(
        await apiRequest('/api/v2/handshake', { method: 'POST', body }),
        { expectedSurface: body.clientSurface },
      )
    } catch (error) {
      if (error instanceof ProtocolCompatibilityError) throw error
      if (error instanceof ApiError && error.status === 404) {
        throw upgradeRequired('v2 handshake')
      }
      throw error
    }
  },
}

export function publicErrorMessage(error) {
  if (error instanceof ProtocolCompatibilityError) {
    return protocolErrorMessage(error)
  }
  if (!(error instanceof ApiError)) return '操作未完成，请稍后重试。'
  const messages = {
    AUTH_REQUIRED: '当前会话已失效，请重新进入。',
    ROLE_REQUIRED: '当前会话缺少执行此操作的权限。',
    RATE_LIMITED: '操作太频繁，请稍后再试。',
    VALIDATION_FAILED: '请检查填写内容后重试。',
    IDEMPOTENCY_CONFLICT: '该操作无法安全重放，请刷新状态后重试。',
    STALE_STAGE: '现场阶段已经更新，正在同步最新状态。',
    RESET_EPOCH_CHANGED: '活动数据已重置，请重新进入。',
    RUNTIME_PAUSED: '现场互动已暂停。',
    RUNTIME_COMPLETED: '本场活动已经结束。',
    STALE_RESET_EPOCH: '活动数据已重置，请重新进入。',
    STAR_CAPACITY_REACHED: '公共星系名额已满。',
    ONBOARDING_STATE_INVALID: '当前入场步骤已经变化，正在同步。',
    SCENE_ACTION_INVALID: '当前现场环节不接受这项操作。',
    REVISION_CONFLICT: '状态已经更新，请同步后再试。',
    RESOURCE_NOT_FOUND: '相关节目或内容已不存在。',
    RESYNC_REQUIRED: '实时记录需要重新同步。',
    STAGE_LOCKED: '该任务当前尚未开放。',
    STAR_TEMPERATURE_LOCKED: '本场活动的恒星色温已经确认。',
    INSUFFICIENT_BALANCE: '动力值余额不足。',
    CONTENT_REJECTED: error.message,
    SOURCE_BLOCKED: '当前入口已暂停发送公开弹幕。',
    UPGRADE_REQUIRED: '当前页面需要升级后才能连接此服务。',
    PROTOCOL_VERSION_MISMATCH: '页面与服务端协议版本不一致。',
    SERVICE_UNAVAILABLE: '现场服务暂时不可用。',
  }
  const message = messages[error.code] ?? error.message
  return error.requestId ? `${message}（请求 ${error.requestId}）` : message
}
