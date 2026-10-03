<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { api, errorMessage } from '@/api.js'

const props = defineProps({
  inventory: { type: Object, default: null }      // null = crear; objeto = editar detalles
})
const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['saved'])               // saved(inventory, wasCreated)

const { t } = useI18n()
const toast = useToast()

const form = ref({ title: '', description: '', location: '', image_url: '', visibility: 'private' })
const saving = ref(false)
const previewFailed = ref(false)
const isEdit = computed(() => !!props.inventory)

const visibilityOptions = computed(() =>
  ['private', 'unlisted', 'public'].map(v => ({ value: v, label: t(`invDialog.visibilityOptions.${v}`) }))
)

watch(visible, v => {
  if (!v) return
  const i = props.inventory
  form.value = i
    ? { title: i.title, description: i.description ?? '', location: i.location ?? '', image_url: i.image_url ?? '', visibility: i.visibility }
    : { title: '', description: '', location: '', image_url: '', visibility: 'private' }
})

const imageUrl = computed(() => form.value.image_url.trim())
watch(imageUrl, () => { previewFailed.value = false })

function isHttps(u) {
  try { return new URL(u).protocol === 'https:' } catch { return false }
}
const imageInvalid = computed(() => imageUrl.value !== '' && !isHttps(imageUrl.value))
const valid = computed(() => form.value.title.trim() !== '' && !imageInvalid.value)

// Vacío -> null (el backend no acepta '' como URL y guarda null para "sin valor")
const orNull = s => (s.trim() === '' ? null : s.trim())

async function submit() {
  if (!valid.value || saving.value) return
  const f = form.value
  const next = {
    title: f.title.trim(),
    description: orNull(f.description),
    location: orNull(f.location),
    image_url: orNull(f.image_url),
    visibility: f.visibility
  }
  saving.value = true
  try {
    if (isEdit.value) {
      const body = {}
      for (const k of Object.keys(next)) {
        if (next[k] !== (props.inventory[k] ?? null)) body[k] = next[k]   // solo lo que cambió
      }
      if (Object.keys(body).length === 0) { visible.value = false; return }
      const updated = await api.patch(`/inventories/${props.inventory.inventory_id}`, body)
      toast.add({ severity: 'success', summary: t('editor.saved'), life: 2500 })
      visible.value = false
      emit('saved', updated, false)
    } else {
      const created = await api.post('/inventories', next)
      toast.add({ severity: 'success', summary: t('myInv.created'), life: 2500 })
      visible.value = false
      emit('saved', created, true)
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 6000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible" modal :header="isEdit ? t('invDialog.editTitle') : t('invDialog.createTitle')"
    :style="{ width: '32rem', maxWidth: '95vw' }"
  >
    <form class="form" @submit.prevent="submit">
      <div class="field">
        <label for="i-title">{{ t('invDialog.title') }}</label>
        <InputText v-model="form.title" id="i-title" maxlength="100" autofocus fluid />
      </div>

      <div class="field">
        <label for="i-desc">{{ t('invDialog.description') }}</label>
        <Textarea v-model="form.description" id="i-desc" rows="3" maxlength="1000" autoResize :placeholder="t('invDialog.descriptionPlaceholder')" fluid />
      </div>

      <div class="field">
        <label for="i-loc">{{ t('invDialog.location') }}</label>
        <InputText v-model="form.location" id="i-loc" maxlength="100" :placeholder="t('invDialog.locationPlaceholder')" fluid />
      </div>

      <div class="field">
        <label for="i-img">{{ t('invDialog.image') }}</label>
        <InputText v-model="form.image_url" id="i-img" maxlength="500" placeholder="https://" :invalid="imageInvalid" fluid />
        <small v-if="imageInvalid" class="err">{{ t('invDialog.imageInvalid') }}</small>
        <small v-else class="hint">{{ t('invDialog.imageHint') }}</small>
        <div v-if="imageUrl && !imageInvalid" class="preview">
          <img v-if="!previewFailed" :src="imageUrl" alt="" referrerpolicy="no-referrer" @error="previewFailed = true" />
          <small v-else class="err">{{ t('invDialog.imageFailed') }}</small>
        </div>
      </div>

      <div class="field">
        <label for="i-vis">{{ t('invDialog.visibility') }}</label>
        <Select v-model="form.visibility" inputId="i-vis" :options="visibilityOptions" optionLabel="label" optionValue="value" fluid />
      </div>

      <div class="buttons">
        <Button type="button" :label="t('lineDialog.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="isEdit ? t('invDialog.save') : t('invDialog.create')" icon="pi pi-check" :loading="saving" :disabled="!valid" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.85rem; color: var(--p-text-muted-color); }
.hint { color: var(--p-text-muted-color); }
.err { color: var(--p-red-500); }
.preview { margin-top: 0.4rem; border-radius: 10px; overflow: hidden; border: 1px solid var(--p-content-border-color); max-height: 9rem; }
.preview img { display: block; width: 100%; height: 9rem; object-fit: cover; }
.preview small { display: block; padding: 0.6rem 0.75rem; }
.buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
