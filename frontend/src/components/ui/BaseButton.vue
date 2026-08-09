<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'button',
    validator: (value) => ['button', 'submit', 'reset'].includes(value),
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'ghost', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  block: Boolean,
  disabled: Boolean,
  loading: Boolean,
})

const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <button
    class="base-button"
    :class="[
      `base-button--${variant}`,
      `base-button--${size}`,
      { 'base-button--block': block },
    ]"
    :type="type"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="base-button__spinner" aria-hidden="true"></span>
    <span class="base-button__label"><slot /></span>
  </button>
</template>

<style scoped>
.base-button {
  min-width: 2.75rem;
  min-height: var(--control-height-md);
  padding: 0 var(--space-5);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    transform var(--motion-duration-fast) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}

.base-button:hover:not(:disabled) {
  transform: translate(-1px, -1px);
}

.base-button:active:not(:disabled) {
  transform: translate(1px, 1px);
}

.base-button:focus-visible {
  outline: 3px solid var(--color-brand-primary);
  outline-offset: 3px;
  box-shadow: var(--shadow-focus);
}

.base-button:disabled {
  cursor: not-allowed;
  color: var(--color-text-secondary);
  background: var(--color-paper-300);
  box-shadow: none;
  opacity: 1;
}

.base-button--primary {
  color: var(--color-on-dark);
  background: var(--color-ink-950);
  box-shadow: inset 5px 0 0 var(--color-signal-orange);
}

.base-button--secondary {
  color: var(--color-text-primary);
  background: var(--color-paper-100);
}

.base-button--ghost {
  color: var(--color-text-primary);
  background: transparent;
}

.base-button--danger {
  border-color: var(--color-danger);
  color: var(--color-on-dark);
  background: var(--color-danger);
}

.base-button--sm {
  min-height: var(--control-height-sm);
  padding-inline: var(--space-4);
  font-size: var(--font-size-xs);
}

.base-button--lg {
  min-height: var(--control-height-lg);
  padding-inline: var(--space-6);
  font-size: var(--font-size-md);
}

.base-button--block {
  width: 100%;
}

.base-button__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 0;
  animation: motion-spin 800ms linear infinite;
}

.base-button__label {
  min-width: 0;
}

@media (forced-colors: active) {
  .base-button {
    border-color: ButtonText;
  }
}
</style>
