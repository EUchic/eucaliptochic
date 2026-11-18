# Eucalipto Chic

Tienda en línea y sistema de finanzas de Eucalipto Chic (by Andrea Bermúdez).

## Estado

| Parte | Estado |
|---|---|
| Tienda pública (inicio, tienda con filtros, página de pieza, bolsa, pedido por WhatsApp) | Hecha; lee el catálogo de la base de datos de Andrea |
| Base de datos (Supabase, proyecto `eucalipto-chic` en la org de Andrea) | Aplicada: `supabase/migrations/0001` y `0002` |
| Catálogo | Importado de Squarespace (52 piezas). Si la base no responde, la tienda vuelve a leer Squarespace |
| Panel de Andrea (`/admin`) | Asistente de voz, plata, piezas, ferias y fotos. Guarda en la base con la clave puesta |
| Fotos | Andrea las sube desde el teléfono (se achican antes de subir) a Supabase Storage |
| Cobro con ONVO Pay | Pendiente de las llaves |
| Asistente con IA y mejora de fotos | Pendiente de la llave de OpenAI (sin ella funciona el asistente básico) |
| Anuncios de Instagram (`/admin` → Anuncios) | Paso a paso, con tope mensual y confirmación obligatoria. Pendiente de `META_ACCESS_TOKEN` |

## Variables en Vercel

| Variable | Para qué | Si falta |
|---|---|---|
| `ADMIN_PASSWORD` | Clave del panel de Andrea | El panel queda en modo de prueba y no guarda nada |
| `SESSION_SECRET` | Firma la sesión del panel (texto largo al azar) | Se deriva de la clave |
| `SUPABASE_SECRET_KEY` | Llave secreta (`sb_secret_…`) de Supabase → Settings → API Keys | El panel no puede guardar |
| `OPENAI_API_KEY` | Asistente con IA y mejora de fotos | Asistente básico |
| `ONVO_SECRET_KEY`, `NEXT_PUBLIC_ONVO_PUBLISHABLE_KEY` | Cobro con tarjeta | Pedido por WhatsApp |
| `META_ACCESS_TOKEN` | Llave del usuario de sistema de Meta (negocio Eucalipto Chic) para las promociones de Instagram | La pestaña Anuncios dice que falta conectar |
| `META_APP_SECRET` | Clave secreta de la app "Eucalipto Chic Panel" (firma cada llamada a Meta) | Funciona igual, con un poco menos de protección |

La llave publicable de Supabase y la URL del proyecto van en el código (`lib/db.ts`): son públicas por diseño.

## Cómo corre

```
npm install
npm run dev
```

- `lib/tienda.ts` es la puerta al catálogo: base de datos primero, Squarespace si la base falla (`CATALOGO=squarespace` lo fuerza).
- `lib/db.ts` habla con Supabase desde el servidor. `app/api/acciones` y `app/api/fotos` son las únicas rutas que guardan.
- `lib/asistente.ts` entiende lo que Andrea dice (sin IA); `app/api/asistente` usa OpenAI cuando hay llave. En los dos casos la IA solo propone: nada se guarda hasta que Andrea dice «sí».

**Ojo:** las fotos viejas todavía viven en el CDN de Squarespace. Antes de cancelar Squarespace hay que copiarlas a Storage.

## Seguridad e idempotencia

- RLS activo en todas las tablas y sin políticas: desde afuera solo se puede llamar `catalogo_publico()`, que no incluye costos.
- Todo lo demás pasa por el servidor con la llave secreta, y el servidor solo acepta cambios con la sesión del panel (cookie firmada, mismo origen).
- Cada acción del panel trae un id único; la tabla `acciones` lo guarda y una acción repetida (doble toque, mala señal) no se aplica dos veces.
- El servidor revisa cada dato: listas permitidas, montos razonables, fechas válidas. Los colones de una venta en dólares los calcula el servidor con el tipo de cambio de Hacienda.
- Las fotos se revisan por su contenido (JPEG/WebP real), no por el nombre. Solo el servidor puede subir al bucket.
- La plata no se borra: se anula, y todo cambio a piezas, movimientos y pagos queda en `bitacora`.
- Pedidos con ONVO (pendiente): precios desde la base, `pedidos.llave_idempotencia`, y un pedido pasa a pagado solo desde el webhook firmado (`webhook_eventos` y `pagos` únicos).
