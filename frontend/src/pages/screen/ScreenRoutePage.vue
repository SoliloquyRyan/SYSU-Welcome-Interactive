<script setup>
import { onMounted, ref } from 'vue'
import ScreenPage from './ScreenPage.vue'
import V2ScreenExperience from './V2ScreenExperience.vue'
import { protocolCapabilityApi, publicErrorMessage } from '../../services/api'
import { isV2RuntimeActive } from '../../services/protocol-compatibility'

const surface = ref('checking')
const errorMessage = ref('')

onMounted(async () => {
  try {
    const capability = await protocolCapabilityApi.discover()
    surface.value = isV2RuntimeActive(capability) ? 'v2' : 'v1'
  } catch (error) {
    errorMessage.value = publicErrorMessage(error)
    surface.value = 'error'
  }
})
</script>

<template>
  <V2ScreenExperience v-if="surface === 'v2'" />
  <ScreenPage v-else-if="surface === 'v1'" />
  <section v-else class="screen-route-state" role="status">
    <p>{{ surface === 'error' ? errorMessage : '正在确认大屏协议…' }}</p>
  </section>
</template>

<style scoped>
.screen-route-state{display:grid;place-items:center;min-height:100vh;color:#f2f6ff;background:#030713}
</style>
