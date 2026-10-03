<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import InventoryDialog from '@/components/InventoryDialog.vue'
import { api, ApiError, errorMessage } from '@/api.js'
import { fmtDate } from '@/format.js'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()

const inventories = ref([])
const loading = ref(true)
const broken = ref(new Set())     // imágenes que no cargaron

async function load() {
  loading.value = true
  try {
    inventories.value = await api.get('/inventories')
    broken.value = new Set()
  } catch (err) {
    toast.add({ severity: 'error', summary: t('myInv.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    loading.value = false
  }
}
onMounted(load)

// --- Crear / editar detalles ---
const dialogVisible = ref(false)
const editing = ref(null)
const openCreate = () => { editing.value = null; dialogVisible.value = true }
const openEdit = inv => { editing.value = inv; dialogVisible.value = true }

function onSaved(inv, wasCreated) {
  // Recién creado: directo a añadir materiales
  if (wasCreated) router.push({ name: 'inventory-edit', params: { id: inv.inventory_id } })
  else load()
}

// --- Acciones ---
const manage = inv => router.push({ name: 'inventory-edit', params: { id: inv.inventory_id } })
const viewPublic = inv => router.push({ name: 'shared-inventory', params: { token: inv.share_token } })

async function copyLink(inv) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/i/${inv.share_token}`)
    toast.add({ severity: 'success', summary: t('inventory.linkCopied'), life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: t('inventory.copyFailed'), life: 4000 })
  }
}

// --- Eliminar (si tiene pedidos, se ofrece ponerlo en privado) ---
function askDelete(inv) {
  confirm.require({
    header: t('myInv.deleteHeader'),
    message: t('myInv.deleteConfirm', { title: inv.title }),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: t('lineDialog.cancel'), severity: 'secondary', text: true },
    acceptProps: { label: t('editor.delete'), severity: 'danger' },
    accept: () => doDelete(inv)
  })
}

async function doDelete(inv) {
  try {
    await api.del(`/inventories/${inv.inventory_id}`)
    inventories.value = inventories.value.filter(i => i.inventory_id !== inv.inventory_id)
    toast.add({ severity: 'success', summary: t('myInv.deleted'), life: 2500 })
  } catch (err) {
    if (err instanceof ApiError && err.code === 'has_orders') askMakePrivate(inv)
    else toast.add({ severity: 'error', summary: errorMessage(err), life: 5000 })
  }
}

function askMakePrivate(inv) {
  confirm.require({
    header: t('myInv.hasOrdersHeader'),
    message: t('myInv.makePrivateInstead'),
    icon: 'pi pi-lock',
    rejectProps: { label: t('lineDialog.cancel'), severity: 'secondary', text: true },
    acceptProps: { label: t('myInv.makePrivate') },
    accept: async () => {
      try {
        await api.patch(`/inventories/${inv.inventory_id}`, { visibility: 'private' })
        toast.add({ severity: 'info', summary: t('myInv.madePrivate'), life: 2500 })
        load()
      } catch (err) {
        toast.add({ severity: 'error', summary: errorMessage(err), life: 5000 })
      }
    }
  })
}

const tagSeverity = v => (v === 'public' ? 'success' : v === 'private' ? 'contrast' : 'secondary')
const tagIcon = v => (v === 'public' ? 'pi pi-globe' : v === 'private' ? 'pi pi-lock' : 'pi pi-link')
</script>

<template>
  <header class="head">
    <div>
      <h1>{{ t('myInv.title') }}</h1>
      <p class="lead">{{ t('myInv.lead') }}</p>
    </div>
    <Button :label="t('myInv.create')" icon="pi pi-plus" @click="openCreate" />
  </header>

  <div v-if="loading && !inventories.length" class="grid" aria-hidden="true">
    <Skeleton v-for="n in 3" :key="n" height="19rem" borderRadius="14px" />
  </div>

  <div v-else-if="!inventories.length" class="empty">
    <i class="pi pi-box" aria-hidden="true" />
    <h2>{{ t('myInv.emptyTitle') }}</h2>
    <p>{{ t('myInv.emptyText') }}</p>
    <Button :label="t('myInv.create')" icon="pi pi-plus" @click="openCreate" />
  </div>

  <div v-else class="grid" :class="{ dim: loading }">
    <article v-for="inv in inventories" :key="inv.inventory_id" class="card">
      <div class="media">
        <img
          v-if="inv.image_url && !broken.has(inv.inventory_id)"
          :src="inv.image_url" alt="" loading="lazy" referrerpolicy="no-referrer"
          @error="broken.add(inv.inventory_id)"
        />
        <div v-else class="ph" aria-hidden="true"><i class="pi pi-box" /></div>
        <Tag class="vis" :severity="tagSeverity(inv.visibility)" :icon="tagIcon(inv.visibility)" :value="t(`editor.visibility.${inv.visibility}`)" />
      </div>

      <div class="body">
        <h3 class="name">
          <RouterLink :to="{ name: 'inventory-edit', params: { id: inv.inventory_id } }" class="stretch">{{ inv.title }}</RouterLink>
        </h3>
        <ul class="meta">
          <li><i class="pi pi-list" /> {{ t('myInv.materials', { count: inv.line_count }, inv.line_count) }}</li>
          <li v-if="inv.location"><i class="pi pi-map-marker" /> {{ inv.location }}</li>
          <li><i class="pi pi-clock" /> {{ t('card.updated', { date: fmtDate(inv.updated_at) }) }}</li>
        </ul>

        <div class="tools">
          <Button
            v-if="inv.visibility !== 'private'" icon="pi pi-external-link" severity="secondary" text rounded
            :aria-label="t('editor.viewPublic')" :title="t('editor.viewPublic')" @click="viewPublic(inv)"
          />
          <Button
            v-if="inv.visibility !== 'private'" icon="pi pi-link" severity="secondary" text rounded
            :aria-label="t('inventory.copyLink')" :title="t('inventory.copyLink')" @click="copyLink(inv)"
          />
          <Button icon="pi pi-pencil" severity="secondary" text rounded :aria-label="t('myInv.editDetails')" :title="t('myInv.editDetails')" @click="openEdit(inv)" />
          <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="t('editor.delete')" :title="t('editor.delete')" @click="askDelete(inv)" />
        </div>
      </div>
    </article>
  </div>

  <InventoryDialog v-model:visible="dialogVisible" :inventory="editing" @saved="onSaved" />
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.head h1 { margin: 0 0 0.35rem; font-size: 2rem; }
.lead { margin: 0; color: var(--p-text-muted-color); max-width: 60ch; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1.1rem; transition: opacity 0.15s; }
.grid.dim { opacity: 0.55; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3.5rem 1rem; text-align: center; color: var(--p-text-muted-color); }
.empty i { font-size: 2.4rem; }
.empty h2 { margin: 0; color: var(--p-text-color); }
.empty p { margin: 0 0 0.5rem; }

.card {
  position: relative; display: flex; flex-direction: column;
  background: var(--p-content-background); border: 1px solid var(--p-content-border-color);
  border-radius: 14px; overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover { transform: translateY(-2px); border-color: var(--p-primary-color); box-shadow: 0 10px 28px -14px color-mix(in srgb, var(--p-primary-color) 55%, transparent); }
.media { position: relative; aspect-ratio: 16 / 9; background: var(--p-content-hover-background); }
.media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph { width: 100%; height: 100%; display: grid; place-items: center; font-size: 2rem; color: var(--p-text-muted-color); background: linear-gradient(135deg, color-mix(in srgb, var(--p-primary-color) 16%, transparent), transparent 70%); }
.vis { position: absolute; top: 0.6rem; left: 0.6rem; }
.body { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem 0.7rem; flex: 1; }
.name { margin: 0; font-size: 1.15rem; line-height: 1.25; }
.stretch { color: inherit; text-decoration: none; }
.stretch::after { content: ''; position: absolute; inset: 0; }
.meta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; color: var(--p-text-muted-color); }
.meta i { font-size: 0.8rem; margin-right: 0.35rem; }
.tools { position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: 0.1rem; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--p-content-border-color); }
</style>
