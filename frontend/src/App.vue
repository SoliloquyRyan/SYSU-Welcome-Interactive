<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AmbientField from './components/visual/AmbientField.vue'

const route = useRoute()
const isDevelopment = computed(() => import.meta.env.DEV)
</script>

<template>
  <div class="app-shell" :class="`route-${route.name ?? 'unknown'}`">
    <AmbientField :variant="route.name ?? 'unknown'" />

    <header class="site-header">
      <div>
        <p class="site-kicker">SYSU · 智能工程学院迎新晚会</p>
        <p class="site-title">创新互动系统</p>
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

    <footer class="site-footer">
      <span>开发初始骨架</span>
      <span>正式内容、域名与数据规则待团队确认</span>
    </footer>
  </div>
</template>
