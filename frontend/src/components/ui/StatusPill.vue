<script setup>
defineProps({
  tone: {
    type: String,
    default: 'neutral',
    validator: (value) =>
      ['neutral', 'info', 'success', 'warning', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md'].includes(value),
  },
})
</script>

<template>
  <span class="status-pill" :class="[`status-pill--${tone}`, `status-pill--${size}`]">
    <span class="status-pill__dot" aria-hidden="true"></span>
    <span><slot /></span>
  </span>
</template>

<style scoped>
.status-pill {
  --pill-color: var(--color-neutral);
  --pill-border: var(--color-border-strong);
  --pill-surface: transparent;
  min-height: 1.85rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--pill-border);
  border-radius: var(--radius-pill);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--pill-color);
  background: var(--pill-surface);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
  white-space: nowrap;
}

.status-pill__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 1px;
  background: currentColor;
}

.status-pill--info {
  --pill-color: var(--color-info);
  --pill-border: var(--color-info);
  --pill-surface: transparent;
}

.status-pill--success {
  --pill-color: var(--color-success);
  --pill-border: var(--color-success);
  --pill-surface: transparent;
}

.status-pill--warning {
  --pill-color: var(--color-warning);
  --pill-border: var(--color-warning);
  --pill-surface: transparent;
}

.status-pill--danger {
  --pill-color: var(--color-danger);
  --pill-border: var(--color-danger);
  --pill-surface: transparent;
}

.status-pill--sm {
  min-height: 1.65rem;
  padding-inline: 0.6rem;
  font-size: 0.7rem;
}

@media (forced-colors: active) {
  .status-pill {
    border-color: CanvasText;
  }
}
</style>
