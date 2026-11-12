# Eucalipto Chic

Tienda en línea y sistema de finanzas de Eucalipto Chic (by Andrea Bermúdez).

## Estado

| Parte | Estado |
|---|---|
| Tienda pública (inicio, tienda con filtros, página de pieza, bolsa, pedido por WhatsApp) | Hecha; lee el catálogo en vivo de Squarespace |
| Esquema de base de datos (`supabase/migrations/0001_inicial.sql`) | Escrito, sin aplicar: falta el proyecto de Supabase |
| Migración de catálogo y fotos a Supabase | Pendiente del proyecto |
| Panel de Andrea (piezas, colecciones, precios, fotos) | Pendiente |
| Finanzas (movimientos, ferias, proveedores, dictado, tipo de cambio, IVA) | Esquema listo; pantallas pendientes |
| Cobro con ONVO Pay | Pendiente de las llaves |
| Mejora de fotos con IA | Pendiente de la llave de OpenAI |

## Cómo corre

```
npm install
npm run dev
```

`lib/catalog.ts` es la única puerta al catálogo. Hoy lee `eucaliptochic.com/tienda?format=json`, une las piezas
duplicadas, unifica tallas y genera URLs limpias. Al pasar a Supabase solo cambia `loadRaw()`.

**Ojo:** mientras el catálogo venga de Squarespace, el dominio no se puede mover a este sitio. Primero se migra a Supabase.

## Seguridad e idempotencia

- RLS en todas las tablas; el público solo lee piezas publicadas y nunca ve el costo.
- Los precios del pedido se calculan en el servidor a partir de la base, nunca con lo que mande el navegador.
- Un pedido solo pasa a "pagado" desde el webhook de ONVO, después de verificar su firma.
- `webhook_eventos (proveedor, evento_id)` y `pagos (proveedor, referencia)` son únicos: un webhook repetido no cobra ni registra dos veces.
- `pedidos.llave_idempotencia` y `movimientos.llave_idempotencia`: un doble toque o un reintento con mala señal no duplica nada.
- Los movimientos de plata no se borran, se anulan; todo cambio queda en `bitacora`.
- Las llaves (ONVO, OpenAI, service role de Supabase) viven solo como variables de entorno del servidor en Vercel.
- La IA propone y Andrea confirma: un dictado no crea ningún movimiento hasta que ella lo aprueba.
