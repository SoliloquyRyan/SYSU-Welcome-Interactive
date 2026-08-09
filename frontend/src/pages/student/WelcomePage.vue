<script setup>
const stages = [
  '身份激活',
  '未来寄语',
  '星星生成',
  '节目应援',
  '互动任务',
  '星际档案',
]
</script>

<template>
  <section class="mobile-stage" aria-labelledby="welcome-title">
    <div class="signal-mark" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>

    <p class="eyebrow">NFC / QR · 同一入口</p>
    <h1 id="welcome-title">星际信标已接收</h1>
    <p class="lead">
      这里将承接邀请函轻触或扫码后的统一欢迎页面。当前仅为开发骨架，不收集任何真实个人信息。
    </p>

    <div class="notice-card">
      <strong>下一步开发</strong>
      <span>接入身份核验、动力值、寄语和个人星星生成流程。</span>
    </div>

    <button class="primary-button" type="button" disabled>
      身份激活 · 待接入
    </button>

    <ol class="stage-list" aria-label="六阶段互动流程">
      <li v-for="(stage, index) in stages" :key="stage">
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        {{ stage }}
      </li>
    </ol>
  </section>
</template>
