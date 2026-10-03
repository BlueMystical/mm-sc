<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import Paginator from 'primevue/paginator'
import OfferCard from '@/components/OfferCard.vue'
import { api, ApiError, errorMessage } from '@/api.js'
import { useAuthStore } from '@/stores/auth.js'
import { fmtNumber, fmtDate } from '@/format.js'

const props = defineProps({ id: { type: String, required: true } })

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const { t } = useI18n()

const user = ref(null)
const loading = ref(true)
const notFound = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  notFound.value = false
  try {
    const data = await api.get(`/public/users/${encodeURIComponent(props.id)}`)
    if (id !== requestId) return
    user.value = data
  } catch (err) {
    if (id !== requestId) return
    user.value = null
    if (err instanceof ApiError && [400, 404].includes(err.status)) notFound.value = true
    else toast.add({ severity: 'error', summary: t('profile.loadError'), detail: errorMessage(err), life: 5000 })
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch(() => props.id, load, { immediate: true })

// --- Ofertas públicas del vendedor ---
const OFFERS_PAGE_SIZE = 12
const offers = ref([])
const offersTotal = ref(0)
const offersPage = ref(1)
const offersLoading = ref(false)
let offersRequestId = 0

async function loadOffers(page = 1) {
  const id = ++offersRequestId
  offersLoading.value = true
  try {
    const data = await api.get('/public/explore', {
      seller_id: props.id, sort: 'recent', page, page_size: OFFERS_PAGE_SIZE
    })
    if (id !== offersRequestId) return
    offers.value = data.results
    offersTotal.value = data.total
    offersPage.value = page
  } catch (err) {
    if (id !== offersRequestId) return
    offers.value = []
    offersTotal.value = 0
    if (!(err instanceof ApiError && err.status === 400)) {
      toast.add({ severity: 'error', summary: t('profile.offersError'), detail: errorMessage(err), life: 5000 })
    }
  } finally {
    if (id === offersRequestId) offersLoading.value = false
  }
}
watch(() => props.id, () => loadOffers(1), { immediate: true })

const isMe = computed(() => !!auth.user && !!user.value && auth.user.user_id === user.value.user_id)

const totalRatings = computed(() => {
  const r = user.value?.ratings
  return r ? r.positive + r.neutral + r.negative : 0
})
const positivePct = computed(() =>
  totalRatings.value ? Math.round((user.value.ratings.positive / totalRatings.value) * 100) : 0
)
const share = key => (totalRatings.value ? (user.value.ratings[key] / totalRatings.value) * 100 : 0)

// En las reseñas, rating llega como número (1 / 0 / -1)
const KIND = { 1: 'positive', 0: 'neutral', '-1': 'negative' }
const ICON = { positive: 'pi pi-thumbs-up-fill', neutral: 'pi pi-minus-circle', negative: 'pi pi-thumbs-down-fill' }
const kindOf = r => KIND[r.rating] ?? 'neutral'

const repClass = computed(() => (user.value.reputation > 0 ? 'pos' : user.value.reputation < 0 ? 'neg' : ''))
const repText = computed(() => (user.value.reputation > 0 ? `+${user.value.reputation}` : String(user.value.reputation)))
</script>

<template>
  <div v-if="loading && !user" class="skeleton">
    <Skeleton height="9rem" borderRadius="16px" />
    <Skeleton height="6rem" borderRadius="14px" />
    <Skeleton height="10rem" borderRadius="14px" />
  </div>

  <div v-else-if="notFound" class="empty">
    <i class="pi pi-user" aria-hidden="true" />
    <h1>{{ t('profile.notFoundTitle') }}</h1>
    <p>{{ t('profile.notFoundText') }}</p>
    <Button :label="t('inventory.backToExplore')" icon="pi pi-arrow-left" severity="secondary"
      @click="router.push({ name: 'explore' })" />
  </div>

  <template v-else-if="user">
    <!-- Cabecera -->
    <section class="hero">
      <Avatar :image="user.avatar ?? undefined" :label="user.avatar ? undefined : user.user_name[0]" shape="circle"
        size="xlarge" class="avatar" />
      <div class="who">
        <div class="titles">
          <h1>{{ user.user_name }}</h1>
          <Tag v-if="isMe" severity="info" :value="t('profile.you')" />
        </div>
        <p class="since"><i class="pi pi-calendar" /> {{ t('profile.memberSince', { date: fmtDate(user.created_at) }) }}
        </p>
      </div>
      <div class="rep" :class="repClass">
        <span class="rep-value num">{{ repText }}</span>
        <span class="rep-label">{{ t('profile.reputation') }}</span>
      </div>
    </section>

    <!-- Estadísticas -->
    <section class="stats">
      <div class="stat"><span class="n num">{{ fmtNumber(user.completed_sales) }}</span><span class="l">{{
        t('profile.sales') }}</span></div>
      <div class="stat"><span class="n num">{{ fmtNumber(user.completed_purchases) }}</span><span class="l">{{
        t('profile.purchases') }}</span></div>
      <div class="stat"><span class="n num">{{ fmtNumber(totalRatings) }}</span><span class="l">{{
        t('profile.ratingsTitle') }}</span></div>
    </section>

    <!-- Desglose de calificaciones -->
    <section class="block">
      <h2>{{ t('profile.ratingsTitle') }}</h2>
      <p v-if="!totalRatings" class="muted">{{ t('profile.noRatings') }}</p>
      <template v-else>
        <p class="pct">{{ t('profile.positivePct', { pct: positivePct }) }}</p>
        <div class="bar" role="img"
          :aria-label="`${t('profile.positive')}: ${user.ratings.positive}, ${t('profile.neutral')}: ${user.ratings.neutral}, ${t('profile.negative')}: ${user.ratings.negative}`">
          <span class="seg pos" :style="{ width: share('positive') + '%' }" />
          <span class="seg neu" :style="{ width: share('neutral') + '%' }" />
          <span class="seg neg" :style="{ width: share('negative') + '%' }" />
        </div>
        <ul class="legend">
          <li><i class="dot pos" /> {{ t('profile.positive') }} <strong class="num">{{ fmtNumber(user.ratings.positive)
              }}</strong></li>
          <li><i class="dot neu" /> {{ t('profile.neutral') }} <strong class="num">{{ fmtNumber(user.ratings.neutral)
              }}</strong></li>
          <li><i class="dot neg" /> {{ t('profile.negative') }} <strong class="num">{{ fmtNumber(user.ratings.negative)
              }}</strong></li>
        </ul>
      </template>
    </section>

    <!-- Ofertas públicas -->
    <section class="block">
      <h2>{{ t('profile.offersTitle') }}</h2>
      <p v-if="!offersLoading && !offers.length" class="muted">{{ t('profile.noOffers') }}</p>
      <div v-else class="offers" :class="{ dim: offersLoading }">
        <OfferCard v-for="o in offers" :key="o.line_id" :offer="o" hideSeller />
      </div>
      <Paginator v-if="offersTotal > OFFERS_PAGE_SIZE" :rows="OFFERS_PAGE_SIZE" :totalRecords="offersTotal"
        :first="(offersPage - 1) * OFFERS_PAGE_SIZE" class="pager" @page="e => loadOffers(e.page + 1)" />
    </section>



    <!-- Reseñas recientes -->
    <section class="block">
      <h2>{{ t('profile.recentTitle') }}</h2>
      <p v-if="!user.recent_reviews.length" class="muted">{{ t('profile.noReviews') }}</p>
      <ul v-else class="reviews">
        <li v-for="(r, i) in user.recent_reviews" :key="i" class="review">
          <Avatar :image="r.reviewer_avatar ?? undefined" :label="r.reviewer_avatar ? undefined : r.reviewer_name[0]"
            shape="circle" />
          <div class="review-body">
            <div class="review-head">
              <strong>{{ r.reviewer_name }}</strong>
              <i :class="[ICON[kindOf(r)], 'kind', kindOf(r)]" :title="t(`profile.${kindOf(r)}`)" />
              <span class="date">{{ fmtDate(r.created_at) }}</span>
            </div>
            <p v-if="r.comment" class="comment">{{ r.comment }}</p>
            <p v-else class="comment muted">{{ t('profile.noComment') }}</p>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.empty i {
  font-size: 2.2rem;
}

.empty h1 {
  margin: 0;
  color: var(--p-text-color);
  font-size: 1.6rem;
}

.empty p {
  margin: 0 0 0.5rem;
}

.hero {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  padding: 1.5rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 16px;
}

.who {
  flex: 1;
  min-width: 12rem;
}

.titles {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.titles h1 {
  margin: 0;
  font-size: 1.9rem;
}

.since {
  margin: 0.3rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.since i {
  margin-right: 0.35rem;
}

.rep {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem 1.3rem;
  border-radius: 12px;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-hover-background);
}

.rep-value {
  font-family: var(--font-display);
  font-size: 2.1rem;
  font-weight: 700;
  line-height: 1.1;
}

.rep.pos .rep-value {
  color: var(--p-green-500);
}

.rep.neg .rep-value {
  color: var(--p-red-500);
}

.rep-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.stat {
  display: flex;
  flex-direction: column;
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
}

.stat .n {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--p-primary-color);
}

.stat .l {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.block {
  margin-top: 1.75rem;
}

.block h2 {
  margin: 0 0 0.75rem;
  font-size: 1.3rem;
}

.muted {
  color: var(--p-text-muted-color);
}

.offers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 1.1rem;
  transition: opacity 0.15s;
}

.offers.dim {
  opacity: 0.55;
}

.pager {
  margin-top: 1rem;
  background: transparent;
}

.pct {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.bar {
  display: flex;
  height: 0.7rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--p-content-border-color);
}

.seg.pos,
.dot.pos {
  background: var(--p-green-500);
}

.seg.neu,
.dot.neu {
  background: var(--p-surface-400);
}

.seg.neg,
.dot.neg {
  background: var(--p-red-500);
}

.legend {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.legend strong {
  color: var(--p-text-color);
  margin-left: 0.25rem;
}

.dot {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  margin-right: 0.35rem;
}

.reviews {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.review {
  display: flex;
  gap: 0.8rem;
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
}

.review-body {
  flex: 1;
  min-width: 0;
}

.review-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.kind.positive {
  color: var(--p-green-500);
}

.kind.negative {
  color: var(--p-red-500);
}

.kind.neutral {
  color: var(--p-text-muted-color);
}

.date {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.comment {
  margin: 0.3rem 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
