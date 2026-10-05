<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/auth.js'
import { fmtDate } from '@/format.js'

const auth = useAuthStore()
const { t } = useI18n()

const standing = computed(() => auth.user?.standing ?? null)
const level = computed(() => standing.value?.level ?? 'normal')

const SEVERITY = { probation: 'warn', restricted: 'error', suspended: 'error' }

const text = computed(() => {
  const s = standing.value
  if (!s) return ''
  if (s.level === 'probation') return t('standing.probation', { max: s.max_active_orders ?? 2 })
  if (s.level === 'restricted') return t('standing.restricted', { date: fmtDate(s.restricted_until) })
  if (s.level === 'suspended') return t('standing.suspended')
  return ''
})
</script>

<template>
  <Message v-if="level !== 'normal'" :severity="SEVERITY[level]" :closable="false" class="standing">
    <div>
      <span>{{ text }}</span>
      <div v-if="level === 'suspended' && standing.ban_reason" class="reason">
        {{ t('standing.reason', { reason: standing.ban_reason }) }}
      </div>
    </div>
  </Message>
</template>

<style scoped>
.standing { margin-bottom: 1rem; }
.reason { margin-top: 0.25rem; font-size: 0.9rem; opacity: 0.85; overflow-wrap: anywhere; }
</style>
