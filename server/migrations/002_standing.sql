-- Sistema de castigo graduado (standing)
-- strikes: cancelaciones de pedidos ya aceptados
-- restricted_until: fin de la restricción temporal (unix, segundos); NULL = sin restricción
-- banned_at / ban_reason: suspensión manual (la hace un administrador)
ALTER TABLE users ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN restricted_until INTEGER;
ALTER TABLE users ADD COLUMN banned_at INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
