# Bodega Miras · Sistema de trazabilidad

Sistema de trazabilidad para Bodega Miras (Alto Valle de Río Negro). Muestra el grafo de lotes de vino en las dos plantas (Mainqué y Fernández Oro), controla las mermas de cada viaje en camión cisterna y verifica si un lote cumple las reglas de la línea a la que se lo quiere destinar.

Hecho con React (TanStack Start), Tailwind CSS y `localStorage`. No tiene backend: el backend, las políticas y el despliegue se integran después.

## Cómo correrlo

```bash
bun install
bun run dev        # http://localhost:8080
bunx vitest run    # pruebas de los 7 criterios de validación
```

## Pantallas

| Ruta | Para qué |
|---|---|
| `/` | Tablero: ocupación por planta, alertas (planta > 90 %, recipiente lleno, limpieza pendiente, camión sin recibir), lotes en tránsito, accesos rápidos |
| `/recipientes` | Mapa de tanques, piletas y barricas con el color de su planta; registra limpiezas |
| `/movimiento` | Formulario que se adapta al tipo: ingreso, descube, corte, maceración, crianza (llenado y reunión), traslado, embotellado, limpieza |
| `/lotes`, `/lotes/:id` | Listado y ficha del lote: saldo, condiciones heredadas, líneas, árbol de ancestros y descendientes (los traslados son aristas punteadas) |
| `/validador` | Reglas de línea con la condición y el ancestro que fallan |
| `/retiro` | Simulación de retiro de un remito, exportable a CSV |
| `/remitos` | Bandeja de remitos con registro de recepción y anulación |
| `/admin` | Panel protegido por clave |

## Datos de ejemplo

**Todo lo que se ve es dato de ejemplo**, inventado y verosímil: la vendimia 2025, las parcelas, los kilos, las patentes de camiones y los choferes (con alias). Lo genera `src/lib/bodega/seed.ts`, un generador con semilla fija (`mulberry32(1958)`) que siempre da el mismo resultado: 77 movimientos, 8 traslados (R-0008 sigue en tránsito) y el lote de Neuquén mezclado por error en el Corte de guarda (crianza) a través del remito **R-0005**.

Nota: la suma real de los recipientes de Mainqué da 23.600 L (4 × 4.000 + 2 × 2.000 + 16 × 225), y esa es la capacidad que usa el sistema.

### Reiniciar los datos semilla

- Desde la app: **Admin → Reiniciar datos semilla**.
- O a mano: borrar la clave `bodega-miras:datos` del `localStorage` del navegador y recargar.
- Si cambiás `seed.ts`, subí `SEED_VERSION` y todos los navegadores recargan la semilla nueva.

## Funcionalidades simuladas

No hay correos, pagos ni WhatsApp en ninguna pantalla: nada de eso está implementado ni se envía a ningún servicio externo. Todo ocurre en el navegador.

| Qué parece real | Qué pasa en verdad |
|---|---|
| **Simulación de retiro** (`/retiro`) | Solo calcula y muestra la tabla de lotes afectados. No avisa a nadie, no genera orden de destrucción ni comunica a clientes. El botón **Exportar CSV** baja un archivo `retiro-R-XXXX.csv` a la carpeta de descargas del navegador. |
| **Remitos** (`/remitos`) | La llegada se tipea a mano: no hay balanza, GPS ni lectura de precinto. Si los litros recibidos difieren en más de 0,3 % de los enviados, la recepción se rechaza con la diferencia exacta. |
| **Panel de administración** (`/admin`) | La clave protege solo esta pantalla en este navegador. No hay usuarios, roles ni log: cualquiera con la clave ve lo mismo. **Exportar datos (JSON)** baja `bodega-miras-datos.json`. |
| **Fechas y horas** | Salen del reloj del dispositivo, no de un servidor ni de un POS. |
| **Datos de la vendimia 2025** | Inventados por `seed.ts` (parcelas, kilos, patentes, choferes). No reflejan una cosecha real. |

## Clave del panel de administración

- Clave inicial: **`miras1958`**
- Se define en `src/lib/bodega/store.ts` → `DEFAULT_ADMIN_KEY`. Cambiala ahí para un valor inicial distinto.
- Desde **Admin → Clave del panel** se cambia en ese navegador (queda en `localStorage`, clave `bodega-miras:clave-admin`; borrarla vuelve a la inicial).
- Es una protección local del frontend: el control de acceso real lo pone el backend.

## Reglas implementadas

