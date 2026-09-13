import { describe, expect, it } from 'vitest'
import { applicationPath } from '../../frontend/src/services/application-path.js'

describe('deployment subpath isolation', () => {
  it('preserves root deployments and prefixes API, realtime and page URLs', () => {
    for (const path of ['/api/v2/admin/login', '/ws/v2', '/welcome']) {
      expect(applicationPath(path, '/')).toBe(path)
      expect(applicationPath(path, '/welcomeparty/')).toBe(`/welcomeparty${path}`)
      expect(applicationPath(path, '/welcomeparty')).toBe(`/welcomeparty${path}`)
    }
  })
})
