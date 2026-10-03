<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import Skeleton from 'primevue/skeleton'
import LineDialog from '@/components/LineDialog.vue'
import { api, ApiError, errorMessage } from '@/api.js'
import { fmtNumber } from '@/format.js'

const props = defineProps({ id: { type: String, required: true } })

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()

const invId = computed(() => Number(props.id))
const inv = ref(null)
const lines = ref([])
const loading = ref(true)
const notFound = ref(false)
const busy = ref(new Set())     // líneas con una petición en curso
let requestId = 0

const itemName = line => line.item_name ?? t('card.unknownItem', { id: line.item_id })

async function load() {
  const id = ++requestId
  loading.value = true
  notFound.value = false
  try {
    const [i, l] = await Promise.all([
      api.get(`/inventories/${invId.value}`),
      api.get(`/inventories/${invId.value}/lines`)     // el dueño ve también las líneas ocultas
    ])
    if (id !== requestId) return
    inv.value = i
    lines.value = l
  } catch (err) {
    if (id !== requestId) return
    inv.value = null
    if (err instanceof ApiError && [400, 404].includes(err.status)) notFound.value = true
    else toast.add({ severity: 'error', summary: t('editor.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch(() => props.id, load, { immediate: true })

async function reloadLines() {
  try {
    lines.value = await api.get(`/inventories/${invId.value}/lines`)
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 5000 })
  }
}

// --- Añadir / editar ---
const dialogVisible = ref(false)
const editing = ref(null)
const openAdd = () => { editing.value = null; dialogVisible.value = true }
const openEdit = line => { editing.value = line; dialogVisible.value = true }

// --- Visible / oculta (p. ej. "me quedé sin stock por ahora") ---
async function setVisible(line, value) {
  busy.value.add(line.line_id)
  try {
    const r = await api.patch(`/inventories/${invId.value}/lines/${line.line_id}`, { is_visible: value })
    line.is_visible = r.is_visible
    toast.add({ severity: 'info', summary: value ? t('editor.shownDone') : t('editor.hiddenDone'), life: 2500 })
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 5000 })
  } finally {
    busy.value.delete(line.line_id)
  }
}

// --- Eliminar (si tiene pedidos, se ofrece ocultarla) ---
function askDelete(line) {
  confirm.require({
    header: t('editor.deleteHeader'),
    message: t('editor.deleteConfirm', { item: itemName(line) }),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: t('lineDialog.cancel'), severity: 'secondary', text: true },
    acceptProps: { label: t('editor.delete'), severity: 'danger' },
    accept: () => doDelete(line)
  })
}

async function doDelete(line) {
  busy.value.add(line.line_id)
  try {
    await api.del(`/inventories/${invId.value}/lines/${line.line_id}`)
    lines.value = lines.value.filter(l => l.line_id !== line.line_id)
    toast.add({ severity: 'success', summary: t('editor.deleted'), life: 2500 })
  } catch (err) {
    if (err instanceof ApiError && err.code === 'has_orders') askHide(line)
    else toast.add({ severity: 'error', summary: errorMessage(err), life: 5000 })
  } finally {
    busy.value.delete(line.line_id)
  }
}

function askHide(line) {
  confirm.require({
    header: t('editor.hideHeader'),
    message: t('editor.hideInstead'),
    icon: 'pi pi-eye-slash',
    rejectProps: { label: t('lineDialog.cancel'), severity: 'secondary', text: true },
    acceptProps: { label: t('editor.hide') },
    accept: () => setVisible(line, false)
  })
}

