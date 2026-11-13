# Cambios del contrato de reservas B2B en este repo

Bitácora de lo que cambiamos acá para cumplir el contrato del backend de Lilo. Cada
sección dice qué se tocó, por qué, cómo se verifica y qué NO se tocó. La referencia es
`Backend/Firebase/docs/CONTRATO_FRONTEND.md` (CF-90, CF-91, CF-92) y
`Backend/Firebase/docs/MIGRACION_FRONTEND.md`.

Regla de esta bitácora: se escribe en el mismo commit que el código, con las rutas y las
líneas reales. Si un cambio se revierte, su sección se marca como revertida, no se borra.

## F1 — La cadena del conductor sale del panel de avance

Fecha: 2026-11-13. Alcance: `frontend_Dashboard` — el panel «Actualizar Estado Operativo en
Tiempo Real» de `/Solicitudes` y el servicio de solicitudes B2B. Referencia: CF-54
(`cancelScheduledTrip`), CF-68 (`cancelTrip`) y CF-92 (`platformAdvanceTrip`).

### 1. Qué se borró

| Qué | Dónde estaba | Por qué |
|---|---|---|
| `updateB2BRequestStatus` | `src/services/b2b/requestService.ts:427-493` (antes del cambio) | Encadenaba `dispatchScheduledTrip`, `markDriverArrived`, `startTrip` y `completeRide`/`completeTrip`. Los tres últimos exigen `assertAssignedDriver`, así que desde la consola de plataforma siempre devolvían `permission-denied`: el panel nunca es el conductor asignado |
| `isNotFoundCallableError` y su uso como fallback de la cancelación | `requestService.ts:422-425` y `:510-525` (antes del cambio) | La cancelación elegía puerta por el `code` del error. Un `failed-precondition` —el que devuelve `cancelScheduledTrip` sobre una reserva ya despachada— dejaba la reserva sin cancelar en vez de cambiar de puerta |
| La rama no-cancelación de `handleTransitionStatus` | `src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx:809-897` (antes del cambio) | Era el único consumidor de `updateB2BRequestStatus`, y el único botón que la alcanzaba era el de cancelar. Se reemplaza por `handleCancelReservation` (`page.tsx:806`) |
| Import de `writeTripHistoryCallable` | `page.tsx:61` (antes del cambio) | Sólo se usaba dentro de la rama borrada. El avance del panel ya no escribía historia desde que usa `platformAdvanceTrip`, que graba su propio `tripEvents` |
| Imports de los callables del conductor | `requestService.ts:23-36` (antes del cambio) | `cancelCompanyReservationCallable`, `markDriverArrivedCallable`, `completeRideCallable`, `completeTripCallable`, `dispatchScheduledTripCallable`, `notifyClientDriverArrivedCallable` y `startTripCallable` quedaron sin uso |

`createScheduledTripCallable` (`requestService.ts:18`) ya estaba importado sin uso antes de este
cambio; no se toca para no mezclar alcances.

### 2. Qué lo reemplaza

**Avance del viaje: sólo `platformAdvanceTrip`.** Los cuatro botones ya llamaban a
`handlePlatformAdvance` (`page.tsx:938`), que manda `{ tripId, targetStatus, reason }` con motivo
obligatorio (`page.tsx:952`). No hubo botón que reenganchar ni destino que quitar: ningún botón
del panel entraba por la rama del conductor; el borrado elimina la rama paralela que sólo podía
fallar.

| Botón del panel | Callable | `targetStatus` |
|---|---|---|
| En Camino al Origen (`page.tsx:1540`) | `platformAdvanceTrip` | `accepted` |
| Conductor en Punto (`page.tsx:1555`) | `platformAdvanceTrip` | `driver_arrived` |
| Iniciar Viaje / En Curso (`page.tsx:1573`) | `platformAdvanceTrip` | `in_progress` |
| Marcar Completado (`page.tsx:1591`) | `platformAdvanceTrip` | `completed` |

No se agrega `arrived` como destino: el backend lo rechaza con `invalid-argument` porque ningún
callable escribe ese estado. `completed` es el cierre: `platformAdvanceTrip` realiza la reserva
del techo en la misma transacción, así que el panel no vuelve a tocar el techo por su cuenta.

**Cancelación: la puerta la elige el ESTADO**, en `resolveCancellationDoor`
(`requestService.ts:460`) y `cancelB2BCompanyReservation` (`requestService.ts:479`). El panel le
pasa el estado que muestra (`page.tsx:817`), y el servicio acepta tanto los estados del contrato
de reserva como su espejo camelCase del panel (`mapRawTripStatus`, `src/utils/tripStatus.ts:44`):
`driver_assigned` se ve como `assigned` y `dispatched` como `enRoute`.

