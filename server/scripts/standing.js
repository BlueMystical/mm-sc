// Administración del standing de usuarios (la identidad es el discord_id).
//   node --env-file=.env scripts/standing.js status    <discord_id>
//   node --env-file=.env scripts/standing.js ban       <discord_id> <motivo...>
//   node --env-file=.env scripts/standing.js unban     <discord_id>
//   node --env-file=.env scripts/standing.js restrict  <discord_id> <días>
//   node --env-file=.env scripts/standing.js unrestrict <discord_id>
//   node --env-file=.env scripts/standing.js strikes   <discord_id> <n>     (fija los strikes)
import { db } from '../src/db/client.js'
import { getStanding } from '../src/services/standing.js'

const [cmd, discordId, ...rest] = process.argv.slice(2)
if (!cmd || !discordId) {
  console.error('Uso: standing.js <status|ban|unban|restrict|unrestrict|strikes> <discord_id> [args]')
  process.exit(1)
}

const found = await db.execute({
  sql: 'SELECT user_id, user_name FROM users WHERE discord_id = ?',
  args: [discordId]
})
const user = found.rows[0]
if (!user) { console.error('No existe un usuario con ese discord_id'); process.exit(1) }

const set = (sql, ...args) => db.execute({ sql: `UPDATE users SET ${sql} WHERE user_id = ?`, args: [...args, user.user_id] })

switch (cmd) {
  case 'status': break
  case 'ban': await set('banned_at = unixepoch(), ban_reason = ?', rest.join(' ') || null); break
  case 'unban': await set('banned_at = NULL, ban_reason = NULL'); break
  case 'restrict': {
    const days = Number(rest[0])
    if (!Number.isFinite(days) || days <= 0) { console.error('Indica los días (> 0)'); process.exit(1) }
    await set('restricted_until = unixepoch() + ?', Math.round(days * 86400)); break
  }
  case 'unrestrict': await set('restricted_until = NULL'); break
  case 'strikes': {
    const n = Number(rest[0])
    if (!Number.isInteger(n) || n < 0) { console.error('Indica un entero >= 0'); process.exit(1) }
    await set('strikes = ?', n); break
  }
  default: console.error(`Comando desconocido: ${cmd}`); process.exit(1)
}

console.log(user.user_name, await getStanding(user.user_id))
process.exit(0)
