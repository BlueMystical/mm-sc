<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { api, errorMessage } from '@/api.js'
import { useCatalogStore } from '@/stores/catalog.js'

const props = defineProps({
  inventoryId: { type: Number, required: true },
  line: { type: Object, default: null }          // null = añadir; objeto = editar
})
const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['saved'])

const { t } = useI18n()
const toast = useToast()
const catalog = useCatalogStore()

const form = ref({ item_id: null, quality: null, stock: null, price: null })
const saving = ref(false)
const isEdit = computed(() => !!props.line)

// Al abrir: carga el catálogo y rellena el formulario
watch(visible, v => {
  if (!v) return
  catalog.load()
  form.value = props.line
    ? { item_id: props.line.item_id, quality: props.line.quality ?? null, stock: props.line.stock, price: props.line.price }
    : { item_id: null, quality: null, stock: null, price: null }
})

const valid = computed(() => !!form.value.item_id && form.value.stock !== null && form.value.price !== null)

async function submit() {
  if (!valid.value || saving.value) return
  const f = form.value
  saving.value = true
  try {
    if (isEdit.value) {
      // Solo se envía lo que cambió (así no se revalida el material si no se tocó)
      const body = {}
      for (const k of ['item_id', 'quality', 'stock', 'price']) {
        const next = k === 'quality' ? (f.quality ?? null) : f[k]
        const prev = k === 'quality' ? (props.line.quality ?? null) : props.line[k]
        if (next !== prev) body[k] = next
      }
      if (Object.keys(body).length === 0) { visible.value = false; return }
      await api.patch(`/inventories/${props.inventoryId}/lines/${props.line.line_id}`, body)
      toast.add({ severity: 'success', summary: t('editor.saved'), life: 2500 })
    } else {
      await api.post(`/inventories/${props.inventoryId}/lines`, {
        item_id: f.item_id, quality: f.quality ?? null, stock: f.stock, price: f.price
      })
      toast.add({ severity: 'success', summary: t('editor.added'), life: 2500 })
    }
    visible.value = false
    emit('saved')
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 6000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible" modal :header="isEdit ? t('lineDialog.editTitle') : t('lineDialog.addTitle')"
    :style="{ width: '28rem', maxWidth: '95vw' }"
  >
    <form class="form" @submit.prevent="submit">
      <div class="field">
        <label for="l-item">{{ t('lineDialog.item') }}</label>
        <Select
          v-model="form.item_id" inputId="l-item" :options="catalog.items" optionLabel="name" optionValue="id"
          filter :loading="catalog.loading" :placeholder="t('lineDialog.itemPlaceholder')" fluid
        />
      </div>
      <div class="field">
        <label for="l-quality">{{ t('lineDialog.quality') }}</label>
        <InputNumber v-model="form.quality" inputId="l-quality" :min="0" :max="1000" :maxFractionDigits="0" :useGrouping="false" fluid />
        <small class="hint">{{ t('lineDialog.qualityHint') }}</small>
      </div>
      <div class="two">
        <div class="field">
          <label for="l-stock">{{ t('lineDialog.stock') }}</label>
          <InputNumber v-model="form.stock" inputId="l-stock" :min="0" :maxFractionDigits="0" fluid />
        </div>
        <div class="field">
          <label for="l-price">{{ t('lineDialog.price') }}</label>
          <InputNumber v-model="form.price" inputId="l-price" :min="0" :maxFractionDigits="0" fluid />
        </div>
      </div>
      <div class="buttons">
        <Button type="button" :label="t('lineDialog.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="t('lineDialog.save')" icon="pi pi-check" :loading="saving" :disabled="!valid" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.85rem; color: var(--p-text-muted-color); }
.hint { color: var(--p-text-muted-color); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
