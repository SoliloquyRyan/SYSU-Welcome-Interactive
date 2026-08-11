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
    <template v-if="variant === 'welcome'">
      <span class="ambient-field__stellar ambient-field__stellar--far"></span>
      <span class="ambient-field__stellar ambient-field__stellar--near"></span>
      <span class="ambient-field__nebula"></span>
    </template>
    <template v-else>
      <span class="ambient-field__rule ambient-field__rule--top"></span>
      <span class="ambient-field__rule ambient-field__rule--bottom"></span>
      <span class="ambient-field__index">
        <span class="ambient-field__bar"></span>
        <span class="ambient-field__line"></span>
        <span class="ambient-field__node"></span>
        <b>{{ label }}</b>
      </span>
    </template>
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

.ambient-field--welcome {
  color: #dfe9f8;
  background:
    radial-gradient(ellipse at 50% 42%, rgba(67, 91, 132, 0.18), transparent 42%),
    radial-gradient(ellipse at 76% 12%, rgba(51, 72, 111, 0.12), transparent 30%),
    linear-gradient(180deg, #02050c 0%, #050b16 52%, #02050b 100%);
}

.ambient-field__stellar,
.ambient-field__nebula {
  position: absolute;
  inset: -8%;
  display: block;
}

.ambient-field__stellar {
  background-repeat: repeat;
  transform: translate3d(0, 0, 0);
}

.ambient-field__stellar--far {
  opacity: 0.48;
  background-image:
    radial-gradient(circle at 14px 18px, rgba(238, 245, 255, 0.72) 0 0.65px, transparent 0.9px),
    radial-gradient(circle at 73px 91px, rgba(172, 197, 236, 0.48) 0 0.55px, transparent 0.85px),
    radial-gradient(circle at 121px 42px, rgba(238, 245, 255, 0.5) 0 0.5px, transparent 0.8px);
  background-size: 137px 151px, 181px 197px, 223px 211px;
}

.ambient-field__stellar--near {
  opacity: 0.7;
  background-image:
    radial-gradient(circle at 31px 64px, rgba(255, 255, 255, 0.9) 0 0.85px, transparent 1.2px),
    radial-gradient(circle at 152px 28px, rgba(185, 209, 244, 0.72) 0 0.75px, transparent 1.1px),
    radial-gradient(circle at 88px 133px, rgba(255, 226, 171, 0.7) 0 0.7px, transparent 1.05px);
  background-size: 197px 181px, 251px 233px, 293px 277px;
  animation: stellar-drift 18s ease-in-out infinite alternate;
}

.ambient-field__nebula {
  inset: 8% -15% auto;
  height: 56%;
  opacity: 0.22;
  background: radial-gradient(ellipse, rgba(93, 121, 167, 0.3), transparent 64%);
  filter: blur(44px);
}

@keyframes stellar-drift {
  from { transform: translate3d(-4px, -3px, 0); }
  to { transform: translate3d(5px, 4px, 0); }
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

@media (prefers-reduced-motion: reduce) {
  .ambient-field__stellar--near {
    animation: none;
  }
}
</style>