// --- Compartir ---
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/i/${inv.value.share_token}`)
    toast.add({ severity: 'success', summary: t('inventory.linkCopied'), life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: t('inventory.copyFailed'), life: 4000 })
  }
}
const isPrivate = computed(() => inv.value?.visibility === 'private')
</script>

<template>
  <div v-if="loading && !inv" class="skeleton">
    <Skeleton height="2.5rem" width="45%" />
    <Skeleton height="5rem" borderRadius="12px" />
    <Skeleton height="5rem" borderRadius="12px" />
  </div>

  <div v-else-if="notFound" class="empty">
    <i class="pi pi-search" aria-hidden="true" />
    <h1>{{ t('editor.notFoundTitle') }}</h1>
    <p>{{ t('editor.notFoundText') }}</p>
    <Button :label="t('editor.back')" icon="pi pi-arrow-left" severity="secondary" @click="router.push('/inventories')" />
  </div>

  <template v-else-if="inv">
    <RouterLink to="/inventories" class="back"><i class="pi pi-arrow-left" /> {{ t('editor.back') }}</RouterLink>

    <header class="head">
      <div>
        <div class="titles">
          <h1>{{ inv.title }}</h1>
          <Tag :value="t(`editor.visibility.${inv.visibility}`)" :severity="inv.visibility === 'public' ? 'success' : 'secondary'" />
        </div>
        <p class="sub">{{ t('editor.subtitle') }}</p>
      </div>
      <div class="actions">
        <Button
          v-if="!isPrivate" :label="t('editor.viewPublic')" icon="pi pi-external-link" severity="secondary" outlined
          @click="router.push({ name: 'shared-inventory', params: { token: inv.share_token } })"
        />
        <Button v-if="!isPrivate" :label="t('inventory.copyLink')" icon="pi pi-link" severity="secondary" text @click="copyLink" />
        <Button :label="t('editor.addLine')" icon="pi pi-plus" @click="openAdd" />
      </div>
    </header>

    <p v-if="isPrivate" class="hint"><i class="pi pi-lock" /> {{ t('editor.privateHint') }}</p>
    <p class="hint"><i class="pi pi-info-circle" /> {{ t('editor.visibilityHint') }}</p>

    <p v-if="!lines.length" class="empty-lines">{{ t('editor.empty') }}</p>

    <ul v-else class="rows">
      <li v-for="line in lines" :key="line.line_id" class="row" :class="{ off: !line.is_visible }">
        <div class="mat">
          <h3>{{ itemName(line) }}</h3>
          <span v-if="line.quality !== null" class="chip num">{{ t('card.quality', { value: fmtNumber(line.quality) }) }}</span>
          <Tag v-if="line.stock === 0" severity="warn" :value="t('editor.outOfStock')" />
        </div>
        <div class="stock num">{{ t('card.stock', { value: fmtNumber(line.stock) }) }}</div>
        <div class="price">
          <span class="amount num">{{ fmtNumber(line.price) }}</span>
          <span class="unit">{{ t('card.perScu') }}</span>
        </div>
        <label class="state">
          <ToggleSwitch
            :modelValue="!!line.is_visible" :disabled="busy.has(line.line_id)"
            :aria-label="t('editor.toggleLabel', { item: itemName(line) })"
            @update:modelValue="v => setVisible(line, v)"
          />
          <span>{{ line.is_visible ? t('editor.visible') : t('editor.hidden') }}</span>
        </label>
        <div class="row-actions">
          <Button icon="pi pi-pencil" severity="secondary" text rounded :aria-label="t('editor.edit')" :disabled="busy.has(line.line_id)" @click="openEdit(line)" />
          <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="t('editor.delete')" :disabled="busy.has(line.line_id)" @click="askDelete(line)" />
        </div>
      </li>
    </ul>

    <LineDialog v-model:visible="dialogVisible" :inventoryId="invId" :line="editing" @saved="reloadLines" />
  </template>
</template>

<style scoped>
.skeleton { display: flex; flex-direction: column; gap: 1rem; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); }
.empty i { font-size: 2.2rem; }
.empty h1 { margin: 0; color: var(--p-text-color); font-size: 1.6rem; }
.empty p { margin: 0 0 0.5rem; }

.back { display: inline-flex; align-items: center; gap: 0.4rem; margin-bottom: 0.75rem; color: var(--p-text-muted-color); text-decoration: none; font-size: 0.9rem; }
.back:hover { color: var(--p-primary-color); }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.titles { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.titles h1 { margin: 0; font-size: 1.9rem; }
.sub { margin: 0.25rem 0 0; color: var(--p-text-muted-color); }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.hint { margin: 0 0 0.5rem; color: var(--p-text-muted-color); font-size: 0.85rem; }
.hint i { margin-right: 0.35rem; }
.empty-lines { padding: 2.5rem 1rem; text-align: center; color: var(--p-text-muted-color); border: 1px dashed var(--p-content-border-color); border-radius: 12px; margin-top: 1rem; }

.rows { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.row {
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1fr) auto; align-items: center; gap: 1rem;
  padding: 0.8rem 1.1rem;
  background: var(--p-content-background); border: 1px solid var(--p-content-border-color); border-radius: 12px;
}
.row.off { background: color-mix(in srgb, var(--p-content-background) 55%, transparent); border-style: dashed; }
.row.off .mat, .row.off .stock, .row.off .price { opacity: 0.6; }
.mat { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; min-width: 0; }
.mat h3 { margin: 0; font-size: 1.05rem; }
.chip { padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--p-content-border-color); background: var(--p-content-hover-background); }
.stock { color: var(--p-text-muted-color); }
.price { display: flex; align-items: baseline; gap: 0.4rem; }
.amount { font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; color: var(--p-primary-color); }
.unit { font-size: 0.8rem; color: var(--p-text-muted-color); }
.state { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--p-text-muted-color); cursor: pointer; }
.row-actions { display: flex; gap: 0.1rem; justify-content: flex-end; }

@media (max-width: 820px) {
  .row { grid-template-columns: 1fr auto; }
  .stock { grid-column: 1; }
  .price { grid-column: 2; grid-row: 1; }
  .state { grid-column: 1; }
  .row-actions { grid-column: 2; }
}
</style>
