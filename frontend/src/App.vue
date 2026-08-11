<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AmbientField from './components/visual/AmbientField.vue'

const route = useRoute()
const isDevelopment = computed(() => import.meta.env.DEV)
const isScreen = computed(() => route.name === 'screen')
const isWelcome = computed(() => route.name === 'welcome')
</script>

<template>
  <div class="app-shell" :class="`route-${route.name ?? 'unknown'}`">
    <AmbientField :variant="route.name ?? 'unknown'" />

    <header v-if="!isScreen && !isWelcome" class="site-header">
      <div>
        <p class="site-kicker">SYSU · 智能工程学院迎新晚会</p>
        <p class="site-title">互动系统 · Demo v0</p>
      </div>

      <nav v-if="isDevelopment" class="dev-nav" aria-label="开发入口">
        <RouterLink to="/welcome">手机端</RouterLink>
        <RouterLink to="/screen">大屏端</RouterLink>
        <RouterLink to="/admin">审核端</RouterLink>
      </nav>
    </header>

    <main class="page-content">
      <RouterView />
    </main>

    <footer v-if="!isScreen && !isWelcome" class="site-footer">
      <span>仅使用固定合成数据</span>
      <span>本地局域网 Demo · 非正式公网系统</span>
    </footer>
  </div>
</template>
