<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Avatar from 'primevue/avatar'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import ReputationBadge from '@/components/ReputationBadge.vue'
import ReviewDialog from '@/components/ReviewDialog.vue'
import { api, errorMessage } from '@/api.js'
import { useAuthStore } from '@/stores/auth.js'
import { fmtNumber, fmtDate } from '@/format.js'

const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()

const orders = ref([])
const loading = ref(true)
const role = ref('all')       // all | buyer | seller
const status = ref('all')     // all | pending | accepted | ...
const busy = ref(new Set())
const expanded = ref([])      // order_id de los paneles abiertos (todos colapsados al inicio)
let requestId = 0

// --- Datos del usuario actual ---
const me = computed(() => auth.user?.user_id)
// Defensa en profundidad: la seguridad real está en el backend, esto solo evita
// mostrar pedidos ajenos si el servidor llegara a enviarlos por error.
const isMine = o => !!me.value && (o.seller_id === me.value || o.buyer_id === me.value)

// Solo mis pedidos, más recientes primero
const sorted = computed(() =>
  orders.value
    .filter(isMine)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
)

const roleOptions = computed(() => [
  { value: 'all', label: t('orders.tabs.all') },
  { value: 'buyer', label: t('orders.tabs.buying') },
  { value: 'seller', label: t('orders.tabs.selling') }
])
const statusOptions = computed(() => [
  { value: 'all', label: t('orders.statusAll') },
  ...['pending', 'accepted', 'completed', 'rejected', 'cancelled'].map(s => ({ value: s, label: t(`orders.status.${s}`) }))
])

