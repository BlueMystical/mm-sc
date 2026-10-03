<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import { api, errorMessage } from '@/api.js'

const props = defineProps({
  orderId: { type: Number, default: null },
  name: { type: String, default: '' }          // a quién se califica
})
const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['rated'])

const { t } = useI18n()
const toast = useToast()

const rating = ref('positive')
const comment = ref('')
const saving = ref(false)

const OPTIONS = [
  { value: 'positive', icon: 'pi pi-thumbs-up' },
  { value: 'neutral', icon: 'pi pi-minus-circle' },
  { value: 'negative', icon: 'pi pi-thumbs-down' }
]

watch(visible, v => {
  if (v) { rating.value = 'positive'; comment.value = '' }
})

async function submit() {
  if (saving.value || !rating.value) return
  saving.value = true
  try {
    await api.post(`/orders/${props.orderId}/review`, {
      rating: rating.value,
      comment: comment.value.trim() || null
    })
    toast.add({ severity: 'success', summary: t('review.thanks'), life: 3000 })
    visible.value = false
    emit('rated')
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 6000 })
    // Ya la habías calificado: la lista se refresca para ocultar el botón
    if (err.code === 'already_reviewed') { visible.value = false; emit('rated') }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('review.title', { name })" :style="{ width: '26rem', maxWidth: '95vw' }">
    <form class="form" @submit.prevent="submit">
      <div class="field">
        <span class="lbl" id="r-rating">{{ t('review.rating') }}</span>
        <SelectButton v-model="rating" :options="OPTIONS" optionValue="value" :allowEmpty="false" aria-labelledby="r-rating" fluid>
          <template #option="{ option }">
            <i :class="option.icon" /> <span>{{ t(`profile.${option.value}`) }}</span>
          </template>
        </SelectButton>
      </div>

      <div class="field">
        <label for="r-comment" class="lbl">{{ t('review.comment') }}</label>
        <Textarea v-model="comment" id="r-comment" rows="3" maxlength="500" autoResize :placeholder="t('review.placeholder')" fluid />
        <small class="hint">{{ t('review.hint') }}</small>
      </div>

      <div class="buttons">
        <Button type="button" :label="t('lineDialog.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="t('review.send')" icon="pi pi-check" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.lbl { font-size: 0.85rem; color: var(--p-text-muted-color); }
.hint { color: var(--p-text-muted-color); }
.buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
