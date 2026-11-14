# Product rules

- A retry must never create a duplicate order (idempotent writes only).
- Each checkout must run in one transaction.
- Do not query inside a loop; avoid N+1 per item.
- El redondeo debe ser siempre a dos decimales.
- Nunca se aplica un reintento sin clave de duplicado.
- Solo el administrador puede cambiar un rol.
