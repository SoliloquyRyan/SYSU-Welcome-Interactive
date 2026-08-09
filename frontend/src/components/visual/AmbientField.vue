<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'welcome',
    validator: (value) => ['welcome', 'screen', 'admin', 'unknown'].includes(value),
  },
})

const label = computed(
  () =>
    ({
      welcome: 'WELCOME / 01',
      screen: 'SCREEN / 02',
      admin: 'ADMIN / 03',
      unknown: 'INDEX / 00',
    })[props.variant],
)
</script>

<template>
  <div
    class="ambient-field"
    :class="`ambient-field--${variant}`"
    aria-hidden="true"
    data-ambient-motion
  >
    <span class="ambient-field__rule ambient-field__rule--top"></span>
    <span class="ambient-field__rule ambient-field__rule--bottom"></span>
    <span class="ambient-field__index">
      <span class="ambient-field__bar"></span>
      <span class="ambient-field__line"></span>
      <span class="ambient-field__node"></span>
      <b>{{ label }}</b>
    </span>
  </div>
</template>

<style scoped>
.ambient-field {
  position: fixed;
  z-index: var(--z-ambient);
  inset: 0;
  overflow: hidden;
  color: var(--color-ink-950);
  background: var(--color-paper-200);
  pointer-events: none;
}

.ambient-field__rule,
.ambient-field__index,
.ambient-field__bar,
.ambient-field__line,
.ambient-field__node {
  position: absolute;
  display: block;
}

.ambient-field__rule {
  height: 1px;
  background: currentColor;
  opacity: 0.09;
}

.ambient-field__rule--top {
  width: 38vw;
  top: 26px;
  right: 4vw;
}

.ambient-field__rule--bottom {
  width: 28vw;
  right: 12vw;
  bottom: 30px;
}

.ambient-field__index {
  width: 248px;
  height: 96px;
  top: 28%;
  left: max(22px, calc(50% - 43rem));
  opacity: 0.16;
}

.ambient-field__bar {
  width: 8px;
  height: 96px;
  top: 0;
  left: 0;
  background: var(--color-brand-primary);
}

.ambient-field__line {
  width: 240px;
  height: 1px;
  top: 44px;
  left: 8px;
  background: currentColor;
  transform-origin: left center;
  animation: signal-register var(--motion-duration-ambient)
    var(--motion-ease-emphasized) both;
}

.ambient-field__node {
  width: 9px;
  height: 9px;
  top: 40px;
  left: 86px;
  background: var(--color-signal-orange);
  animation: signal-node-settle var(--motion-duration-slow)
    var(--motion-ease-emphasized) 160ms both;
}

.ambient-field__index b {
  position: absolute;
  top: 55px;
  left: 86px;
  font-family: var(--font-family-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.ambient-field--screen {
  color: var(--color-on-dark);
  background: var(--color-ink-950);
}

.ambient-field--screen .ambient-field__bar {
  background: var(--color-on-dark);
}

.ambient-field--screen .ambient-field__node {
  background: var(--color-signal-orange);
}

.ambient-field--admin .ambient-field__index {
  top: 64%;
  opacity: 0.1;
}

@media (max-width: 720px) {
  .ambient-field__rule--top {
    width: 52vw;
  }

  .ambient-field__rule--bottom {
    width: 42vw;
    right: 6vw;
  }

  .ambient-field__index {
    top: auto;
    bottom: 7.5rem;
    left: -3rem;
    transform: scale(0.72);
  }

  .ambient-field--admin .ambient-field__index {
    top: auto;
  }
}
</style>