| Estado de la reserva (backend) | Estado en el panel | Puerto elegido | Payload |
|---|---|---|---|
| `available`, `offered`, `driver_rejected`, `driver_assigned` | `seeking_driver`, `assigned` | `cancelScheduledTrip` | `{ scheduledTripId, reason }`; es el callable que libera `ceilingReservedAmount` |
| `dispatched` | `enRoute` | `cancelTrip` | `{ rideId, reason }`; el `rideId` del despacho es el mismo `scheduledTripId` |
| `driver_arrived` | `driverArrived` | `cancelTrip` | idem. El botón de cancelar se ocultaba en este estado (`page.tsx:1683-1702`, antes del cambio); ahora se muestra (`page.tsx:1626-1647`) |
| `in_progress`, `arrived` | `inService`, `arrived` | no se cancela | un viaje en curso se reporta y se reasigna (CF-87); el botón sigue oculto |

Un estado fuera de esas dos listas no adivina puerta: `resolveCancellationDoor` lanza un error
con el estado recibido. Ya no hay ningún camino que reintente con otro callable según el `code`.

Como `cancelTrip` no devuelve importe liberado, el panel distingue la puerta en el mensaje
(`page.tsx:824-832`): con `cancelScheduledTrip` informa el saldo liberado del techo; con
`cancelTrip` no inventa una cifra, porque el techo lo resuelve el cierre automático del backend.

### 3. Qué NO se tocó

- `src/utils/functions.ts`: los callables del conductor siguen definidos ahí (`:1100-1345`); este
  repo ya no los invoca desde ningún archivo de `src/`.
- El backend, `firestore.rules`, `database.rules.json` y `ViajesActivos.tsx`.
- `writeTripHistory` no se reengancha a `platformAdvanceTrip`: el avance de plataforma escribe
  `tripEvents` en el servidor y la escritura de `historyTrips` era parte de la rama borrada.

### 4. Cómo se verifica

```bash
grep -rn "startTrip\|markDriverArrived\|completeRide" src/
npm run lint
npx tsc --noEmit
```

El primer comando no debe encontrar **llamadas**: lo único que puede aparecer es la definición de
los tres callables en `src/utils/functions.ts` (fuera de este cambio), porque son exportaciones sin
consumidor en el panel. `grep -rn "startTrip\|markDriverArrived\|completeRide" src/ | grep -v
src/utils/functions.ts` debe salir vacío (exit 1).

En el panel, con una reserva `driver_assigned`: «Cancelar Reserva» llama a `cancelScheduledTrip` y
muestra el importe liberado. Con un viaje `driverArrived`: el botón aparece y cancela por
`cancelTrip` sin cifra inventada. Cualquier avance llama sólo a `platformAdvanceTrip`, con motivo,
y ya no devuelve `permission-denied`.

## F2 — Los errores del backend llegan con su motivo

Fecha: 2026-11-13. Alcance: `frontend_Dashboard` — `src/utils/friendlyError.ts` y el panel de
`/Solicitudes`. Referencia: los rechazos del contrato de reservas (`no-cost-centre`,
`ceiling-reached`, `realise-exceeds-reserved`) y CF-91 (el `invalid-argument` que nombra el campo).

### 1. Qué se rompía

`formatFriendlyError` (`src/utils/friendlyError.ts:6`) leía sólo `error.message` y `error.code`. El
backend nombra el motivo accionable en `HttpsError.details`, así que un rechazo sin palabras clave
conocidas en el `message` caía en el texto genérico —`"No pudimos completar la operación…: "`, con
dos puntos y todo— y el motivo del servidor nunca llegaba a la pantalla.

### 2. El orden de lectura que quedó

1. **`error.details`** — lo lee `readServerDetail` (`friendlyError.ts:259`). Acepta la cadena tal
   cual o el objeto que traiga el servidor, y devuelve el primer texto no vacío de `message`
   (el párrafo que nombra documento y campo), `reason` (el código de la negativa) o `field` (el
   campo rechazado). Ese texto entra en `combined` (`:25`), que es el texto sobre el que clasifican
   los mapeos amables que ya existían.
2. **`error.message`** — como hasta ahora, con las extracciones de número (`requires at least N`) y
   de categoría (`fareRates.<categoría>`).
3. **`error.code`** — para lo que el `message` no nombra: `permission-denied`, `unauthenticated`,
   `unavailable`, `not-found`.
4. **El texto genérico** (`fallbackMessage`) recién cuando los tres anteriores no dieron un texto
   mostrable. Sin `details` ese último tramo queda igual que antes: se devuelve el mensaje en español
   ya limpio, o `fallbackMessage` con el mensaje compacto si el único texto era técnico.

**El texto del servidor se muestra tal cual cuando ningún mapeo lo conoce** (`friendlyError.ts:217`):
no se traduce, no se resume y no se limpia, porque limpiarlo borraría justamente el motivo. Si el
mapeo ya conoce el caso, gana el texto amable deliberado. Salidas medidas:

