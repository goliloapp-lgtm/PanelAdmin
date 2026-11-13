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

## F3 — Centros de costo activos y aviso previo

Fecha: 2026-11-12. Alcance: `frontend_Dashboard` — el alta de reserva de `/Solicitudes/nueva`
y la lectura de centros de `src/services/b2b/companyService.ts`. Referencia: CF-91 §3 (la regla del
selector) y los rechazos `no-cost-centre` / centro inexistente del backend.

### 1. Qué se rompía

- El selector del alta ofrecía centros retirados: ni la pantalla ni la lectura que consumía miraban
  la bandera `active`. Elegir uno hace que el backend rechace con `failed-precondition` nombrando el
  id pedido y los que la empresa sí tiene.
- Cuando la empresa no tenía ningún centro, el campo dejaba de ser obligatorio (`page.tsx:579-580`,
  antes del cambio), el menú mostraba un `MenuItem` inventado «General Corporativo»
  (`page.tsx:584-585`, antes del cambio) y el helper prometía que «se resolverá automáticamente en
  servidor». El backend nunca adivina: con cero centros rechaza `failed-precondition`
  (`no-cost-centre`), y «General Corporativo» no es el id de ningún documento.
- Además, un error de lectura se veía igual que una empresa sin centros: `getCostCenters` traga el
  error y devuelve `[]` (CF-91 §4), así que el formulario iba a bloquear con «no tiene centros»
  aunque el problema fuera de permisos o de red.

### 2. Dónde vive el filtro: el getter compartido no cambia

`getCostCenters` (`companyService.ts:514-524`) conserva el comportamiento de `HEAD`: **no filtra** y
sigue devolviendo `[]` ante un fallo de lectura. Lo consume `CostCenterManager`
(`src/app/(DashboardLayout)/(B2B)/_components/CostCenterManager.tsx:72`), que necesita ver los
centros retirados para poder reactivarlos (`:231-233`, chip «Inactivo» en `:269-273`). Ese archivo
no se tocó.

La lectura común quedó en `readCostCenters` (`companyService.ts:460-510`) y su mapeo ahora expone
`active: c.active !== false` (`:481`); el fallback conserva el campo del documento (`...raw`,
`:502`). Sobre eso:

| Función | Contrato | Consumidor |
|---|---|---|
| `getCostCenters` (`:514-524`) | lista completa, `[]` si falla la lectura (igual que `HEAD`) | `CostCenterManager` y demás pantallas |
| `getCostCentersResult` (`:535-548`) | `{ ok: true, costCenters }` o `{ ok: false, error }` | sólo el alta de reserva |

El formulario filtra `cc.active !== false` (`page.tsx:212-214`). Sin el campo `active` el centro
cuenta como activo (documentos anteriores a la bandera), igual que la proyección del backend
(`projectCostCentre`, `costCentreCallables.ts:632`, `active: data.active !== false`). `active: false`
es la única marca de retiro (`deleteCostCenter`, `companyService.ts:610-622`).

### 3. Las ramas del alta: 0 / 1 / varios / lectura fallida

| Estado | Selección inicial | Envío | Dónde |
|---|---|---|---|
| 0 activos | vacía; selector deshabilitado con `-- Sin centros de costo activos --` y helper «La empresa no tiene centros de costo activos; creá uno antes de reservar.» | bloqueado antes del callable con ese mismo texto | validación `page.tsx:377-380`; campo `:642-643`, `:663-666` |
| 1 activo | autoseleccionado; helper «Único centro de costo activo de la empresa: se usa automáticamente.» | permitido; manda su id | `page.tsx:218`, `:489-493`, `:644-645` |
| Varios | vacía, con `-- Selecciona un centro de costo * --` y helper «La empresa tiene varios centros de costo activos. Selecciona uno.» | bloqueado hasta elegir un id que exista en `costCenters` | validación `page.tsx:391-399`; campo `:646-647`, `:669-672` |
| Lectura fallida | vacía; selector deshabilitado con `-- No se pudieron cargar los centros de costo --` y helper «No pudimos cargar los centros de costo de la empresa. El envío queda bloqueado para no mandar un centro inválido; recargá la pantalla o reintentá.» | bloqueado con ese motivo, distinto del de cero centros | estado `page.tsx:81`, rama `:203-208`; validación `:373-376`; campo `:640-641`, `:659-662` |

