import type { FastifyInstance } from 'fastify'

import { ApiErrorResponseSchema } from '@sysu-welcome/contracts'

function authorityFromHostHeader(host: string): string | null {
  try {
    const url = new URL(`http://${host}`)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null
    }
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

export function registerNetworkBoundary(
  app: FastifyInstance,
  allowedOrigins: readonly string[],
  backendHost: string,
  backendPort: number,
): void {
  const normalizedOrigins = new Set(
    allowedOrigins.map((origin) => new URL(origin).origin),
  )
  const allowedAuthorities = new Set(
    allowedOrigins.map((origin) => new URL(origin).host.toLowerCase()),
  )
  const formattedBackendHost = backendHost.includes(':')
    ? `[${backendHost}]`
    : backendHost
  if (backendPort > 0) {
    allowedAuthorities.add(`${formattedBackendHost}:${backendPort}`.toLowerCase())
  } else {
    // Fastify injection uses a synthetic authority while binding to port zero.
    allowedAuthorities.add('localhost')
    allowedAuthorities.add('localhost:80')
  }

  app.addHook('onRequest', async (request, reply) => {
    const hostHeader = request.headers.host
    const authority = hostHeader ? authorityFromHostHeader(hostHeader) : null
    const originHeader = request.headers.origin
    const isWebSocket =
      request.headers.upgrade?.toLowerCase() === 'websocket'
    const requiresOrigin =
      isWebSocket || (request.method !== 'GET' && request.method !== 'HEAD')

    let allowed = authority !== null && allowedAuthorities.has(authority)

    if (allowed && requiresOrigin && !originHeader) {
      allowed = false
    } else if (allowed && originHeader) {
      try {
        allowed = normalizedOrigins.has(new URL(originHeader).origin)
      } catch {
        allowed = false
      }
    }

    if (allowed) {
      return
    }

    const body = ApiErrorResponseSchema.parse({
      status: 'error',
      error: {
        code: 'VALIDATION_FAILED',
        message: '请求来源不在本地 Demo 允许范围内。',
        requestId: request.id,
      },
    })

    await reply.code(403).send(body)
  })
}
