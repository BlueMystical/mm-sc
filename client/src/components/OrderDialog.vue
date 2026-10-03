<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import { api, errorMessage } from '@/api.js'
import { fmtNumber } from '@/format.js'

const props = defineProps({
  line: { type: Object, default: null },        // { line_id, item_name, item_id, price, stock }
  inventoryTitle: { type: String, default: '' }
})
const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['ordered'])

const { t } = useI18n()
const toast = useToast()

const amount = ref(1)
const message = ref('')
const sending = ref(false)

// Cada vez que se abre, formulario limpio
watch(visible, v => {
  if (v) { amount.value = 1; message.value = '' }
})

const itemName = computed(() => props.line?.item_name ?? t('card.unknownItem', { id: props.line?.item_id }))
const total = computed(() => (amount.value || 0) * (props.line?.price ?? 0))
const canSend = computed(() => !!amount.value && amount.value >= 1 && amount.value <= (props.line?.stock ?? 0))

async function submit() {
  if (!canSend.value || sending.value) return
  sending.value = true
  try {
    await api.post('/orders', {
      line_id: props.line.line_id,
      amount: amount.value,
      message: message.value.trim() || null
    })
    toast.add({ severity: 'success', summary: t('order.sent'), detail: t('order.sentDetail'), life: 5000 })
    visible.value = false
    emit('ordered')
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 6000 })
    // La línea ya no está disponible: cerramos y que la vista se refresque
    if (err.code === 'line_not_available') {
      visible.value = false
      emit('ordered')
    }
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('order.title', { item: itemName })" :style="{ width: '28rem', maxWidth: '95vw' }">
    <form v-if="line" class="form" @submit.prevent="submit">
      <p class="from">{{ t('order.from', { inventory: inventoryTitle }) }}</p>

      <div class="field">
        <label for="o-amount">{{ t('order.amount') }}</label>
        <InputNumber v-model="amount" inputId="o-amount" :min="1" :max="line.stock" showButtons fluid />
        <small class="hint">{{ t('order.available', { value: fmtNumber(line.stock) }) }}</small>
      </div>

      <dl class="sum">
        <div><dt>{{ t('order.unitPrice') }}</dt><dd class="num">{{ fmtNumber(line.price) }} aUEC</dd></div>
        <div class="total"><dt>{{ t('order.total') }}</dt><dd class="num">{{ fmtNumber(total) }} aUEC</dd></div>
      </dl>

      <div class="field">
        <label for="o-msg">{{ t('order.message') }}</label>
        <Textarea v-model="message" id="o-msg" rows="3" maxlength="500" autoResize :placeholder="t('order.messagePlaceholder')" fluid />
      </div>

      <div class="buttons">
        <Button type="button" :label="t('order.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="t('order.send')" icon="pi pi-send" :loading="sending" :disabled="!canSend" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.from { margin: 0; color: var(--p-text-muted-color); font-size: 0.9rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.85rem; color: var(--p-text-muted-color); }
.hint { color: var(--p-text-muted-color); }
.sum { margin: 0; padding: 0.75rem 1rem; border: 1px solid var(--p-content-border-color); border-radius: 10px; display: flex; flex-direction: column; gap: 0.4rem; }
.sum div { display: flex; justify-content: space-between; gap: 1rem; }
.sum dt { color: var(--p-text-muted-color); }
.sum dd { margin: 0; }
.total { font-weight: 700; font-size: 1.05rem; padding-top: 0.4rem; border-top: 1px solid var(--p-content-border-color); }
.total dd { color: var(--p-primary-color); font-family: var(--font-display); }
.buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