Los dos textos de bloqueo son constantes (`NO_ACTIVE_COST_CENTERS_MESSAGE` y
`COST_CENTERS_READ_ERROR_MESSAGE`, `page.tsx:71-75`) que usan el helper, el menú y el `Alert`/toast
del envío: el motivo que se ve antes de enviar es el mismo que devuelve el botón.

No hay default para varios: el efecto ya no deja el primer centro seleccionado cuando hay más de
uno (`page.tsx:218`), que era el default silencioso. Mientras la lectura de la empresa nueva está
en vuelo, `costCentersLoading` (`page.tsx:101-107`) deshabilita el selector (`:623-627`) y bloquea
el envío (`:367-372`); las respuestas de la empresa anterior se descartan (`:199-201`), así que no
se puede mandar el id de otra empresa. Sin empresa elegida el campo tampoco muestra el aviso de cero
centros: pide seleccionar una (`page.tsx:636-637`, `:651-654`).

### 4. El payload

`effectiveCostCenterId` sale sólo del centro resuelto contra la lista (`page.tsx:489-493`): se quitó
el `|| costCenterId` y el nombre inventado «General Corporativo» que ponía `costCenterName`
(`page.tsx:449`, antes del cambio). Si no hay centro resuelto el envío ya está bloqueado antes, así
que el callable no recibe ni un literal de UI ni el id de otra empresa. El guard de `"general"` en
`requestService.ts:224` queda (fuera de este alcance): sigue evitando que un literal viejo llegue
como id.

### 5. Qué NO se tocó

- `CostCenterManager` no se tocó: consume el mismo `getCostCenters`, que conserva el comportamiento
  de `HEAD` (lista sin filtro y `[]` ante error), así que el gestor sigue viendo y reactivando los
  centros retirados.
- `src/services/b2b/requestService.ts`, `src/services/b2b/index.ts` (el barrel es `export *`, así que
  `getCostCentersResult` se importa sin tocarlo), `src/utils/functions.ts` y el backend.

### 6. Cómo se verifica

```bash
grep -rn "General Corporativo\|se resolverá automáticamente" src/
npx eslint src/services/b2b/companyService.ts "src/app/(DashboardLayout)/(B2B)/Solicitudes/nueva/page.tsx"
npx tsc --noEmit
```

- El primer `grep` no debe encontrar nada en los dos archivos de F3. La única coincidencia es
  `src/app/(DashboardLayout)/(B2B)/DocumentosSV/page.tsx:832` («Pool General Corporativo SV»), que
  es el nombre de un pool de documentos, no un centro de costo.
- `eslint` sale con exit 0 y un solo warning, `react-hooks/exhaustive-deps` sobre el efecto de
  suscripción (`page.tsx:189`), que ya existe en `HEAD` (ahí en `:176`): no hay warnings nuevos.
- `tsc --noEmit` sólo informa los `TS2307` de `layout/header/data.tsx` por imports de imágenes y
  svg, previos; los dos archivos de F3 quedan sin errores.

En la pantalla: con una empresa sin centros el aviso aparece en el campo antes de enviar y el botón
responde con el mismo motivo, sin llegar al servidor. Con un solo centro queda seleccionado. Con
varios, el selector arranca vacío y el envío se rechaza hasta elegir uno. Para la rama de lectura
fallida, bloquear la lectura de `costCenters` (por ejemplo, con una sesión sin permiso sobre la
subcolección o sin red) y confirmar que el campo dice «No pudimos cargar los centros de costo…» y
no «no tiene centros»: el envío se bloquea por el primer motivo. Esta pantalla no tiene arnés de
pruebas en el repo (no hay script `test`), así que la verificación es la de arriba más la
inspección manual.

## F4 — Reservas heredadas en `pending_approval`

