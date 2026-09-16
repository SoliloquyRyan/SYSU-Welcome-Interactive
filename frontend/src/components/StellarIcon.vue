<script setup>
defineProps({ name: { type: String, default: 'scene' } })
const paths = {
  scene: 'M12 2.5 14.4 9.6 21.5 12 14.4 14.4 12 21.5 9.6 14.4 2.5 12 9.6 9.6Z',
  programs: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h3',
  archive: 'M4 6h16v14H4z M8 6V3h8v3 M8 11h8 M8 15h5',
  send: 'M3 11 21 3 13 21 10 14 3 11Z M10 14 16 8',
}
</script>
<template><svg class="stellar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path :d="paths[name] || paths.scene" /></svg></template>
<style scoped>.stellar-icon{display:inline-block;width:20px;height:20px;flex:none;vertical-align:middle}</style>
