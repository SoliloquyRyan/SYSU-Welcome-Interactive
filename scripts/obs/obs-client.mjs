import { createHash, randomUUID } from 'node:crypto'

export function obsAuthentication(password, salt, challenge) {
  const hash = value => createHash('sha256').update(value).digest('base64')
  return hash(hash(password + salt) + challenge)
}

export function connectObs({ url = 'ws://127.0.0.1:4455', password = '', subscriptions = 0, onEvent = () => {} } = {}) {
  const endpoint = new URL(url)
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
    || endpoint.username || endpoint.password) throw new Error('OBS_LOOPBACK_REQUIRED')
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let identified = false, finished = false, closeResolve
    const closed = new Promise(done => { closeResolve = done })
    const fail = code => {
      if (!identified) reject(new Error(code))
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(code)) }
      pending.clear(); clearTimeout(handshakeTimer); closeResolve(); finished = true
    }
    const handshakeTimer = setTimeout(() => { fail('OBS_HANDSHAKE_TIMEOUT'); socket.close() }, 7000)
    const client = {
      closed,
      request(requestType, requestData = {}) {
        if (!identified || finished || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('OBS_DISCONNECTED'))
        if (socket.bufferedAmount > 256 * 1024) return Promise.reject(new Error('OBS_BACKPRESSURE'))
        const requestId = randomUUID()
        return new Promise((done, failed) => {
          const timer = setTimeout(() => { pending.delete(requestId); failed(new Error('OBS_REQUEST_TIMEOUT')) }, 3500)
          pending.set(requestId, { resolve: done, reject: failed, timer })
          socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
        })
      },
      close() { socket.close(); fail('OBS_DISCONNECTED') },
    }
    socket.addEventListener('message', event => {
      try {
        const { op, d } = JSON.parse(event.data)
        if (op === 0) {
          if (d.rpcVersion < 1) throw new Error('OBS_RPC_UNSUPPORTED')
          const data = { rpcVersion: 1, eventSubscriptions: subscriptions }
          if (d.authentication) {
            if (!password) throw new Error('OBS_PASSWORD_REQUIRED')
            data.authentication = obsAuthentication(password, d.authentication.salt, d.authentication.challenge)
          }
          socket.send(JSON.stringify({ op: 1, d: data }))
        } else if (op === 2) {
          identified = true; clearTimeout(handshakeTimer); resolve(client)
        } else if (op === 7) {
          const request = pending.get(d.requestId)
          if (!request) return
          pending.delete(d.requestId); clearTimeout(request.timer)
          if (d.requestStatus?.result) request.resolve(d.responseData ?? {})
          else request.reject(new Error('OBS_REQUEST_' + (d.requestStatus?.code ?? 'FAILED')))
        } else if (op === 5 && identified) onEvent(d.eventType, d.eventData)
      } catch (error) {
        fail(error.message?.startsWith('OBS_') ? error.message : 'OBS_PROTOCOL_ERROR'); socket.close()
      }
    })
    socket.addEventListener('error', () => fail('OBS_CONNECTION_FAILED'))
    socket.addEventListener('close', () => fail('OBS_DISCONNECTED'))
  })
}
