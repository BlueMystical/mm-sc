<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Paginator from 'primevue/paginator'
import Skeleton from 'primevue/skeleton'
import OfferCard from '@/components/OfferCard.vue'
import { api, errorMessage } from '@/api.js'
import { useCatalogStore } from '@/stores/catalog.js'
import { fmtNumber } from '@/format.js'

const PAGE_SIZE = 20
const SORT_KEYS = ['price_asc', 'price_desc', 'quality_desc', 'recent', 'reputation']

const route = useRoute()
const router = useRouter()
const toast = useToast()
const catalog = useCatalogStore()
const { t } = useI18n()

const sortOptions = computed(() => SORT_KEYS.map(k => ({ value: k, label: t(`explore.sort.${k}`) })))

const num = v => (v === undefined || v === '' || v === null ? null : Number(v))

// La URL es la fuente de verdad: las búsquedas se pueden compartir y funciona "atrás"
function fromQuery(q) {
  return {
    items: q.item_id ? String(q.item_id).split(',').map(Number).filter(Number.isInteger) : [],
    qualityMin: num(q.quality_min),
    priceMin: num(q.price_min),
    priceMax: num(q.price_max),
    location: q.location ? String(q.location) : '',
    sort: q.sort || 'price_asc'
  }
}

function toQuery(f, page = 1) {
  const q = {}
  if (f.items.length) q.item_id = f.items.join(',')
  if (f.qualityMin !== null) q.quality_min = f.qualityMin
  if (f.priceMin !== null) q.price_min = f.priceMin
  if (f.priceMax !== null) q.price_max = f.priceMax
  if (f.location.trim()) q.location = f.location.trim()
  if (f.sort !== 'price_asc') q.sort = f.sort
  if (page > 1) q.page = page
  return q
}

const filters = ref(fromQuery(route.query))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

// Filtros avanzados activos en la búsqueda actual (para el contador del botón)
const advancedCount = computed(() => {
  const f = fromQuery(route.query)
  return [f.qualityMin, f.priceMin, f.priceMax].filter(v => v !== null).length + (f.location ? 1 : 0)
})
const showAdvanced = ref(advancedCount.value > 0)
const hasFilters = computed(() => Object.keys(toQuery(fromQuery(route.query))).length > 0)

