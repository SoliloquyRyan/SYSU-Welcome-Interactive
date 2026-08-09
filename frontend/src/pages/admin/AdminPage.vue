<script setup>
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'

const checklist = [
  '登录与名单核验',
  '寄语人工终审',
  '弹幕人工终审',
  '节目阶段切换',
  '降级模式切换',
]
</script>

<template>
  <section class="admin-stage" aria-labelledby="admin-title">
    <p class="eyebrow">内部页面 · 不对观众公开</p>
    <h1 id="admin-title">内容审核与现场控制</h1>
    <p class="lead">
      当前页面仅用于明确开发边界。正式版本必须接入权限验证、操作日志和最小化数据访问控制。
    </p>

    <BaseCard as="ul" class="admin-list" padding="none">
      <li v-for="item in checklist" :key="item">
        <span aria-hidden="true">○</span>
        <span class="admin-list__label">{{ item }}</span>
        <StatusPill size="sm">待开发</StatusPill>
      </li>
    </BaseCard>
  </section>
</template>
