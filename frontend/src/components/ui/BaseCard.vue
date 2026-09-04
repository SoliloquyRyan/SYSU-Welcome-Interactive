<script setup>
defineProps({
  as: {
    type: String,
    default: 'div',
    validator: (value) => ['article', 'aside', 'div', 'section', 'ul'].includes(value),
  },
  variant: {
    type: String,
    default: 'glass',
    validator: (value) => ['glass', 'solid', 'outline'].includes(value),
  },
  padding: {
    type: String,
    default: 'md',
    validator: (value) => ['none', 'sm', 'md', 'lg'].includes(value),
  },
})
</script>

<template>
  <component
    :is="as"
    class="base-card"
    :class="[`base-card--${variant}`, `base-card--padding-${padding}`]"
  >
    <slot />
  </component>
</template>

<style scoped>
.base-card {
  border: 1px solid var(--card-border-color, var(--color-border-subtle));
  border-top: var(--card-border-top, 3px solid var(--color-border-strong));
  border-radius: var(--card-radius, var(--radius-lg));
  color: var(--card-color, var(--color-text-primary));
}

.base-card--glass {
  background: var(--card-background, var(--color-surface-panel));
  box-shadow: var(--card-shadow, var(--shadow-card));
}

.base-card--solid {
  color: var(--card-solid-color, var(--color-on-dark));
  background: var(--card-solid-background, var(--color-surface-raised));
}

.base-card--outline {
  --card-border-top: 1px solid var(--card-border-color, var(--color-border-subtle));
  background: transparent;
}

.base-card--padding-none {
  padding: 0;
}

.base-card--padding-sm {
  padding: var(--space-4);
}

.base-card--padding-md {
  padding: var(--space-5);
}

.base-card--padding-lg {
  padding: var(--space-8);
}

@media (forced-colors: active) {
  .base-card {
    border-color: CanvasText;
  }
}
</style>
