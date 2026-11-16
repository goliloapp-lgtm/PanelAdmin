/**
 * T11 — el directorio de Empresas muestra las empresas de los países donde la
 * cuenta puede operar, no las de un `sv` fijo.
 *
 * El defecto medido: la pantalla llamaba `subscribeToB2BCompanies(callback, onError)`
 * y el servicio completaba `countryCode = "sv"`, así que un operador con
 * `countryIds: ["ve"]` leía `countries/sv/b2bCompanies` — una ruta que la regla
 * `hasSupportRead() && isInCountry(countryId)` le deniega.
 *
 *     node --test tests/empresas-multi-pais.test.mjs
 *
 * Como el resto de las suites de este repo, es un chequeo sobre el TEXTO FUENTE:
 * el arnés no compila TS ni renderiza componentes. Lo que se fija es la forma
 * exacta de cada decisión (de dónde salen los países, cuántos snapshots se abren,
 * cómo se fusionan, qué pasa si un país falla y qué país viaja en las escrituras),
 * no la salida de pantalla.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

/** Assert compacto: no imprime el archivo entero cuando el patrón falta. */
const matches = (source, pattern, message) =>
  assert.ok(pattern.test(source), message);

const service = read("src/services/b2b/companyService.ts");
const page = read("src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx");

/** El helper que lee los países del token, aislado de sus vecinos. */
const claims = service.slice(
  service.indexOf("export const getOperatingCountriesFromClaims"),
  service.indexOf("export const subscribeToB2BCompaniesByCountries")
);

/** La lectura multi-país, aislada del wrapper de un solo país. */
const multi = service.slice(
  service.indexOf("export const subscribeToB2BCompaniesByCountries"),
  service.indexOf("export const subscribeToB2BCompanies(")
);

/** El mapeo de filas, aislado de la lectura. */
const mapper = service.slice(
  service.indexOf("const mapCompanySnap"),
  service.indexOf("export const getOperatingCountriesFromClaims")
);

/** La escritura de empresa, aislada del cambio de estado. */
const updater = service.slice(
  service.indexOf("export const updateB2BCompany ="),
  service.indexOf("export const updateB2BCompanyStatus")
);

