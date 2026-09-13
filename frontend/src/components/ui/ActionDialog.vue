<script setup>
import { nextTick, ref, watch } from 'vue'
const props = defineProps({ request: { type: Object, default: null } })
const emit = defineEmits(['answer'])
const dialog = ref(null)
const value = ref('')
watch(() => props.request, async request => {
  value.value = ''
  await nextTick()
  if (request && !dialog.value?.open) dialog.value?.showModal()
  else if (!request) dialog.value?.close()
})
function confirm() {
  if (props.request?.input && !value.value.trim()) return
  emit('answer', props.request?.input ? value.value.trim() : true)
}
</script>
<template>
  <dialog ref="dialog" class="action-dialog" aria-labelledby="action-dialog-title" aria-describedby="action-dialog-message" @cancel.prevent="emit('answer', false)">
    <form @submit.prevent="confirm">
      <h2 id="action-dialog-title">{{ request?.input ? '填写原因' : '确认操作' }}</h2>
      <p id="action-dialog-message">{{ request?.message }}</p>
      <label v-if="request?.input">原因<textarea v-model="value" maxlength="500" required rows="3"></textarea></label>
      <div><button type="button" autofocus @click="emit('answer', false)">返回</button><button class="is-primary" type="submit" :disabled="request?.input && !value.trim()">确定</button></div>
    </form>
  </dialog>
</template>
<style scoped>
.action-dialog{box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid #92a8bb55;border-radius:20px;background:rgba(11,22,36,.54);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);color:#e3edf5;box-shadow:0 24px 70px #0006,inset 0 1px #e5f1ff0d;font-family:var(--font-family-cjk)}
.action-dialog::backdrop{background:#02081355}
form{display:grid;gap:18px}h2{margin:0;font-size:20px;font-weight:500}p{margin:0;white-space:pre-line;overflow-wrap:anywhere;color:#becbd8;font-size:14px;line-height:1.7}label{display:grid;gap:8px;font-size:13px}textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #7e9cb64d;border-radius:12px;background:#07111e80;color:inherit;font:inherit;resize:vertical}form>div{display:flex;gap:12px}button{flex:1;min-height:46px;border:1px solid #8aa3b633;border-radius:12px;background:#13243580;color:#d4e3ef;font:inherit;cursor:pointer}.is-primary{background:#dbe7ef;color:#0a1726}button:disabled{opacity:.45;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid #b5d2e8;outline-offset:3px}
</style>