async function load() {
  const id = ++requestId
  loading.value = true
  try {
    const query = {}
    if (role.value !== 'all') query.role = role.value
    if (status.value !== 'all') query.status = status.value
    const data = await api.get('/orders', query)
    if (id !== requestId) return
    orders.value = data
    auth.refreshUser()   // strikes y reseñas pueden haber cambiado el standing
    // Descarta paneles abiertos de pedidos que ya no están en la lista
    const ids = new Set(data.map(o => o.order_id))
    expanded.value = expanded.value.filter(id => ids.has(id))
  } catch (err) {
    if (id !== requestId) return
    toast.add({ severity: 'error', summary: t('orders.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    if (id === requestId) loading.value = false
  }
}
onMounted(load)
watch([role, status], load)

// --- Datos derivados de cada pedido ---
const roleOf = o => (o.seller_id === me.value ? 'seller' : 'buyer')
const itemName = o => o.item_name ?? t('card.unknownItem', { id: o.item_id })

// La otra parte del pedido, y su Discord (el backend solo lo envía si está aceptado/completado)
function other(o) {
  return roleOf(o) === 'seller'
    ? { id: o.buyer_id, name: o.buyer_name, avatar: o.buyer_avatar, reputation: o.buyer_reputation, discord: o.buyer_discord_id, label: t('orders.buyer') }
    : { id: o.seller_id, name: o.seller_name, avatar: o.seller_avatar, reputation: o.seller_reputation, discord: o.seller_discord_id, label: t('orders.seller') }
}

const STATUS_SEVERITY = { pending: 'warn', accepted: 'info', completed: 'success', rejected: 'danger', cancelled: 'secondary' }
const ACTION_UI = {
  accepted: { icon: 'pi pi-check', severity: undefined, outlined: false },
  rejected: { icon: 'pi pi-times', severity: 'danger', outlined: true },
  cancelled: { icon: 'pi pi-ban', severity: 'danger', outlined: true },
  completed: { icon: 'pi pi-check-circle', severity: 'success', outlined: false }
}

// Espejo de TRANSITIONS del backend: qué puede hacer cada parte según el estado
function actionsFor(o) {
  const r = roleOf(o)
  if (o.status === 'pending') return r === 'seller' ? ['accepted', 'rejected'] : ['cancelled']
  if (o.status === 'accepted') return r === 'seller' ? ['completed', 'cancelled'] : ['cancelled']
  return []
}

// --- Cambios de estado ---
function act(o, next) {
  if (next === 'rejected' || next === 'cancelled') {
    confirm.require({
      header: t(`orders.confirm.${next}Header`),
      message: t(`orders.confirm.${next}Text`, { name: other(o).name }),
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: t('orders.keep'), severity: 'secondary', text: true },
      acceptProps: { label: t(`orders.actions.${next}`), severity: 'danger' },
      accept: () => setStatus(o, next)
    })
  } else {
    setStatus(o, next)
  }
}

async function setStatus(o, next) {
  busy.value.add(o.order_id)
  try {
    await api.patch(`/orders/${o.order_id}/status`, { status: next })
    toast.add({ severity: 'success', summary: t(`orders.toast.${next}`), life: 2500 })
    await load()
  } catch (err) {
    toast.add({ severity: 'error', summary: errorMessage(err), life: 6000 })
    // El pedido cambió mientras tanto (o stock insuficiente): refrescamos para ver el estado real
    if (['invalid_transition', 'not_found', 'insufficient_stock'].includes(err.code)) await load()
  } finally {
    busy.value.delete(o.order_id)
  }
}

// --- Calificar ---
const reviewVisible = ref(false)
const reviewing = ref(null)
const rate = o => { reviewing.value = o; reviewVisible.value = true }

// --- Contacto ---
async function copyDiscord(id) {
  try {
    await navigator.clipboard.writeText(String(id))
    toast.add({ severity: 'success', summary: t('orders.contact.copied'), life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: t('inventory.copyFailed'), life: 3000 })
  }
}

const hasFilters = computed(() => role.value !== 'all' || status.value !== 'all')
</script>

<template>
  <header class="head">
    <div>
      <h1>{{ t('orders.title') }}</h1>
      <p class="lead">{{ t('orders.lead') }}</p>
    </div>
    <Button icon="pi pi-refresh" :label="t('common.refresh')" severity="secondary" text :loading="loading" @click="load" />
  </header>

  <div class="filters">
    <SelectButton v-model="role" :options="roleOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
    <Select v-model="status" :options="statusOptions" optionLabel="label" optionValue="value" :aria-label="t('orders.statusAll')" class="status" />
  </div>

  <div v-if="loading && !sorted.length" class="list" aria-hidden="true">
    <Skeleton v-for="n in 3" :key="n" height="9rem" borderRadius="14px" />
  </div>

  <div v-else-if="!sorted.length" class="empty">
    <i class="pi pi-shopping-cart" aria-hidden="true" />
    <p>{{ hasFilters ? t('orders.emptyFiltered') : t('orders.empty') }}</p>
  </div>

  <Accordion v-else v-model:value="expanded" multiple class="list" :class="{ dim: loading }">
    <AccordionPanel v-for="o in sorted" :key="o.order_id" :value="o.order_id" class="order">
      <AccordionHeader>
        <div class="top">
          <div class="what">
            <div class="tags">
              <Tag :severity="STATUS_SEVERITY[o.status]" :value="t(`orders.status.${o.status}`)" />
              <Tag severity="secondary" :icon="roleOf(o) === 'buyer' ? 'pi pi-arrow-down-left' : 'pi pi-arrow-up-right'" :value="roleOf(o) === 'buyer' ? t('orders.roleBuying') : t('orders.roleSelling')" />
            </div>
            <h3>{{ itemName(o) }}</h3>
            <p class="inv">{{ o.inventory_title }} · {{ t('orders.ordered', { date: fmtDate(o.created_at) }) }}</p>
          </div>
          <span class="total num">{{ t('orders.total', { total: fmtNumber(o.amount * o.unit_price) }) }}</span>
        </div>
      </AccordionHeader>

      <AccordionContent>
        <div class="body">
          <span class="line num">{{ t('orders.line', { amount: fmtNumber(o.amount), price: fmtNumber(o.unit_price) }) }}</span>

          <div class="party">
            <Avatar :image="other(o).avatar ?? undefined" :label="other(o).avatar ? undefined : other(o).name[0]" shape="circle" />
            <div class="party-info">
              <span class="role-label">{{ other(o).label }}</span>
              <RouterLink :to="{ name: 'user', params: { id: other(o).id } }" class="party-name">{{ other(o).name }}</RouterLink>
            </div>
            <ReputationBadge :value="other(o).reputation" />
          </div>

          <blockquote v-if="o.message" class="msg"><strong>{{ t('orders.yourMessage') }}:</strong> {{ o.message }}</blockquote>

          <!-- Discord: el backend solo lo entrega cuando el pedido está aceptado o completado -->
          <div v-if="other(o).discord" class="contact">
            <i class="pi pi-discord" />
            <span class="contact-text">{{ t('orders.contact.id', { id: other(o).discord }) }}</span>
            <Button :label="t('orders.contact.copy')" icon="pi pi-copy" size="small" severity="secondary" text @click="copyDiscord(other(o).discord)" />
            <a :href="`https://discord.com/users/${other(o).discord}`" target="_blank" rel="noopener noreferrer" class="open">
              {{ t('orders.contact.open') }} <i class="pi pi-external-link" />
            </a>
          </div>

          <div class="actions">
            <Button
              v-for="a in actionsFor(o)" :key="a"
              :label="t(`orders.actions.${a}`)" :icon="ACTION_UI[a].icon" :severity="ACTION_UI[a].severity"
              :outlined="ACTION_UI[a].outlined" size="small" :disabled="busy.has(o.order_id)" @click="act(o, a)"
            />
            <template v-if="o.status === 'completed'">
              <Button v-if="!o.reviewed" :label="t('orders.actions.rate')" icon="pi pi-star" size="small" @click="rate(o)" />
              <Tag v-else severity="secondary" icon="pi pi-check" :value="t('orders.actions.rated')" />
            </template>
          </div>
        </div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>

  <ReviewDialog v-model:visible="reviewVisible" :orderId="reviewing?.order_id ?? null" :name="reviewing ? other(reviewing).name : ''" @rated="load" />
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
.head h1 { margin: 0 0 0.35rem; font-size: 2rem; }
.lead { margin: 0; color: var(--p-text-muted-color); }
.filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.25rem; }
.status { min-width: 12rem; }

.empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); }
.empty i { font-size: 2.2rem; }

