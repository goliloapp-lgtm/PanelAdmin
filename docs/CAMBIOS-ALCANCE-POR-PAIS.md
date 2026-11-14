# Cambios de alcance por pais y errores honestos (2026-11-14)

Bitacora de los cambios que el equipo de backend hizo en este repositorio por pedido expreso del
mantenedor, mientras se corrige un incidente de produccion. **El deploy sigue siendo del equipo de
frontend**: `admin.liloapp.com` no se publica desde este repo.

## El incidente

Un admin de pais creo una empresa y la pantalla Empresas mostro **"0 empresas registradas"**. No habia
ningun error visible: Firestore respondia `permission-denied` sobre `countries/{cc}/b2bCompanies` y el
servicio convertia ese rechazo en un arreglo vacio, indistinguible de "todavia no hay empresas". El toast
de error existia pero expiraba.

## Que se cambio

### 1. Un rechazo de lectura deja de ser una lista vacia

- `src/services/b2b/companyService.ts` — `subscribeToB2BCompanies` ya no llama `callback([])` en el
  manejador de error del `onSnapshot`. Sigue avisando por `onError` y por `console.warn`, pero no
  inventa un dataset vacio.
- `src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx` — estado `loadError` persistente, renderizado
  como `Alert severity="error"` arriba de la tabla. Mientras esta activo:
  - las tarjetas de metrica muestran `—` en lugar de `0` o `$0.00 USD`,
  - el estado vacio dice "No se pudo cargar el listado de empresas." y no ofrece "Crear Primera
    Empresa",
  - el banner se limpia con **cualquier** snapshot entregado, incluido uno vacio: un snapshot
    entregado prueba que la lectura funciona. Retirarlo solo cuando hay documentos dejaria una
    coleccion legitimamente vacia mostrando "no se pudo cargar" para siempre despues de un error
    transitorio.

Lo que ve el usuario ante un rechazo ahora: el mensaje real ("No tienes permisos suficientes para
realizar esta accion.") de forma persistente, en vez de un cero creible.

### 2. El primer test del repo

`tests/empresas-read-error-honesty.test.mjs` fija esas tres promesas sobre el texto fuente, sin
dependencias:

```bash
node --test tests/empresas-read-error-honesty.test.mjs
```

No prueba el render (no hay jsdom ni testing-library aca), pero si que las tres decisiones que hacen
honesta la pantalla sigan en pie.

## Como verificarlo

Este repo no tiene runner de tests; el gate es:

```bash
npx tsc --noEmit
npx eslint "src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx" src/services/b2b/companyService.ts
```

Ambos en exit 0.

Prueba manual: entrar con un usuario cuyo claim `countryIds` no incluya el pais que la pantalla consulta.
Debe aparecer el banner rojo persistente y `—` en las metricas. Con un usuario con el pais correcto, la
tabla carga como siempre.

## Pendiente, en el repo de backend

El pais sigue **hardcodeado en `sv`** en decenas de lugares de `companyService.ts` y `fleetService.ts`, y
el formulario de alta lo fija en `CompanyForm.tsx:132`. Esa parte viene con el selector de pais, que
necesita que el alcance por pais este resuelto en toda la pantalla y no solo en el alta. No se toco en
este cambio a proposito, para no dejar media pantalla en un pais y media en otro.

## Contexto del backend que ya esta desplegado

- La lectura de `countries/{cc}/b2bCompanies` esta acotada al claim `countryIds`, que sale de las
  `countryMemberships` activas del usuario. Un admin con un solo pais opera solo ese pais.
- El alta de empresa resuelve el pais desde ese mismo claim: con un solo pais lo impone, con varios exige
  `countryId` en el payload.
