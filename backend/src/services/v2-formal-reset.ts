import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { V2AdminCommandSchema } from '@sysu-welcome/contracts'
import type { SqliteDatabase } from '../db/open-database.js'
import { clearV2MutableState, createVerifiedBackup, initializeV2Runtime, verifyV2Foundation } from '../db/v2-foundation.js'
import { V2RuntimeCommandError } from './v2-runtime-commands.js'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const locks = new WeakSet<SqliteDatabase>()

/** HTTP admission is gated by the caller while the asynchronous archive is made. */
export async function archiveAndResetRound(database: SqliteDatabase, input: unknown, options: {
  roles: string[]; actorId: string; migrationsPath: string; manifestPath: string; participantCount: number
  archiveDirectory?: string; now?: Date; beforeCommit?: (epoch: number) => void
}) {
  const request = V2AdminCommandSchema.parse(input)
  if (request.command !== 'RESET_FORMAL_ROUND') throw new Error('Expected formal reset command')
  if (!options.roles.includes('ALL')) throw new V2RuntimeCommandError('ROLE_REQUIRED', '需要主控管理权限。', 403)
  if (locks.has(database)) throw new V2RuntimeCommandError('REVISION_CONFLICT', '本轮正在归档，请稍后查看结果。', 409)
  const keyDigest = digest(request.idempotencyKey)
  const previous = database.prepare(`SELECT target_epoch AS resetEpoch, archive_sha256 AS sha256, created_at AS at,
    actor_id AS actorId, idempotency_key_digest AS keyDigest FROM v2_round_archives WHERE source_epoch = ?`).get(request.resetEpoch) as
    {resetEpoch: number; sha256: string; at: string; actorId: string; keyDigest: string}|undefined
  if (previous) {
    if (previous.actorId !== options.actorId || previous.keyDigest !== keyDigest) throw new V2RuntimeCommandError('STALE_RESET_EPOCH', '该轮次已归档，请刷新当前状态。', 409)
    return {resetEpoch: previous.resetEpoch, sha256: previous.sha256, at: previous.at, replayed: true}
  }
  const state = () => database.prepare('SELECT reset_epoch AS epoch, run_revision AS revision, status, mode FROM v2_runtime_state WHERE id=1').get() as
    {epoch: number; revision: number; status: string; mode: string}
  const current = state()
  if (current.epoch !== request.resetEpoch) throw new V2RuntimeCommandError('STALE_RESET_EPOCH', '轮次已变化，请刷新。', 409)
  if (current.revision !== request.expectedRunRevision) throw new V2RuntimeCommandError('REVISION_CONFLICT', '状态已变化，请核对后重试。', 409)
  if (!['READY', 'PAUSED', 'COMPLETED'].includes(current.status)) throw new V2RuntimeCommandError('SCENE_ACTION_INVALID', '请先暂停当前活动。', 409)
  const before = verifyV2Foundation(database, {migrationsPath: options.migrationsPath, manifestPath: options.manifestPath, participantCount: options.participantCount})
  if (!before.ready) throw new Error(`归档前校验失败：${before.issues.join('; ')}`)
  locks.add(database)
  try {
    const directory = options.archiveDirectory ?? path.join(path.dirname(database.name), 'round-archives')
    fs.mkdirSync(directory, {recursive: true, mode: 0o700})
    const now = options.now ?? new Date(), timestamp = now.toISOString()
    const filename = `round-${current.epoch}-${now.getTime()}-${randomUUID()}.sqlite`
    const changes = database.prepare('SELECT total_changes()').pluck().get()
    const archive = await createVerifiedBackup(database, path.join(directory, filename), '2')
    database.exec('BEGIN IMMEDIATE')
    try {
      if (database.prepare('SELECT total_changes()').pluck().get() !== changes || Number(database.pragma('data_version', {simple: true})) !== archive.dataVersion || JSON.stringify(state()) !== JSON.stringify(current)) {
        throw new Error('归档期间状态变化，原轮次已保留，请重试。')
      }
      const nextEpoch = current.epoch + 1
      database.exec('DELETE FROM v2_interaction_unlocks; DELETE FROM v2_program_heat_adjustments;')
      clearV2MutableState(database)
      database.exec(`DELETE FROM v2_guest_credentials;
        DELETE FROM v2_identity_slots WHERE identity_id IN (SELECT id FROM synthetic_identities WHERE account_kind='GUEST');
        DELETE FROM synthetic_identities WHERE account_kind='GUEST';
        DELETE FROM v2_runtime_state;
        UPDATE v2_identity_slots SET reserved_reset_epoch=NULL, reserved_at=NULL;
        UPDATE v2_awards SET confirmed=0, revision=revision+1 WHERE group_code='PROGRAM';
        UPDATE v2_awards SET entries_json='[]' WHERE group_code='PROGRAM';`)
      initializeV2Runtime(database, nextEpoch, timestamp)
      database.prepare('UPDATE v2_runtime_state SET mode=? WHERE id=1').run(current.mode)
      database.prepare('UPDATE app_state SET reset_epoch=?, event_seq=0, is_resetting=0, updated_at=? WHERE id=1').run(nextEpoch, timestamp)
      database.prepare('UPDATE protocol_runtime SET updated_at=? WHERE id=1').run(timestamp)
      database.prepare(`INSERT INTO v2_round_archives (source_epoch,target_epoch,idempotency_key_digest,actor_id,archive_filename,archive_sha256,created_at)
        VALUES (?,?,?,?,?,?,?)`).run(current.epoch,nextEpoch,keyDigest,options.actorId,filename,archive.sha256,timestamp)
      options.beforeCommit?.(nextEpoch)
      const after = verifyV2Foundation(database, {migrationsPath: options.migrationsPath, manifestPath: options.manifestPath, participantCount: options.participantCount})
      if (!after.ready) throw new Error(`新轮次校验失败：${after.issues.join('; ')}`)
      database.exec('COMMIT')
      return {resetEpoch: nextEpoch, sha256: archive.sha256, at: timestamp, replayed: false}
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }
  } finally { locks.delete(database) }
}
