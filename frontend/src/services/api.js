export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'SERVICE_UNAVAILABLE'
    this.status = options.status ?? 0
    this.requestId = options.requestId ?? null
    this.details = options.details ?? null
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

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey)
  }

  const timeoutController = options.signal ? null : new AbortController()
  const timeoutId = timeoutController
    ? globalThis.setTimeout(() => timeoutController.abort(), 15_000)
    : null
  let response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? timeoutController.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('请求等待超时；结果可能尚未确认，请使用原操作重试。')
    }
    throw new ApiError('无法连接本地 Demo 服务，请检查网络后重试。')
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
  }

  const payload = await parseResponse(response)
  if (!response.ok) {
    const apiError = payload?.error
    throw new ApiError(apiError?.message ?? '操作未完成，请稍后重试。', {
      code: apiError?.code,
      status: response.status,
      requestId: apiError?.requestId,
      details: apiError?.details,
    })
  }
  return payload
}

function write(path, method, body, idempotencyKey) {
  return apiRequest(path, {
    method,
    body,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
  })
}

export const participantApi = {
  activate(body, idempotencyKey) {
    return write('/api/participant/activate', 'POST', body, idempotencyKey)
  },
  snapshot() {
    return apiRequest('/api/participant/snapshot')
  },
  logout(idempotencyKey) {
    return write('/api/participant/logout', 'POST', {}, idempotencyKey)
  },
  submitCapsuleMessage(body, idempotencyKey) {
    return write('/api/participant/capsule-message', 'PUT', body, idempotencyKey)
  },
  lockStarTemperature(body, idempotencyKey) {
    return write('/api/participant/star-temperature', 'PUT', body, idempotencyKey)
  },
  startStar(body, idempotencyKey) {
    return write('/api/participant/star/start', 'POST', body, idempotencyKey)
  },
  sendGift(body, idempotencyKey) {
    return write('/api/participant/gifts', 'POST', body, idempotencyKey)
  },
  sendBarrage(body, idempotencyKey) {
    return write('/api/participant/barrages', 'POST', body, idempotencyKey)
  },
  light(body, idempotencyKey) {
    return write('/api/participant/cooperative-light', 'POST', body, idempotencyKey)
  },
}

export const adminApi = {
  login(body) {
    return apiRequest('/api/admin/login', { method: 'POST', body })
  },
  logout(idempotencyKey) {
    return write('/api/admin/logout', 'POST', {}, idempotencyKey)
  },
  snapshot() {
    return apiRequest('/api/admin/snapshot')
  },
  setRoles(body, idempotencyKey) {
    return write('/api/admin/roles', 'PUT', body, idempotencyKey)
  },
  runtime(body, idempotencyKey) {
    return write('/api/admin/runtime', 'POST', body, idempotencyKey)
  },
  removeBarrage(id, body, idempotencyKey) {
    return write(`/api/admin/barrages/${encodeURIComponent(id)}/remove`, 'POST', body, idempotencyKey)
  },
  blockSource(sourceId, body, idempotencyKey) {
    return write(`/api/admin/sources/${encodeURIComponent(sourceId)}/block`, 'POST', body, idempotencyKey)
  },
  pauseBarrages(body, idempotencyKey) {
    return write('/api/admin/barrages/pause', 'POST', body, idempotencyKey)
  },
  clearBarrages(body, idempotencyKey) {
    return write('/api/admin/barrages/clear', 'POST', body, idempotencyKey)
  },
  setInvitationStatus(id, body, idempotencyKey) {
    return write(`/api/admin/invitations/${encodeURIComponent(id)}/status`, 'POST', body, idempotencyKey)
  },
  reset(body, idempotencyKey) {
    return write('/api/admin/reset', 'POST', body, idempotencyKey)
  },
}

export const screenApi = {
  ready() {
    return apiRequest('/api/ready')
  },
  snapshot() {
    return apiRequest('/api/screen/snapshot')
  },
}

export function publicErrorMessage(error) {
  if (!(error instanceof ApiError)) return '操作未完成，请稍后重试。'
  const messages = {
    AUTH_REQUIRED: '当前会话已失效，请重新进入。',
    ROLE_REQUIRED: '当前会话缺少执行此操作的权限。',
    RATE_LIMITED: '操作太频繁，请稍后再试。',
    VALIDATION_FAILED: '请检查填写内容后重试。',
    IDEMPOTENCY_CONFLICT: '该操作无法安全重放，请刷新状态后重试。',
    STALE_STAGE: '现场阶段已经更新，正在同步最新状态。',
    RESET_EPOCH_CHANGED: 'Demo 已重置，请重新进入。',
    RUNTIME_PAUSED: '现场互动已暂停。',
    STAGE_LOCKED: '该任务当前尚未开放。',
    STAR_TEMPERATURE_LOCKED: '本场活动的恒星色温已经确认。',
    INSUFFICIENT_BALANCE: '动力值余额不足。',
    CONTENT_REJECTED: error.message,
    SOURCE_BLOCKED: '当前入口已暂停发送公开弹幕。',
    SERVICE_UNAVAILABLE: '本地 Demo 服务暂时不可用。',
  }
  const message = messages[error.code] ?? error.message
  return error.requestId ? `${message}（请求 ${error.requestId}）` : message
}
