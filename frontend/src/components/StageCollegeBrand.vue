<script setup>
import collegeWordmarkUrl from '../assets/brand/sysu-intelligent-engineering-white.png'
</script>

<template>
  <header class="stage-college-brand" data-testid="stage-college-brand">
    <img :src="collegeWordmarkUrl" alt="中山大学智能工程学院" width="961" height="156" draggable="false" />
  </header>
</template>

<style scoped>
.stage-college-brand{position:absolute;z-index:2;top:5.8vh;left:5vw;width:clamp(210px,22vw,450px);pointer-events:none}
.stage-college-brand img{display:block;width:100%;height:auto;opacity:.89;object-fit:contain;filter:drop-shadow(0 2px 12px #03060c80)}
</style>
