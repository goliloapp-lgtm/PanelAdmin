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