Fecha: 2026-11-12. Alcance: `frontend_Dashboard` — el panel de aprobación de la reserva en
`/Solicitudes` (`src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx`). Referencia: CF-90 (la
reserva por excepción ya no nace pendiente) y
`Backend/Firebase/docs/FOLLOWUPS/aprobacion-a-cuatro-ojos.md` (la puerta se retiró del alta; el
código que la resuelve quedó desplegado para las reservas que ya estaban pendientes).

### 1. Por qué el panel era código muerto

El bloque que aprueba o rechaza una reserva existía, con sus botones y su aviso
(`page.tsx:1657-1785`, antes del cambio), y su condición nunca fue verdadera:

```tsx
{((activeRequest as any).rawStatus === "pending_approval" ||
  (activeRequest as any).status === "pending_approval") && (
```

| Lado de la condición | Por qué no podía coincidir |
|---|---|
| `rawStatus` | nadie lo escribía. `mappedScheduledRequests` (`page.tsx:264`, antes) mapeaba con `status: mappedStatus` y el espejo `b2bRequests` (`page.tsx:374`, antes) con `status: resolvedStatus`: el campo no existía en ninguna fila, así que `(activeRequest as any).rawStatus` era `undefined` |
| `status` | es el estado **normalizado**. `mapRawTripStatus` convierte `pending_approval` en `requested` (`src/utils/tripStatus.ts:96-97`), así que el literal `"pending_approval"` nunca llegaba a la pantalla |

Con las dos mitades falsas, el `Alert` y los dos botones no se montaban para ninguna reserva: las
que quedaron pendientes antes del cambio de contrato se veían en la tabla como «Solicitada» y no
había manera de aprobarlas ni rechazarlas desde el panel. La única salida era una llamada directa
al backend.

Que el estado crudo sea el criterio no es un detalle de presentación: `pending_approval` es el
único estado desde el que las dos puertas de decisión escriben.
`assertPendingApprovalScheduledTrip` (`Backend/Firebase/functions/src/b2b/scheduledTripStatus.ts:160`)
se exige antes de escribir y otra vez dentro de la transacción, tanto al aprobar
(`approveScheduledTripForCompany.ts:323` y `:347`) como al rechazar
(`rejectScheduledTripForCompany.ts:147` y `:214`). Mostrar el panel en otro estado sólo produciría
un `failed-precondition` del servidor.

### 2. Qué se cambió

**El estado crudo llega al objeto del panel.** Se agregó un tipo local
`B2BServiceRequestWithRawStatus` (`page.tsx:91-106`), `B2BServiceRequest & { rawStatus: string }`,
y los dos mapeos devuelven ese tipo:

| Fuente de la fila | De dónde sale `rawStatus` | Se asigna en |
|---|---|---|
| `scheduledTrips` (`listPlatformScheduledTrips`, `page.tsx:203`, sin filtro de estado) | `effectiveRawStatus = liveTrip?.status \|\| st.status`, el mismo valor que consume `mapRawTripStatus` un renglón antes | `page.tsx:386`, junto a `status: mappedStatus` (`:387`) |
| espejo `b2bRequests` (`subscribeToB2BRequests`) | `r.status` del documento, leído **antes** de reemplazarlo por el normalizado | `page.tsx:402`, junto a `status: resolvedStatus` (`:403`) |
| reserva presente en las dos fuentes | la de `scheduledTrips`: el merge esparce `...sReq` sobre la fila del espejo | `page.tsx:433` |

`rawStatus` se lee en un solo lugar, la condición del panel (`page.tsx:1684`). Todo el resto de la
pantalla —la tabla, `StatusBadge`, el `Stepper` con `getLifecycleStepIndex`, el filtro por estado y
los botones de avance— sigue leyendo `status`, que continúa siendo el normalizado. `src/types/b2b.ts`
no se tocó: el campo es local del panel, así que ningún otro consumidor de `B2BServiceRequest` cambia.

**La condición lee el estado crudo y sólo eso.** `activeRequest.rawStatus === "pending_approval"`
(`page.tsx:1684`). Desaparece la mitad `status` y desaparecen los `as any` del bloque: el campo ya
está en el tipo.

**El texto dejó de prometer la puerta que ya no existe.**

