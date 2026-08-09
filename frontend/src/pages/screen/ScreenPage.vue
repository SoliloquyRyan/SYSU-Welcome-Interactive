<script setup>
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
</script>

<template>
  <section class="screen-stage" aria-labelledby="screen-title">
    <div class="screen-heading">
      <div>
        <p class="eyebrow">现场大屏 · 开发占位</p>
        <h1 id="screen-title">智工星域正在汇聚</h1>
      </div>
      <StatusPill tone="info">演示数据</StatusPill>
    </div>

    <div class="screen-grid">
      <BaseCard as="article" class="metric-card" padding="lg">
        <span>已激活星星</span>
        <strong>—</strong>
        <small>待接入实时数据</small>
      </BaseCard>
      <BaseCard as="article" class="metric-card" padding="lg">
        <span>全场星光值</span>
        <strong>—</strong>
        <small>仅展示聚合结果</small>
      </BaseCard>
      <BaseCard as="article" class="metric-card wide" padding="lg">
        <span>当前阶段</span>
        <strong>系统联调准备</strong>
        <small>正式环境由后台统一触发</small>
      </BaseCard>
    </div>
  </section>
</template>