const results = ref([])
const total = ref(0)
const loading = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  try {
    const data = await api.get('/public/explore', { ...route.query, page_size: PAGE_SIZE })
    if (id !== requestId) return        // llegó una respuesta más nueva
    results.value = data.results
    total.value = data.total
  } catch (err) {
    if (id !== requestId) return
    results.value = []
    total.value = 0
    toast.add({ severity: 'error', summary: t('explore.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(
  () => route.query,
  () => {
    if (route.name !== 'explore') return
    filters.value = fromQuery(route.query)
    load()
  },
  { immediate: true }
)

onMounted(() => catalog.load())

function go(query) {
  if (JSON.stringify(query) === JSON.stringify(route.query)) load()   // misma búsqueda: refrescar
  else router.push({ name: 'explore', query })
}

const apply = () => go(toQuery(filters.value))
const reset = () => go({})
const refresh = () => {
  if (catalog.failed) catalog.load()   // aprovecha para reintentar el catálogo si había fallado
  load()
}
const onPage = e => go(toQuery(fromQuery(route.query), e.page + 1))

// El material se aplica solo (con una pausa corta mientras se van marcando opciones)
let timer
const applySoon = () => { clearTimeout(timer); timer = setTimeout(apply, 350) }
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <header class="head">
    <h1>{{ t('explore.title') }}</h1>
    <p class="lead">{{ t('explore.lead') }}</p>
  </header>

  <!-- Búsqueda general -->
  <form class="search" @submit.prevent="apply">
    <MultiSelect
      v-model="filters.items" :options="catalog.items"
      optionLabel="name" optionValue="id" filter autoFilterFocus display="chip" :maxSelectedLabels="3"
      :loading="catalog.loading" class="material"
      :aria-label="t('explore.material')"
      :placeholder="catalog.failed ? t('explore.catalogUnavailable') : t('explore.allMaterials')"
      :emptyMessage="catalog.failed ? t('explore.catalogLoadFailed') : t('explore.noMatches')"
      :emptyFilterMessage="t('explore.noMatches')"
      @change="applySoon"
    />
    <Select
      v-model="filters.sort" :options="sortOptions" optionLabel="label" optionValue="value"
      :aria-label="t('explore.sortBy')" class="sort" @change="apply"
    />
    <Button
      type="button" icon="pi pi-sliders-h" :label="t('common.filters')"
      :badge="advancedCount ? String(advancedCount) : undefined"
      :severity="showAdvanced ? 'primary' : 'secondary'" :outlined="!showAdvanced"
      :aria-expanded="showAdvanced" aria-controls="advanced-filters"
      @click="showAdvanced = !showAdvanced"
    />
  </form>

  <!-- Búsqueda avanzada (oculta por defecto) -->
  <form v-show="showAdvanced" id="advanced-filters" class="advanced" @submit.prevent="apply">
    <div class="field">
      <label for="f-quality">{{ t('explore.qualityMin') }}</label>
      <InputNumber v-model="filters.qualityMin" inputId="f-quality" :min="0" :max="1000" :placeholder="t('explore.qualityPlaceholder')" :useGrouping="false" fluid />
    </div>
    <div class="field">
      <label for="f-pmin">{{ t('explore.priceMin') }}</label>
      <InputNumber v-model="filters.priceMin" inputId="f-pmin" :min="0" fluid />
    </div>
    <div class="field">
      <label for="f-pmax">{{ t('explore.priceMax') }}</label>
      <InputNumber v-model="filters.priceMax" inputId="f-pmax" :min="0" fluid />
    </div>
    <div class="field">
      <label for="f-loc">{{ t('explore.location') }}</label>
      <InputText v-model="filters.location" id="f-loc" maxlength="100" :placeholder="t('explore.locationPlaceholder')" fluid />
    </div>
    <div class="buttons">
      <Button type="submit" :label="t('common.apply')" icon="pi pi-check" />
      <Button v-if="hasFilters" type="button" :label="t('common.clearAll')" severity="secondary" text @click="reset" />
    </div>
  </form>

  <div class="count-row">
    <p class="count" aria-live="polite">
      {{ loading ? t('explore.searching') : t('explore.count', { count: fmtNumber(total) }, total) }}
    </p>
    <Button
      icon="pi pi-refresh" :label="t('common.refresh')" size="small"
      severity="secondary" text :loading="loading" @click="refresh"
    />
  </div>

  <div v-if="loading && !results.length" class="grid" aria-hidden="true">
    <Skeleton v-for="n in 8" :key="n" height="21rem" borderRadius="14px" />
  </div>

  <div v-else-if="results.length" class="grid" :class="{ dim: loading }">
    <OfferCard v-for="offer in results" :key="offer.line_id" :offer="offer" />
  </div>

  <div v-else-if="!loading" class="empty">
    <i class="pi pi-search" aria-hidden="true" />
    <p>{{ hasFilters ? t('explore.emptyFiltered') : t('explore.emptyAll') }}</p>
    <Button v-if="hasFilters" :label="t('common.clearAll')" severity="secondary" size="small" @click="reset" />
  </div>

  <Paginator
    v-if="total > PAGE_SIZE"
    :rows="PAGE_SIZE" :totalRecords="total" :first="(page - 1) * PAGE_SIZE"
    class="pager" @page="onPage"
  />
</template>

<style scoped>
.head { margin-bottom: 1.25rem; }
.head h1 { margin: 0 0 0.35rem; font-size: 2rem; }
.lead { margin: 0; color: var(--p-text-muted-color); max-width: 62ch; }

.search { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
.material { flex: 1 1 18rem; min-width: 0; }
.sort { flex: 0 1 15rem; }

.advanced {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; align-items: end;
  margin-top: 0.75rem; padding: 1rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color); border-radius: 14px;
}
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.85rem; color: var(--p-text-muted-color); }
.buttons { display: flex; gap: 0.5rem; }

.count-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0.75rem 0; }
.count { margin: 0; color: var(--p-text-muted-color); font-size: 0.9rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1.1rem; transition: opacity 0.15s; }
.grid.dim { opacity: 0.55; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem 1rem; color: var(--p-text-muted-color); }
.empty i { font-size: 2rem; }
.pager { margin-top: 1.25rem; background: transparent; }
</style>