```
details: "no-cost-centre"                       -> no-cost-centre
details: { reason: "realise-exceeds-reserved" } -> realise-exceeds-reserved
details: { reason: "no-company-document" }      -> no-company-document
details: { reason: "ceiling-reached" }          -> El centro de costo seleccionado ha alcanzado su presupuesto máximo disponible para este periodo.
details: { field: "costCentreId" }              -> Por favor selecciona un centro de costo válido para continuar.
details: { message: "El centro de costo no tiene techo configurado para este periodo." } -> ese texto, tal cual
details ausente, vacío, null o array            -> se ignora y sigue el camino de message/code
```

Sin `details` el camino de `message`/`code` y el recorte final quedan exactamente como estaban. Los
37 casos sin `details` del corpus de verificación salieron idénticos a `HEAD`. En el backend, de 708
`HttpsError` en `functions/src/`, sólo tres pasan un tercer argumento
(`payments/paymentHandlers.ts:221`, `:372` y `:609`): adjuntan el error de Stripe, no un motivo del
contrato de reservas, y ninguno de esos callables se invoca desde `src/` (`completeTripCallable`
sólo está definido, en `src/utils/functions.ts:1113`).

Dentro del `catch` de cancelar cambia además la fuente: antes el panel pasaba `err.message` (sin
`code`) a `setFeedback`, así que los mapeos por código no se alcanzaban nunca. Ahora se pasa el error
completo y esos mapeos sí aplican: `permission-denied` → texto de permisos, `unauthenticated` → sesión
expirada, `not-found` → registro no encontrado, `resource-exhausted` → techo/presupuesto (mapeos que
ya existían en el helper y que el resto de las pantallas ya usaban).

### 3. Los textos enlatados que se sacaron

| Qué | Dónde estaba | Qué lo reemplaza |
|---|---|---|
| `message: err?.message || "Error al cancelar la reserva."` | `page.tsx:843-848` (antes del cambio) | `setErrorFeedback(err, "Error al cancelar la reserva.")` (`page.tsx:846`), que muestra el resultado de `formatFriendlyError(err, …)` |
| El segundo formateo del error en el panel | `setFeedback` (`page.tsx:113-115`) volvía a pasar por `formatFriendlyError` todo mensaje de error | `setErrorFeedback` (`page.tsx:130`) formatea una sola vez. El segundo pase reclasificaba un motivo ya resuelto: `no-company-document` terminaba como «No pudimos completar…: no-company-document» |

El avance (`page.tsx:983`) y aprobar/rechazar (`page.tsx:1683`, `:1719`) ya llamaban a
`formatFriendlyError`; no se tocaron. Lo que sí cambia para los cuatro botones es que ahora los
`details` del backend llegan hasta el texto final.

### 4. Los textos de permisos que se dejaron como estaban

`friendlyError.ts:163-189` («No tienes permisos suficientes…», «Tu sesión ha expirado…», «Solo el
conductor asignado…») se conservan: son la respuesta correcta a un rechazo de autorización y el
código del callable los identifica sin ambigüedad. `details` entra en el texto clasificado pero no
saltea esos mapeos, así que un `permission-denied` con
`details: { reason: "caller-company-differs-from-target" }` sigue mostrando el texto de permisos y no
el código.

### 5. Qué NO se tocó

- Los `catch` que no se nombraron: asignar unidad (`page.tsx:810`), reportar problema / devolver al
  pool (`page.tsx:938`), resolver incidencia (`page.tsx:1016`) y guardar `platformConfig/operations`
  (`page.tsx:1044`). Siguen con `err?.message || …`; `setFeedback` los formatea, pero su texto no se
  cambió en este alcance.
- `src/services/b2b/requestService.ts` y todo archivo fuera de las tres superficies de F2.

### 6. Cómo se verifica

El helper, sin emulador ni build (Node 24 importa el `.ts` directo):

```bash
node --input-type=module -e '
import { formatFriendlyError } from "./src/utils/friendlyError.ts";
console.log(formatFriendlyError({ code: "functions/failed-precondition", message: "Nothing was written.", details: { reason: "realise-exceeds-reserved" } }));
console.log(formatFriendlyError({ code: "functions/permission-denied", message: "Nothing was written.", details: { reason: "caller-company-differs-from-target" } }));
'
```

Debe imprimir `realise-exceeds-reserved` y «No tienes permisos suficientes para realizar esta
acción.». La misma prueba con un error sin `details` debe devolver exactamente lo mismo que antes del
cambio: los 37 casos del corpus sin `details` (cada mapeo de `friendlyError.ts`, más `null`,
`undefined`, cadena vacía y `code` solo) salieron idénticos contra la versión de `HEAD`.

En el panel, con una reserva que el backend rechaza: «Cancelar Reserva» muestra el motivo del
servidor en lugar de «Error al cancelar la reserva.». Los gates del repo:

```bash
npx eslint src/utils/friendlyError.ts "src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx"
npx tsc --noEmit
```

`npm run lint` no se usa: `next lint` de esta versión busca un directorio `lint` y falla por
configuración, no por código.
