<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const viewport = ref(null)
const scale = ref(.25)
const previewUrl = computed(() => router.resolve({ path: '/screen', query: { motion: 'reduced', audio: 'off' } }).href)
const stageUrl = computed(() => router.resolve({ path: '/screen' }).href)
let observer
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { scale.value = entry.contentRect.width / 1920 })
  observer.observe(viewport.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <section class="public-stage-preview" aria-label="公共大屏预览">
    <header><h2><span aria-hidden="true">✦</span> 公共画面</h2><a :href="stageUrl" target="_blank" rel="noopener">打开大屏 ↗</a></header>
    <div ref="viewport" class="preview-viewport"><iframe :src="previewUrl" title="公共大屏静态预览" tabindex="-1" :style="{ transform: 'scale(' + scale + ')' }"></iframe></div>
    <footer><span>实时状态 · 静态预览</span><span>节目视频在 OBS 中查看</span></footer>
  </section>
</template>
<style scoped>
.public-stage-preview{min-width:0;border:1px solid var(--color-border-subtle);background:#181c25;border-radius:6px;overflow:hidden}
header,footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px}
h2{font-size:.88rem;margin:0;font-weight:600}h2 span{color:#aab8e0;margin-right:6px}
a{color:#b6c8f1;font-size:.8rem;min-height:32px;display:inline-flex;align-items:center;text-decoration:none}
a:focus-visible{outline:2px solid #b6c8f1;outline-offset:3px}
.preview-viewport{position:relative;width:min(100%,64dvh);margin-inline:auto;aspect-ratio:16/9;background:#141721;overflow:hidden}
iframe{display:block;border:0;width:1920px;height:1080px;transform-origin:top left;pointer-events:none}
footer{font-size:.7rem;color:#a5afc2;flex-wrap:wrap;border-top:1px solid #ffffff0b}
</style>