| Elemento | Antes | Ahora |
|---|---|---|
| Severidad del aviso | `info` | `warning` |
| Título | — (el aviso era una sola línea) | «Reserva heredada: quedó en `pending_approval`» |
| Cuerpo | «Esta reserva fue creada por vía de excepción (S6) y requiere aprobación de un administrador diferente al creador (cuatro ojos).» | «Esta reserva se creó antes del cambio de contrato. Las reservas nuevas ya nacen disponibles para el pool y no requieren aprobación; ésta sigue pendiente hasta que alguien la resuelva. El backend rechaza la decisión si la toma quien creó la reserva.» |
| Botones | «Aprobar Reserva (S6)» · «Rechazar Reserva (S6)» | «Aprobar Reserva Heredada» (`page.tsx:1724`) · «Rechazar Reserva Heredada» (`page.tsx:1760`) |

La frase vieja afirmaba un requisito que las reservas nuevas ya no tienen: desde CF-90 nacen
`available` y entran al pool sin aprobación. El texto nuevo dice el hecho —se creó antes del
cambio— y conserva únicamente la restricción que sigue viva para estas filas: `assertFourEyes`
(`approveScheduledTripForCompany.ts:171`) rechaza al creador, así que el administrador no se entera
del `failed-precondition` recién cuando aprieta el botón.

**Los callables no hubo que arreglarlos.** Los botones ya llamaban a los callables desplegados por
`src/utils/functions.ts` —`approveScheduledTripForCompanyCallable` (`:1377`, payload
`{ scheduledTripId }`) y `rejectScheduledTripForCompanyCallable` (`:1401`, payload
`{ scheduledTripId, reason }`)—, el mismo camino que usa `platformAdvanceTrip`. El id se resuelve con
`(activeRequest as any).scheduledTripId || activeRequest.tripId || activeRequest.id`, que para una
fila de `scheduledTrips` es el `scheduledTripId` del backend. Después de decidir, `fetchScheduledTrips`
(`page.tsx:203`) vuelve a leer la reserva y el panel desaparece solo: el estado ya no es
`pending_approval`.

### 3. Qué NO se tocó

- `src/services/b2b/requestService.ts`: sin cambios. No existía ahí ningún envoltorio de
  aprobación y el panel invoca los callables oficiales directo, igual que el avance del viaje; no
  hizo falta agregar uno.
- El backend, `scheduledTripStatus.ts` y las dos guardas: `pending_approval` sigue en el conjunto
  cerrado y las puertas siguen exigiendo ese estado. Este cambio no reactiva la puerta para las
  reservas nuevas.
- El resto del panel: ni la tabla, ni el `Stepper`, ni el filtro por estado, ni los botones de avance
  cambian de fuente de estado.

### 4. Cómo se verifica

```bash
npx eslint "src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx" src/services/b2b/requestService.ts
npx tsc --noEmit
grep -n "rawStatus" "src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx"
grep -rn "requiere aprobación de un administrador" src/
```

- `eslint` sale sin salida y con exit 0: ningún problema nuevo.
- `tsc --noEmit` informa 15 errores, todos `TS2307` en
  `src/app/(DashboardLayout)/layout/header/data.tsx` por imágenes y svg sin declaración de módulo,
  previos al cambio; ninguno en los dos archivos de F4.
- El `grep` de `rawStatus` devuelve el tipo (`page.tsx:105`), las dos asignaciones (`:386`, `:402`) y
  la condición (`:1684`): no hay otro lector del estado crudo.
- El segundo `grep` no encuentra nada: la frase «requiere aprobación de un administrador» ya no está
  en `src/`.

En la pantalla, con una sesión de superAdmin o de `admin` del país: la reserva heredada aparece en la
tabla como «Solicitada» (es su estado normalizado) y, al abrirla, muestra el aviso y los dos botones.
Aprobar la pasa a `available`, la manda al pool y el panel desaparece al refrescar; rechazar pide el
motivo obligatorio y reporta el techo liberado. Una reserva nueva —creada después del cambio, ya en
`available`— nunca muestra el panel. Esta pantalla no tiene arnés de pruebas en el repo (no hay script
`test`), así que la verificación es la de arriba más la inspección manual.