- Saldo de un lote = litros recibidos − salidas a hijos. La merma se descuenta del lote que se crea y nunca se edita a mano.
- Cada recipiente arranca vacío, sube con cada entrada y baja con cada salida. Lleno: no se ofrece como destino. Vacío: necesita una «limpieza» para volver a usarse.
- Traslado: hasta 8.000 L por camión, de 1 a 5 lotes de la misma planta. Crea un lote «en tránsito» que no se puede usar hasta la recepción. Si la recepción difiere en más de 0,3 % se rechaza indicando la diferencia exacta.
- Embotellado solo en Planta Mainqué. No se anula un movimiento (ni un traslado) cuyos lotes tengan descendientes.
- Heredados: orgánico (todos los ancestros de uva), viñedo 1958 (100 % de los litros), meses de barrica (promedio ponderado por litros; el tiempo en barrica se cuenta en meses calendario: `(año₂−año₁)·12 + (mes₂−mes₁) + (día₂−día₁)/30`).
- Líneas: Joven = orgánico · Liviana = orgánico + toda la uva cosechada antes del 25/02 · Crianza = orgánico + ≥ 6 meses · Ícono = orgánico + 100 % 1958 + ≥ 10 meses.

## Ejemplos resueltos a mano (datos semilla)

### Criterio 4 · Corte de guarda con uva de Neuquén → no orgánico

1. Ingresos N1 (no orgánica, uva comprada) en TF1: L-0014 1.050 L, L-0015 1.050 L, L-0017 700 L (factor 0,70 L/kg).
2. Corte L-0031 en TF2: 2.800 − 70 de merma = 2.730 L, 100 % N1.
3. Remito **R-0005**: 600 L en camión (L-0033), se reciben 599 L en T3 (L-0034). Diferencia 0,17 %: se acepta.
4. Base de guarda L-0051 = 599 L de L-0034 + 401 L de Malbec M1 (L-0038) = 1.000 L → **59,9 % N1**.
5. Corte de guarda L-0063 = 3 barricas de la base (B13–B15, 675 L) + 325 L de la base en tanque + 60 L de Cabernet Franc (L-0025) = 1.060 L de orígenes.
   Parte N1 = (675 + 325) / 1.060 × 0,599 = **56,51 %**.
6. Como un ancestro (parcela N1) no es orgánico, L-0063 no es orgánico. El validador lo explica: «el ancestro que rompe la regla es la parcela N1 … aporta 56,51 % a través de L-0014 21,19 %, L-0015 21,19 %, L-0017 14,13 %», y muestra el camino hasta el remito R-0005.
   (Cada ingreso: 1.050 / 2.800 × 0,5651 = 21,19 %; 700 / 2.800 × 0,5651 = 14,13 %.)
7. Barrica del corte: las barricas estuvieron del 20/05/2025 al 17/03/2026 = 10 + (17 − 20)/30 = 9,9 meses → 675 × 9,9 / 1.060 = **6,30 meses**. Cumple la barrica, pero no califica para Crianza porque no es orgánico.

### Criterio 5 · 6 meses de barrica cortado 50/50 → 3 meses

1. Cabernet Franc L-0025 (T6) llena B11 y B12 el 13/05/2025: L-0049 y L-0050, 225 L cada uno.
2. El 13/11/2025 se cortan las dos barricas (450 L, 6,0 meses: de 13/05 a 13/11) con 450 L de L-0025 sin barrica → lote **L-0060** en T5, 900 L.
3. Meses ponderados = (450 × 6 + 450 × 0) / 900 = **3,0 meses** < 6 → **no califica para Crianza** (sí es orgánico y califica para Joven).

### Criterio 6 · Retiro del remito R-0005

Proporción del remito en la guarda = 599/600 recibidos… medido sobre los litros del lote: L-0034 es 100 % R-0005 → base 59,9 % → guarda 1.000/1.060 × 0,599 = 56,51 %. Hay **4 caminos** (base → B13/B14/B15 → guarda y base → guarda directo), que se suman:

| Lote | Producto | Litros | Proporción | Litros afectados | Botellas afectadas |
|---|---|---|---|---|---|
| L-0067 | Corte de guarda | 600 L | 56,51 % | 339,1 L | 452 de 800 |
| L-0068 | Corte de guarda | 439 L | 56,51 % | 248,1 L | 331 de 585 |

El CSV usa exactamente las mismas celdas formateadas que la tabla (separador `;`, coma decimal).

## Estructura

- `src/lib/bodega/engine.ts` — grafo, saldos, capacidad, condiciones heredadas, validador, retiro, anulación (sin React, probado en `src/test/bodega.test.ts`).
- `src/lib/bodega/types.ts` — tipos de datos (lote, movimiento, recipiente, remito).
- `src/lib/bodega/format.ts` — cómo se escriben litros, porcentajes y fechas.
- `src/lib/bodega/seed.ts` — datos semilla deterministas.
- `src/lib/bodega/store.ts` — persistencia en `localStorage`, clave del panel y `SEED_VERSION`.
- `src/routes/*` — una pantalla por archivo (`__root.tsx` trae el menú y el pie).
- `src/components/bodega/AppShell.tsx` — menú y encabezado; `ui.tsx` — piezas reutilizadas (tarjetas, botones, avisos).
- `src/test/bodega.test.ts` — los 7 criterios de validación; `src/test/app-routing.test.tsx` — que todas las rutas existan.

## Pendiente fuera del alcance de esta entrega

Compartir el proyecto con los socios se hace desde la configuración del proyecto en Lovable (Invitar / Compartir); no se puede hacer desde el código.
