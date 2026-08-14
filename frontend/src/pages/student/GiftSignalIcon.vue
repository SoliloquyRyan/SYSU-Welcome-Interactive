<script setup>
defineProps({
  giftId: { type: String, required: true },
})
</script>

<template>
  <svg class="gift-signal-icon" viewBox="0 0 32 32" aria-hidden="true">
    <g v-if="giftId === 'gift-glimmer'">
      <path d="M16 5.5v5M16 21.5v5M5.5 16h5M21.5 16h5" />
      <path d="m16 10.5 2.1 3.4 3.4 2.1-3.4 2.1-2.1 3.4-2.1-3.4-3.4-2.1 3.4-2.1Z" />
      <circle cx="16" cy="16" r="1.7" />
    </g>
    <g v-else-if="giftId === 'gift-beacon'">
      <path d="M16 7v15M12 25h8M13.5 22h5" />
      <circle cx="16" cy="12" r="2.1" />
      <path d="M11.7 8.7a6.1 6.1 0 0 0 0 6.6M20.3 8.7a6.1 6.1 0 0 1 0 6.6" />
      <path d="M8.7 6.2a9.7 9.7 0 0 0 0 11.6M23.3 6.2a9.7 9.7 0 0 1 0 11.6" />
    </g>
    <g v-else-if="giftId === 'gift-orbit'">
      <ellipse cx="16" cy="16" rx="11" ry="5.6" transform="rotate(-24 16 16)" />
      <ellipse cx="16" cy="16" rx="5.6" ry="11" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="2" />
      <circle cx="23.8" cy="10.3" r="1.6" />
    </g>
    <g v-else>
      <path d="m16 5.2 5.6 12.2-5.6 4.2-5.6-4.2Z" />
      <path d="m10.4 17.4-3.2 3.1 5.6.1M21.6 17.4l3.2 3.1-5.6.1M13.6 23.1 12 27M18.4 23.1l2 3.9M16 23.3V28" />
      <path d="M16 9.2v8.2" />
    </g>
  </svg>
</template>

<style scoped>
.gift-signal-icon {
  width: 32px;
  height: 32px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
