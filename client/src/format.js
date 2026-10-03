import { i18n } from '@/i18n.js'

// Leer locale.value dentro de estas funciones hace que los templates se actualicen al cambiar de idioma
export const fmtNumber = n =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat(i18n.global.locale.value).format(n)

// updated_at viene en segundos (unixepoch)
export const fmtDate = s =>
  s ? new Date(s * 1000).toLocaleDateString(i18n.global.locale.value) : '—'
