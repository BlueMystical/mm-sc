<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from 'primevue/avatar'
import ReputationBadge from '@/components/ReputationBadge.vue'
import { useAuthStore } from '@/stores/auth.js'
import { fmtNumber, fmtDate } from '@/format.js'

const props = defineProps({
  offer: { type: Object, required: true },
  hideSeller: { type: Boolean, default: false }     // en el perfil del propio vendedor sobra
})
const { t } = useI18n()
const auth = useAuthStore()
const isMine = computed(() => !!auth.user && auth.user.user_id === props.offer.seller_id)
const broken = ref(false)   // si la imagen externa falla, mostramos el placeholder
</script>

<template>
  <article class="card">
    <div class="media">
      <img
        v-if="offer.image_url && !broken"
        :src="offer.image_url" alt="" loading="lazy" referrerpolicy="no-referrer"
        @error="broken = true"
      />
      <div v-else class="ph" aria-hidden="true"><i class="pi pi-box" /></div>
      <span v-if="isMine" class="mine">{{ t('card.yours') }}</span>
      <span v-if="offer.quality !== null" class="chip num">{{ t('card.quality', { value: fmtNumber(offer.quality) }) }}</span>
    </div>

    <div class="body">
      <p class="inv">{{ offer.title }}</p>
      <h3 class="name">
        <!-- El enlace se estira sobre toda la tarjeta; el del vendedor queda por encima -->
        <RouterLink :to="{ name: 'shared-inventory', params: { token: offer.share_token } }" class="stretch">
          {{ offer.item_name ?? t('card.unknownItem', { id: offer.item_id }) }}
        </RouterLink>
      </h3>

      <p class="price">
        <span class="amount num">{{ fmtNumber(offer.price) }}</span>
        <span class="unit">{{ t('card.perScu') }}</span>
      </p>

      <ul class="meta">
        <li><i class="pi pi-database" /> {{ t('card.stock', { value: fmtNumber(offer.stock) }) }}</li>
        <li v-if="offer.location"><i class="pi pi-map-marker" /> {{ offer.location }}</li>
        <li><i class="pi pi-clock" /> {{ t('card.updated', { date: fmtDate(offer.updated_at) }) }}</li>
      </ul>

      <div v-if="!hideSeller" class="seller">
        <Avatar :image="offer.seller_avatar ?? undefined" :label="offer.seller_avatar ? undefined : offer.seller_name[0]" shape="circle" />
        <RouterLink :to="{ name: 'user', params: { id: offer.seller_id } }" class="seller-name">{{ offer.seller_name }}</RouterLink>
        <ReputationBadge :value="offer.seller_reputation" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex; flex-direction: column;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover {
  transform: translateY(-2px);
  border-color: var(--p-primary-color);
  box-shadow: 0 10px 28px -14px color-mix(in srgb, var(--p-primary-color) 55%, transparent);
}
.media { position: relative; aspect-ratio: 16 / 9; background: var(--p-content-hover-background); }
.media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph {
  width: 100%; height: 100%; display: grid; place-items: center;
  font-size: 2rem; color: var(--p-text-muted-color);
  background: linear-gradient(135deg, color-mix(in srgb, var(--p-primary-color) 16%, transparent), transparent 70%);
}
.chip {
  position: absolute; top: 0.6rem; left: 0.6rem;
  padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
  background: color-mix(in srgb, var(--p-content-background) 82%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid var(--p-content-border-color);
}
.mine {
  position: absolute; top: 0.6rem; right: 0.6rem;
  padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700;
  background: var(--p-primary-color); color: var(--p-primary-contrast-color);
}
.body { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem 1rem; flex: 1; }
.inv { margin: 0; font-size: 0.8rem; color: var(--p-text-muted-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name { margin: 0; font-size: 1.15rem; line-height: 1.25; }
.stretch { color: inherit; text-decoration: none; }
.stretch::after { content: ''; position: absolute; inset: 0; }
.price { margin: 0; display: flex; align-items: baseline; gap: 0.4rem; }
.amount { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--p-primary-color); }
.unit { font-size: 0.8rem; color: var(--p-text-muted-color); }
.meta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; color: var(--p-text-muted-color); }
.meta i { font-size: 0.8rem; margin-right: 0.35rem; }
.seller { position: relative; z-index: 1; display: flex; align-items: center; gap: 0.5rem; margin-top: auto; padding-top: 0.6rem; border-top: 1px solid var(--p-content-border-color); }
.seller-name { color: inherit; text-decoration: none; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seller-name:hover { text-decoration: underline; }
</style>