test("los países salen del claim countryIds del ID token", () => {
  assert.ok(
    claims.includes("getIdTokenResult"),
    "los países tienen que leerse del ID token: es el token que la regla evalúa"
  );
  matches(
    claims,
    /tokenResult\.claims\.countryIds/,
    "el claim que la regla evalúa es `countryIds`"
  );
  assert.equal(
    /["']sv["']/i.test(claims),
    false,
    "el lector de países no puede completar la lista con 'sv': un operador con countryIds ['ve'] no tiene permiso en esa ruta"
  );
  assert.equal(
    service.includes("export const getB2BCompanies"),
    false,
    "el lector con default 'sv' y cero llamadores tiene que retirarse, no quedar como segunda puerta"
  );
  matches(
    page,
    /getOperatingCountriesFromClaims\(\)/,
    "la pantalla tiene que pedir los países a ese helper"
  );
  assert.equal(
    /\bsubscribeToB2BCompanies\b/.test(page),
    false,
    "la pantalla ya no puede usar el lector de un solo país: es el que completaba 'sv'"
  );
  assert.equal(
    /subscribeToB2BCompaniesByCountries\(\s*\[/.test(page),
    false,
    "la pantalla no inventa la lista de países: la recibe del token"
  );
  matches(
    page,
    /if \(operatingCountries\.length === 0\) \{/,
    "una cuenta sin países declarados se trata como caso propio, no como lista vacía"
  );
  matches(
    page,
    /Tu cuenta no declara países donde operar/,
    "falta el mensaje explícito para una cuenta sin países de operación"
  );
});

test("sin países declarados no se consulta ninguna colección", () => {
  const guard = multi.indexOf("normalizedCountries.length === 0");
  const readiness = multi.indexOf("auth.authStateReady()");
  assert.ok(guard > 0, "el servicio tiene que reconocer la lista vacía de países");
  assert.ok(
    readiness > guard,
    "la lista vacía se resuelve antes de tocar Firestore: una consulta sólo se denegaría"
  );
  assert.match(
    multi.slice(guard, readiness),
    /return \(\) => \{\};/,
    "sin países la suscripción no registra ningún onSnapshot"
  );

  const noCountriesBranch = page.indexOf("if (operatingCountries.length === 0) {");
  const subscribeAt = page.indexOf("subscribeToB2BCompaniesByCountries(");
  assert.ok(noCountriesBranch > 0, "la pantalla tiene que separar el caso sin países");
  assert.ok(
    subscribeAt > noCountriesBranch,
    "la suscripción se abre después del caso sin países, no antes"
  );
  assert.match(
    page.slice(noCountriesBranch, subscribeAt),
    /return;/,
    "la rama sin países tiene que terminar sin suscribirse"
  );
  matches(
    page,
    /const emptyMessage = scopeNotice\s*\n\s*\? scopeNotice/,
    "el estado vacío tiene que mostrar el mensaje de la cuenta sin países"
  );
});

test("N países abren N snapshots y se entrega una sola lista fusionada", () => {
  matches(
    multi,
    /normalizedCountries\.forEach\(\(countryCode\) => \{/,
    "se abre una suscripción por país, no una para 'sv'"
  );
  assert.ok(
    multi.indexOf("normalizedCountries.forEach") < multi.indexOf("onSnapshot("),
    "el onSnapshot vive dentro del recorrido de países"
  );
  assert.equal(
    (multi.match(/onSnapshot\(/g) || []).length,
    1,
    "un único onSnapshot por iteración es lo que produce N snapshots para N países"
  );
  matches(
    multi,
    /getCompanyCol\(countryCode\)/,
    "cada snapshot lee `countries/<país>/b2bCompanies`"
  );
  matches(
    multi,
    /mapCompanySnap\(docSnap\.id, docSnap\.data\(\), countryCode\)/,
    "cada fila se mapea con el país de la ruta de la que se leyó"
  );
  assert.ok(
    multi.includes(
      "byCountryAndId.set(`${company.countryId}:${company.id}`, company)"
    ),
    "la de-duplicación usa país + id: dos países pueden tener el mismo id de documento"
  );
  assert.ok(
    multi.includes(
      "callback(sortCompaniesDesc(Array.from(byCountryAndId.values())))"
    ),
    "el orden es global (alta descendente) sobre la lista fusionada, no por país"
  );
  assert.equal(
    (multi.match(/callback\(/g) || []).length,
    1,
    "una sola entrega fusionada: nada de concatenar listas por país"
  );
});

test("cada fila conserva el país del que se leyó", () => {
  matches(
    mapper,
    /countryId: \(countryCode \|\| raw\.countryId \|\| "sv"\)\.toLowerCase\(\)/,
    "el país del path manda: un documento sin `countryId` no puede volver a rotularse 'sv'"
  );
  matches(
    mapper,
    /countryCode\?: string/,
    "el mapeo tiene que aceptar el país del path"
  );
  matches(
    page,
    /c\.countryId\.toUpperCase\(\)/,
    "la fila tiene que mostrar de qué país es: en un directorio multi-país dos empresas pueden llamarse igual"
  );
});

test("un fallo parcial conserva las filas; sólo el fallo total llama onError", () => {
  const totalGuard = multi.indexOf(
    "failedCountries.size === normalizedCountries.length"
  );
  const onErrorAt = multi.indexOf("if (onError) onError(error);");
  assert.ok(totalGuard > 0, "el error total se reconoce con un guard propio");
  assert.ok(
    onErrorAt > totalGuard,
    "onError se llama sólo cuando fallaron TODOS los países"
  );
  matches(
    multi,
    /onPartialError\(\{/,
    "un fallo parcial tiene que salir por un aviso, no por el error total"
  );
  assert.equal(
    /rowsByCountry\.(clear|delete)\(/.test(multi),
    false,
    "un país que falla no puede descartar las filas que otro país ya entregó"
  );

  const failureAt = page.indexOf("(failure) => {");
  assert.ok(failureAt > 0, "la pantalla tiene que recibir el fallo parcial");
  const warningAt = page.indexOf("setCoverageWarning(", failureAt);
  assert.ok(warningAt > failureAt, "el fallo parcial se guarda como aviso");
  const partialHandler = page.slice(failureAt, warningAt);
  assert.equal(
    /setCompanies\(/.test(partialHandler),
    false,
    "el aviso parcial no puede vaciar la lista: justamente conserva las filas leídas"
  );
  assert.equal(
    /setLoadError\(/.test(partialHandler),
    false,
    "el aviso parcial no es el error total: no puede disparar el cartel que vacía el listado"
  );
  matches(
    page,
    /coverageWarning && \(\s*<Alert severity="warning"/,
    "el aviso de cobertura tiene que ser no destructivo (Alert warning, no error)"
  );
});

test("las escrituras usan el país de la fila", () => {
  assert.ok(
    page.includes(
      "updateB2BCompany(selectedCompany.id, data, selectedCompany.countryId)"
    ),
    "editar tiene que escribir en el país de la fila, no en el default del formulario"
  );
  matches(
    updater,
    /const effectiveCountry = \(countryCode \|\| companyData\.countryId \|\| "sv"\)\.toLowerCase\(\);/,
    "el país explícito de la fila manda sobre el `countryId: 'sv'` que arrastra el formulario"
  );
  matches(
    page,
    /const capabilityCountry = \(capCompany\.countryId \|\| ""\)\.trim\(\)\.toLowerCase\(\);[\s\S]{0,800}countryId: capabilityCountry,/,
    "las capacidades se guardan en el país de la fila, sin completarlo con un default"
  );
});

test("el lector de un solo país sigue disponible para las pantallas SV-only", () => {
  matches(
    service,
    /export const subscribeToB2BCompanies = \([\s\S]{0,400}subscribeToB2BCompaniesByCountries\(\[countryCode\], callback, onError\)/,
    "el wrapper de un país tiene que delegar en la lectura multi-país"
  );
  for (const path of [
    "src/app/(DashboardLayout)/(B2B)/DashboardB2B/page.tsx",
    "src/app/(DashboardLayout)/(B2B)/DocumentosSV/page.tsx",
    "src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx",
    "src/app/(DashboardLayout)/(B2B)/Solicitudes/nueva/page.tsx",
  ]) {
    assert.ok(
      read(path).includes("subscribeToB2BCompanies,"),
      `${path} todavía importa el lector de un país: el wrapper no puede desaparecer`
    );
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * Segundo tramo: el DETALLE de una empresa también vive en el país del token.
 *
 * El listado ya lee y fusiona los países del claim, pero al abrir una empresa
 * `getB2BCompanyById(id)` y `updateB2BCompany(id, data)` completaban "sv": una
 * empresa de `countries/ve` no se abría y, al guardar, se escribía en El
 * Salvador. Acá se fija la forma: el país se resuelve recorriendo los países del
 * operador, y Ese país viaja a la lectura, a la escritura, al formulario y a los
 * centros de costo.
 * ─────────────────────────────────────────────────────────────────────────── */

const detail = read("src/app/(DashboardLayout)/(B2B)/Empresas/[id]/page.tsx");
const form = read("src/app/(DashboardLayout)/(B2B)/_components/CompanyForm.tsx");
const costCenterManager = read(
  "src/app/(DashboardLayout)/(B2B)/_components/CostCenterManager.tsx"
);

test("el detalle resuelve la empresa en los países del operador, sin 'sv'", () => {
  matches(
    detail,
    /getOperatingCountriesFromClaims\(\)/,
    "los países del detalle salen del mismo claim `countryIds` que usa el listado"
  );
  matches(
    detail,
    /for \(const countryCode of operatingCountries\) \{/,
    "se prueba cada país del operador, en el orden del claim"
  );
  assert.ok(
    detail.includes("await getB2BCompanyById(companyId, countryCode)"),
    "cada intento lee `countries/{cc}/b2bCompanies/{id}` con el país del recorrido"
  );

  const loopStart = detail.indexOf(
    "for (const countryCode of operatingCountries) {"
  );
  const notFoundGuard = detail.indexOf("if (!resolvedCompany) {");
  assert.ok(loopStart > 0, "falta el recorrido de países");
  assert.ok(
    notFoundGuard > loopStart,
    "el caso «no está en ningún país del operador» se reconoce después de probar todos"
  );
  const loop = detail.slice(loopStart, notFoundGuard);
  assert.match(loop, /if \(data\) \{/, "el primer país que devuelve la empresa gana");
  assert.match(loop, /break;/, "encontrada la empresa no se siguen probando países");

  assert.equal(
    /getB2BCompanyById\(\s*companyId\s*,?\s*\)/.test(detail),
    false,
    "el detalle no puede leer sin país: el servicio completa 'sv'"
  );
  assert.equal(
    /["']sv["']/.test(detail),
    false,
    "el detalle no puede nombrar 'sv': ni como default ni como fallback"
  );
  matches(
    detail,
    /no existe o no está en los países donde operás/,
    "falta el mensaje explícito para una empresa que no está en ningún país del operador"
  );
});

test("la escritura del detalle usa el país resuelto", () => {
  assert.ok(
    detail.includes("await updateB2BCompany(companyId, data, companyCountry)"),
    "el país resuelto tiene que viajar a la escritura"
  );
  assert.equal(
    /updateB2BCompany\(\s*companyId,\s*data\s*\)/.test(detail),
    false,
    "la escritura no puede quedar sin país: el servicio completa 'sv'"
  );
  matches(
    detail,
    /<CostCenterManager[\s\S]{0,80}countryCode=\{companyCountry\}/,
    "los centros de costo se leen y escriben en el país resuelto"
  );
  assert.ok(
    detail.includes("countryId={companyCountry}"),
    "el formulario de edición recibe el país resuelto, no lo adivina"
  );
});

test("el formulario de empresa conserva el país de la empresa", () => {
  assert.equal(
    /countryId:\s*["']sv["']/.test(form),
    false,
    "el formulario volvió a fijar 'sv': editar una empresa de otro país la escribía en El Salvador"
  );
  assert.equal(
    /["']sv["']/.test(form),
    false,
    "el formulario no puede nombrar 'sv' en ningún lado: el país lo resuelve el llamador"
  );
  matches(
    form,
    /const formCountryId = [\s\S]{0,120}initialData\?\.countryId/,
    "el país del formulario sale de la empresa editada"
  );
  matches(
    form,
    /countryId: formCountryId,/,
    "el payload lleva el país de la empresa, no una constante"
  );
  matches(
    form,
    /value=\{formCountryId \?/,
    "el campo de país tiene que mostrar el país real, no «El Salvador (sv)»"
  );
});

test("CostCenterManager lee y escribe en el país de la empresa", () => {
  matches(
    costCenterManager,
    /countryCode: string;/,
    "el país de la empresa tiene que entrar como prop obligatoria"
  );
  assert.ok(
    costCenterManager.includes("getCostCenters(companyId, countryCode)"),
    "la lectura de centros de costo tiene que llevar el país de la empresa"
  );
  assert.ok(
    costCenterManager.includes("getLimitRequests(companyId, countryCode)"),
    "el historial de techos vive bajo el mismo país"
  );
  assert.equal(
    /getCostCenters\(\s*companyId\s*\)/.test(costCenterManager),
    false,
    "sin país, `getCostCenters` lee `countries/sv`"
  );
  matches(
    costCenterManager,
    /createCostCenter\(\s*companyId,\s*\{[\s\S]*?\},\s*countryCode\s*\)/,
    "el alta de centro de costo tiene que escribir en el país de la empresa"
  );

  const updateCall = costCenterManager.slice(
    costCenterManager.indexOf("await updateCostCenter("),
    costCenterManager.indexOf('toast.success("Límite de presupuesto')
  );
  assert.match(
    updateCall,
    /reason: changeReason\.trim\(\)/,
    "el motivo viaja en los datos del centro de costo"
  );
  assert.match(
    updateCall,
    /\},\s*countryCode\s*\)/,
    "el ajuste de techo tiene que escribir en el país de la empresa"
  );
  assert.equal(
    /budgetLimit: parsedLimit,\s*\},\s*changeReason/.test(updateCall),
    false,
    "el motivo no puede volver como cuarto argumento: `updateCostCenter` lo toma como país"
  );

  // PRESERVE: los helpers conservan el país OPCIONAL. `Solicitudes/nueva/page.tsx`
  // (fuera de este tramo) los llama sin país y no puede romperse.
  matches(
    service,
    /export const getCostCenters = async \(\s*companyId: string,\s*countryCode = "sv"\s*\)/,
    "el helper no puede volverse obligatorio: hay pantallas fuera de este tramo que lo llaman sin país"
  );
});

test("la bandeja de solicitudes usa un país del operador, no 'sv'", () => {
  assert.equal(
    /listCostCentreRequestsCallable\(\{\s*countryId:\s*["']/.test(page),
    false,
    "el listado de solicitudes no puede fijar un país literal"
  );
  matches(
    page,
    /listCostCentreRequestsCallable\(\{\s*countryId,/,
    "el callable recibe el país elegido, no un literal"
  );
  matches(
    page,
    /setActiveCountry\(operatingCountries\[0\] \?\? ""\)/,
    "el país de trabajo sale de los países del claim"
  );
  matches(
    page,
    /operatorCountries\.length > 1 &&/,
    "con varios países declarados hace falta un selector: el callable toma UNO solo"
  );
  matches(
    page,
    /const handleRequestsCountryChange = async \(countryId: string\) => \{/,
    "cambiar el país de la bandeja tiene que releer esa ruta"
  );
  assert.equal(
    (page.match(/countryId: activeCountry,/g) || []).length,
    2,
    "aprobar y rechazar tienen que resolver en el país elegido (dos resoluciones)"
  );
  assert.equal(
    /countryId: \((req|selectedReqForReject)\.countryId \|\| "sv"\)/.test(page),
    false,
    "resolver con el default 'sv' es justo el camino equivocado"
  );
});

/* ───────────────────────────────────────────────────────────────────────────
 * Tercer tramo: el superAdmin sin `countryIds` no puede perder el directorio.
 *
 * `countries/{cc}/b2bCompanies` se lee con `isSuperAdmin()` SOLO, sin mirar
 * `countryIds` (firestore.rules). Y `countryIds` puede quedar vacío de verdad:
 * `functions/src/auth/createPlatformUser.ts` lo acuña como `[]`. Antes del
 * tramo anterior esa identidad leía `countries/sv`; después, se quedaba con el
 * cartel «tu cuenta no declara países» y sin una sola consulta. El dueño tiene
 * que ver el catálogo completo; una cuenta común sin países sigue viendo el
 * mensaje.
 * ─────────────────────────────────────────────────────────────────────────── */

test("un superAdmin sin `countryIds` lee el catálogo y no se detiene", () => {
  matches(
    claims,
    /tokenResult\.claims\.superAdmin === true/,
    "el interruptor es el claim `superAdmin`, el mismo que lee el resto de la consola"
  );
  matches(
    claims,
    /getDocs\(collection\(db, "countries"\)\)/,
    "sin `countryIds` el superAdmin tiene que sacar los países del catálogo `countries`"
  );
  assert.equal(
    /if \(!Array\.isArray\(claimedCountries\)\) return \[\];/.test(claims),
    false,
    "volvió el corte temprano: un superAdmin sin `countryIds` no puede quedarse sin directorio"
  );
  const countryGuard = claims.indexOf("if (countries.length > 0) return countries;");
  const superGuard = claims.indexOf("if (!superAdmin) return [];");
  const catalogRead = claims.indexOf('collection(db, "countries")');
  assert.ok(
    countryGuard > 0 && superGuard > countryGuard,
    "el claim `countryIds` manda; el guard de superAdmin viene después"
  );
  assert.ok(
    catalogRead > superGuard,
    "el catálogo se consulta sólo cuando la cuenta no declaró países Y es superAdmin"
  );
  matches(
    detail,
    /getOperatingCountriesFromClaims\(\)/,
    "el detalle tiene que resolver con la misma regla: el mismo helper"
  );
});

test("sin países y sin superAdmin la cuenta sigue viendo el mensaje, no una consulta", () => {
  matches(
    claims,
    /if \(!superAdmin\) return \[\];/,
    "sin el claim `superAdmin` una lista vacía no habilita el catálogo"
  );
  matches(page, /Tu cuenta no declara países donde operar/, "falta el mensaje en el listado");
  matches(detail, /Tu cuenta no declara países donde operar/, "falta el mensaje en el detalle");

  const scopeBranch = detail.indexOf("if (operatingCountries.length === 0) {");
  const firstRead = detail.indexOf("getB2BCompanyById(");
  assert.ok(
    scopeBranch > 0 && firstRead > scopeBranch,
    "el detalle no puede consultar antes de reconocer la cuenta sin países"
  );
});

test("las pantallas de Empresas no completan el país con 'sv'", () => {
  for (const [name, source] of [
    ["el listado", page],
    ["el detalle", detail],
  ]) {
    assert.equal(
      /\|\|\s*["']sv["']/.test(source),
      false,
      `${name} no puede completar un país faltante con 'sv'`
    );
  }
  // La fila siempre trae su país (el mapeo lo toma del path). Si faltara, la
  // escritura de capacidades se avisa: no se inventa una ruta.
  matches(
    page,
    /const capabilityCountry = \(capCompany\.countryId \|\| ""\)\.trim\(\)\.toLowerCase\(\);/,
    "el país de la fila es la única fuente para las capacidades"
  );
  matches(
    page,
    /if \(!capabilityCountry\) \{[\s\S]{0,120}toast\.error\("No se pudo determinar el país de la empresa\."\)/,
    "sin país la escritura de capacidades se avisa en vez de usar un default"
  );
  assert.ok(
    page.includes("countryId: capabilityCountry,"),
    "las capacidades se guardan en el país de la fila"
  );
});
