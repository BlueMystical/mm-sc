<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Avatar from 'primevue/avatar'
import Skeleton from 'primevue/skeleton'
import ReputationBadge from '@/components/ReputationBadge.vue'
import OrderDialog from '@/components/OrderDialog.vue'
import { api, ApiError, errorMessage } from '@/api.js'
import { useAuthStore } from '@/stores/auth.js'
import { fmtNumber, fmtDate } from '@/format.js'

const props = defineProps({ token: { type: String, required: true } })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const { t } = useI18n()

const inv = ref(null)
const loading = ref(true)
const notFound = ref(false)
const coverBroken = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  notFound.value = false
  try {
    const data = await api.get(`/public/inventories/${encodeURIComponent(props.token)}`)
    if (id !== requestId) return
    inv.value = data
    coverBroken.value = false
  } catch (err) {
    if (id !== requestId) return
    inv.value = null
    if (err instanceof ApiError && err.status === 404) notFound.value = true
    else toast.add({ severity: 'error', summary: t('inventory.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(() => props.token, load, { immediate: true })

const isOwner = computed(() => !!auth.user && !!inv.value && auth.user.user_id === inv.value.seller_id)

// --- Pedidos ---
const orderVisible = ref(false)
const orderLine = ref(null)

function startOrder(line) {
  if (!auth.user) return auth.login(route.fullPath)   // visitante: login y volvemos aquí
  orderLine.value = line
  orderVisible.value = true
}

// --- Compartir ---
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/i/${props.token}`)
    toast.add({ severity: 'success', summary: t('inventory.linkCopied'), life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: t('inventory.copyFailed'), life: 4000 })
  }
}
</script>

<template>
  <!-- Cargando -->
  <div v-if="loading && !inv" class="skeleton">
    <Skeleton height="12rem" borderRadius="14px" />
    <Skeleton height="2rem" width="50%" />
    <Skeleton height="14rem" borderRadius="14px" />
  </div>

  <!-- No existe / es privado -->
  <div v-else-if="notFound" class="empty">
    <i class="pi pi-search" aria-hidden="true" />
    <h1>{{ t('inventory.notFoundTitle') }}</h1>
    <p>{{ t('inventory.notFoundText') }}</p>
    <RouterLink :to="{ name: 'explore' }"><Button :label="t('inventory.backToExplore')" icon="pi pi-arrow-left" severity="secondary" /></RouterLink>
  </div>

  <template v-else-if="inv">
    <section class="hero">
      <div class="cover">
        <img
          v-if="inv.image_url && !coverBroken"
          :src="inv.image_url" alt="" referrerpolicy="no-referrer" @error="coverBroken = true"
        />
        <div v-else class="ph" aria-hidden="true"><i class="pi pi-box" /></div>
      </div>

      <div class="hero-body">
        <div class="titles">
          <h1>{{ inv.title }}</h1>
          <Tag v-if="inv.visibility === 'unlisted'" severity="secondary" icon="pi pi-link" :value="t('inventory.unlisted')" :title="t('inventory.unlistedHint')" />
          <Tag v-if="isOwner" severity="info" :value="t('inventory.yours')" />
        </div>

        <p v-if="inv.description" class="desc">{{ inv.description }}</p>

        <ul class="facts">
          <li v-if="inv.location"><i class="pi pi-map-marker" /> {{ inv.location }}</li>
          <li><i class="pi pi-clock" /> {{ t('inventory.updated', { date: fmtDate(inv.updated_at) }) }}</li>
        </ul>

        <div class="bottom">
          <div class="seller">
            <Avatar :image="inv.seller_avatar ?? undefined" :label="inv.seller_avatar ? undefined : inv.seller_name[0]" shape="circle" size="large" />
            <div class="seller-info">
              <span class="seller-label">{{ t('inventory.seller') }}</span>
              <RouterLink :to="{ name: 'user', params: { id: inv.seller_id } }" class="seller-name">{{ inv.seller_name }}</RouterLink>
            </div>
            <ReputationBadge :value="inv.seller_reputation" />
          </div>
          <div class="actions">
            <Button
              v-if="isOwner" icon="pi pi-pencil" :label="t('inventory.edit')"
              @click="router.push({ name: 'inventory-edit', params: { id: inv.inventory_id } })"
            />
            <Button icon="pi pi-link" :label="t('inventory.copyLink')" severity="secondary" outlined @click="copyLink" />
            <Button icon="pi pi-refresh" :label="t('common.refresh')" severity="secondary" text :loading="loading" @click="load" />
          </div>
        </div>
      </div>
    </section>

    <section class="lines">
      <h2>{{ t('inventory.linesTitle') }}</h2>

      <p v-if="!inv.lines.length" class="muted">{{ t('inventory.noLines') }}</p>

      <ul v-else class="rows" :class="{ dim: loading }">
        <li v-for="line in inv.lines" :key="line.line_id" class="row" :class="{ out: line.stock === 0 }">
          <div class="mat">
            <h3>{{ line.item_name ?? t('card.unknownItem', { id: line.item_id }) }}</h3>
            <span v-if="line.quality !== null" class="chip num">{{ t('card.quality', { value: fmtNumber(line.quality) }) }}</span>
          </div>
          <div class="stock num">
            <template v-if="line.stock > 0">{{ t('card.stock', { value: fmtNumber(line.stock) }) }}</template>
            <template v-else>{{ t('inventory.outOfStock') }}</template>
          </div>
          <div class="price">
            <span class="amount num">{{ fmtNumber(line.price) }}</span>
            <span class="unit">{{ t('card.perScu') }}</span>
          </div>
          <div class="cta">
            <template v-if="!isOwner">
              <Button
                v-if="!auth.user" :label="t('inventory.signInToOrder')" icon="pi pi-discord"
                severity="secondary" outlined :disabled="line.stock === 0" @click="startOrder(line)"
              />
              <Button
                v-else :label="t('inventory.order')" icon="pi pi-shopping-cart"
                :disabled="line.stock === 0" @click="startOrder(line)"
              />
            </template>
          </div>
        </li>
      </ul>

      <p v-if="!isOwner && inv.lines.length" class="muted note"><i class="pi pi-info-circle" /> {{ t('inventory.contactNote') }}</p>
    </section>

    <OrderDialog v-model:visible="orderVisible" :line="orderLine" :inventoryTitle="inv.title" @ordered="load" />
  </template>
</template>

<style scoped>
.skeleton { display: flex; flex-direction: column; gap: 1rem; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); }
.empty i { font-size: 2.2rem; }
.empty h1 { margin: 0; color: var(--p-text-color); font-size: 1.6rem; }
.empty p { margin: 0 0 0.5rem; max-width: 42ch; }

.hero { background: var(--p-content-background); border: 1px solid var(--p-content-border-color); border-radius: 16px; overflow: hidden; }
.cover { aspect-ratio: 21 / 7; max-height: 15rem; width: 100%; background: var(--p-content-hover-background); }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph { width: 100%; height: 100%; display: grid; place-items: center; font-size: 2.5rem; color: var(--p-text-muted-color); background: linear-gradient(135deg, color-mix(in srgb, var(--p-primary-color) 18%, transparent), transparent 70%); }
.hero-body { padding: 1.25rem 1.5rem 1.4rem; display: flex; flex-direction: column; gap: 0.75rem; }
.titles { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.titles h1 { margin: 0; font-size: 1.9rem; }
.desc { margin: 0; max-width: 70ch; white-space: pre-line; }
.facts { list-style: none; margin: 0; padding: 0; display: flex; gap: 1.25rem; flex-wrap: wrap; color: var(--p-text-muted-color); font-size: 0.9rem; }
.facts i { margin-right: 0.35rem; }
.bottom { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding-top: 0.9rem; border-top: 1px solid var(--p-content-border-color); }
.seller { display: flex; align-items: center; gap: 0.7rem; }
.seller-info { display: flex; flex-direction: column; line-height: 1.2; }
.seller-label { font-size: 0.75rem; color: var(--p-text-muted-color); }
.seller-name { color: inherit; font-weight: 600; text-decoration: none; }
.seller-name:hover { text-decoration: underline; }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.lines { margin-top: 1.75rem; }
.lines h2 { margin: 0 0 0.75rem; font-size: 1.35rem; }
.muted { color: var(--p-text-muted-color); }
.note { font-size: 0.85rem; margin-top: 0.75rem; }
.note i { margin-right: 0.35rem; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; transition: opacity 0.15s; }
.rows.dim { opacity: 0.55; }
.row {
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) auto; align-items: center; gap: 1rem;
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background); border: 1px solid var(--p-content-border-color); border-radius: 12px;
}
.row.out { opacity: 0.6; }
.mat { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; min-width: 0; }
.mat h3 { margin: 0; font-size: 1.1rem; }
.chip { padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--p-content-border-color); background: var(--p-content-hover-background); }
.stock { color: var(--p-text-muted-color); }
.price { display: flex; align-items: baseline; gap: 0.4rem; }
.amount { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: var(--p-primary-color); }
.unit { font-size: 0.8rem; color: var(--p-text-muted-color); }
.cta { display: flex; justify-content: flex-end; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr auto; }
  .stock { grid-column: 1; }
  .price { grid-column: 2; grid-row: 1; }
  .cta { grid-column: 1 / -1; justify-content: stretch; }
  .cta :deep(.p-button) { width: 100%; }
}
</style>
