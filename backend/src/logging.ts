import type {
  FastifyLoggerOptions,
  FastifyRequest,
} from 'fastify'

export function createLoggerOptions(level: string): FastifyLoggerOptions {
  return {
    level,
    serializers: {
      req(request: FastifyRequest) {
        const serialized: {
          method: string
          remoteAddress: string
          host?: string
        } = {
          method: request.method,
          remoteAddress: request.ip,
        }
        if (request.headers.host !== undefined) {
          serialized.host = request.headers.host
        }
        return serialized
      },
      res(response: { statusCode?: number }) {
        return response.statusCode === undefined
          ? {}
          : { statusCode: response.statusCode }
      },
    },
  }
}
