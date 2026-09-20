/**
 * Decide how the OBS bridge should start an armed interaction mix.
 * Keeping this decision pure makes the one-shot/reconnect behaviour testable
 * without touching a live OBS instance.
 */
export function autoStartMediaAction(mediaState) {
  // A fresh arm always starts the selected question from the beginning,
  // including when the source was paused or was already playing.
  if (typeof mediaState !== 'string' || !mediaState.startsWith('OBS_MEDIA_STATE_')) throw new Error('OBS_MEDIA_STATE_INVALID')
  return 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
}
