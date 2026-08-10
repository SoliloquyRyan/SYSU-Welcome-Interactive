import type { ApiErrorCode } from '@sysu-welcome/contracts'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly statusCode: number
  readonly resetEpoch: number | undefined
  readonly stageRevision: number | undefined

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    version?: { resetEpoch?: number; stageRevision?: number },
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.resetEpoch = version?.resetEpoch
    this.stageRevision = version?.stageRevision
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
