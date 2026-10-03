// mm-sc/server/src/services/uex.js
const UEX_BASE = 'https://api.uexcorp.uk/2.0'
const TTL_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 5 * 60 * 1000

let cache = { at: 0, map: new Map() }

// Materiales de UEX que NO se pueden vender en MM-SC (ajusta a gusto)
const EXCLUDED = [
    /construction/i,   // Construction Material Pebbles/Rubble/Salvage, Construction Pieces, Construction Materials
    /inert/i,          // Inert Materials
    /\bseed\b/i,       // Wuotan Seed
    /\bpod\b/i,        // Decari Pod
    /quantum fuel/i,
    /^steel$/i,
    /^ice\b/i
]

async function refresh() {
    const headers = {}
    if (process.env.UEX_API_TOKEN) {
        headers.Authorization = `Bearer ${process.env.UEX_API_TOKEN}`
    }
    const res = await fetch(`${UEX_BASE}/commodities`, {
        headers,
        signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`UEX respondió ${res.status}`)
    const body = await res.json()
    if (body.status !== 'ok' || !Array.isArray(body.data)) {
        throw new Error('UEX: respuesta inesperada')
    }

    const map = new Map(
        body.data.map(c => {
            const item = {
                id: c.id,
                id_parent: c.id_parent ?? null,
                name: c.name,
                code: c.code,
                kind: c.kind,
                weight_scu: c.weight_scu,
                is_mineral: c.is_mineral === 1,
                is_extractable: c.is_extractable === 1,
                is_raw: c.is_raw === 1,
                is_refined: c.is_refined === 1
            }
            item.is_listable =
                (item.is_extractable || item.is_raw || item.is_refined) &&
                !EXCLUDED.some(re => re.test(item.name))
            return [c.id, item]
        })
    )
    cache = { at: Date.now(), map }
}

export async function getCommodities() {
    if (Date.now() - cache.at > TTL_MS) {
        try {
            await refresh()
        } catch (err) {
            if (cache.map.size === 0) throw err
            console.error('UEX no disponible, usando caché anterior:', err.message)
            cache.at = Date.now() - TTL_MS + RETRY_MS // reintenta en 5 min
        }
    }
    return cache.map
}