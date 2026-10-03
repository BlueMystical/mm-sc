<script setup>
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'

const props = defineProps({ value: { type: Number, default: 0 } })
const { t } = useI18n()
const severity = () => (props.value > 0 ? 'success' : props.value < 0 ? 'danger' : 'secondary')
const text = () => (props.value > 0 ? `+${props.value}` : String(props.value))
</script>

<template>
  <Tag :severity="severity()" :value="text()" :title="t('card.reputation')" />
</template>