.list { display: flex; flex-direction: column; gap: 0.75rem; transition: opacity 0.15s; }
.list.dim { opacity: 0.55; }
.order { background: var(--p-content-background); border: 1px solid var(--p-content-border-color); border-radius: 14px; overflow: hidden; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex: 1; min-width: 0; padding-right: 0.5rem; }
.what { min-width: 0; }
.tags { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.45rem; }
.what h3 { margin: 0; font-size: 1.15rem; }
.inv { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--p-text-muted-color); }
.total { font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--p-primary-color); white-space: nowrap; }
.body { display: flex; flex-direction: column; gap: 0.8rem; }
.line { color: var(--p-text-muted-color); font-size: 0.9rem; }

.party { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.party-info { display: flex; flex-direction: column; line-height: 1.2; }
.role-label { font-size: 0.75rem; color: var(--p-text-muted-color); }
.party-name { color: inherit; font-weight: 600; text-decoration: none; }
.party-name:hover { text-decoration: underline; }

.msg { margin: 0; padding: 0.6rem 0.9rem; border-left: 3px solid var(--p-primary-color); background: var(--p-content-hover-background); border-radius: 0 8px 8px 0; white-space: pre-line; overflow-wrap: anywhere; }
.contact { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.6rem 0.9rem; border: 1px solid color-mix(in srgb, var(--p-primary-color) 45%, transparent); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); border-radius: 10px; }
.contact > i { color: var(--p-primary-color); }
.contact-text { font-weight: 600; overflow-wrap: anywhere; }
.open { margin-left: auto; font-size: 0.85rem; color: var(--p-primary-color); text-decoration: none; }
.open:hover { text-decoration: underline; }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.actions:empty { display: none; }
@media (max-width: 600px) { .top { flex-direction: column; align-items: flex-start; gap: 0.4rem; } }
</style>
