import { computed, onBeforeUnmount, ref, watch } from 'vue'

// The server owns eligibility; this clock only displays its shared deadline.
export function useBuzzerCountdown(interaction, generatedAt) {
  const remaining = ref(0)
  let timer = null
  let offset = 0
  watch(generatedAt, value => {
    const serverTime = Date.parse(value)
    if (Number.isFinite(serverTime)) offset = serverTime - Date.now()
  }, { immediate: true })
  watch(() => [interaction.value?.phase, interaction.value?.opensAt], () => {
    clearInterval(timer)
    const tick = () => {
      const deadline = Date.parse(interaction.value?.opensAt)
      remaining.value = interaction.value?.phase === 'BUZZER_OPEN' && Number.isFinite(deadline)
        ? Math.max(0, Math.ceil((deadline - Date.now() - offset) / 1000)) : 0
      if (!remaining.value) clearInterval(timer)
    }
    tick()
    if (remaining.value) timer = setInterval(tick, 80)
  }, { immediate: true })
  onBeforeUnmount(() => clearInterval(timer))
  return computed(() => remaining.value)
}
