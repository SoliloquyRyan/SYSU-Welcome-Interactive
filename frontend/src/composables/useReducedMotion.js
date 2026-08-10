import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useReducedMotion() {
  const reducedMotion = ref(false)
  let mediaQuery = null

  const update = (event) => {
    reducedMotion.value = event.matches
  }

  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = mediaQuery.matches
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', update)
    else mediaQuery.addListener?.(update)
  })

  onBeforeUnmount(() => {
    if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', update)
    else mediaQuery?.removeListener?.(update)
  })
  return reducedMotion
}
