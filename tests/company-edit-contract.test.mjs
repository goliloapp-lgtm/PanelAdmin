/**
 * Fija las tres piezas que hacían imposible editar una empresa.
 *
 *     node --test tests/company-edit-contract.test.mjs
 *
 * El incidente: cualquier cambio en el formulario de Empresas devolvía «el centro
 * de costo alcanzó su presupuesto máximo». No era el techo. Eran tres cosas
 * encadenadas:
 *
 *   1. el servicio mandaba `address` al callable, y `updateCompany` solo acepta
 *      `contactAddress`: rechazaba el payload ENTERO por un campo desconocido, así
 *      que no se podía guardar nada, cambiara lo que cambiara;
 *   2. ese rechazo nombra «the balance to the budget ledger», y el traductor de
 *      errores convertía en «techo agotado» cualquier texto con «budget»;
 *   3. al leer, el servicio buscaba `raw.address` en un documento que guarda
 *      `contactAddress`, así que mostraba siempre el default inventado.
 *
 * Es un chequeo sobre el TEXTO FUENTE, como el resto de las suites de este repo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const service = read("src/services/b2b/companyService.ts");
const friendly = read("src/utils/friendlyError.ts");
const payloadBuilder = read("src/services/b2b/companyPayload.ts");
const listPage = read("src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx");

test("la actualización manda contactAddress, que es el campo del contrato", () => {
  assert.match(
    service,
    /\{ contactAddress: companyData\.address\.trim\(\) \}/,
    "el payload de updateCompany tiene que nombrar contactAddress"
  );
  assert.equal(
    /\{ address: companyData\.address\.trim\(\) \}/.test(service),
    false,
    "volvió a mandar `address`, que updateCompany rechaza"
  );
});

test("la lectura toma contactAddress del documento", () => {
  assert.match(
    service,
    /raw\.contactAddress/,
    "el formulario tiene que leer el campo que el backend escribe"
  );
});

test("el traductor de errores no convierte cualquier 'budget' en techo agotado", () => {
  // El rechazo de updateCompany dice «the balance to the budget ledger»: si el
  // filtro vuelve a mirar la palabra suelta, cualquier invalid-argument se reporta
  // como un problema de presupuesto y esconde la causa.
  assert.equal(
    /combined\.includes\("budget"\)/.test(friendly),
    false,
    "el filtro volvió a matchear la palabra suelta 'budget'"
  );
  assert.equal(
    /combined\.includes\("presupuesto"\)/.test(friendly),
    false,
    "el filtro volvió a matchear la palabra suelta 'presupuesto'"
  );
  assert.match(friendly, /raise the ceiling/, "tiene que seguir reconociendo el techo real");
});

test("los llamados de plataforma mandan el país de la empresa", () => {
  // Un administrador que opera más de un país no puede dejar que el servidor
  // adivine: `updateCompanyCapabilities` y `resolveCostCentreRequest` resuelven el
  // alcance con el país del payload, y sin él rechazan con
  // «was called by an operator of several countries».
  const page = read("src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx");

  for (const [name, call] of [
    ["updateCompanyCapabilities", /updateCompanyCapabilitiesCallable\(\{[\s\S]{0,220}?countryId:/],
    ["resolveCostCentreRequest", /resolveCostCentreRequestCallable\(\{[\s\S]{0,220}?countryId:/],
  ]) {
    assert.match(page, call, `${name} tiene que enviar countryId`);
  }
});

test("el estado del formulario sale del maestro, no de una lista escrita a mano", () => {
  // El formulario ofrecía `inactive` mientras el validador sólo admitía dos: el
  // estado se elegía, se enviaba y se descartaba en silencio. Ahora las opciones
  // llegan de `listCompanyStatuses` (CF-97).
  const form = read("src/app/(DashboardLayout)/(B2B)/_components/CompanyForm.tsx");

  assert.match(form, /listCompanyStatusesCallable\(\)/, "tiene que pedir el maestro");
  assert.match(form, /statuses\.map\(/, "las opciones tienen que salir del maestro");
  assert.equal(
    /oneOf\(\["active", "suspended", "inactive"\]\)/.test(form),
    false,
    "volvió a hardcodear el vocabulario del estado"
  );
  assert.equal(
    /<MenuItem value="inactive">/.test(form),
    false,
    "volvió a ofrecer un estado fijo"
  );
});

test("las tarifas por categoría se reenvían al callable", () => {
  // El campo global está deprecado; el que rige es `fareRates`, por categoría.
  assert.match(
    service,
    /fareRates: companyData\.fareRates/,
    "updateB2BCompany tiene que reenviar fareRates"
  );
});

test("la matriz de tarifas se arma con el catálogo, no con una lista fija", () => {
  // Una categoría nueva con `b2bSuitable: true` tiene que aparecer sola, con su
  // tarifa editable por empresa: las filas vienen de `listCompanyRates`, que
  // recorre el catálogo, y se recorren con `map`.
  const form = read("src/app/(DashboardLayout)/(B2B)/_components/CompanyForm.tsx");

  assert.match(form, /listCompanyRatesCallable\(/, "tiene que pedir las tarifas del catálogo");
  assert.match(form, /rateRows\.map\(/, "las filas se recorren, no se enumeran");
  assert.equal(
    /negotiatedFareRate/.test(form),
    false,
    "volvió el campo global deprecado"
  );
  assert.equal(
    /name="minimumBookingLeadMinutes"/.test(form.split("{!isEditing && (")[1] ?? ""),
    false,
    "al editar, la anticipación es un campo que no guarda nada"
  );
});

test("el alta no inventa una tarifa de una sola categoría", () => {
  // Fabricaba `{ suv: 0.67 }` cuando no había tarifa explícita: creaba la empresa
  // con un precio que nadie decidió y una sola categoría.
  assert.equal(
    /suv: negotiatedFareRate/.test(payloadBuilder),
    false,
    "volvió a fabricar la tarifa de SUV"
  );
});

test("la lista no muestra la tarifa global deprecada", () => {
  // El chip decía «Corporativo $0.57/km», el número global que ya no rige. Con
  // tarifas por categoría, ese número podía no tener nada que ver con lo que el
  // cotizador cobra.
  // Se mira el ACCESO a la propiedad, no la palabra: el comentario que explica por
  // qué no se usa la nombra, y eso no es una lectura.
  assert.equal(
    /\.negotiatedFareRate/.test(listPage),
    false,
    "la lista volvió a leer la tarifa global"
  );
  assert.match(
    listPage,
    /por categoría/,
    "el chip tiene que decir que la tarifa es por categoría"
  );
});

test("la lectura de contacto prefiere los campos del contrato", () => {
  // El documento del cliente tenía el valor NUEVO en `contactPhone`,
  // `contactWhatsapp` y `contactEmail`, y el VIEJO en `phone`/`whatsapp`: el panel
  // mostraba el viejo y el correo vacío, como si no hubiera guardado.
  // Sólo el mapeo de EMPRESA: el del viajero tiene su propio default y es otra
  // decisión.
  const mapping = service.slice(
    service.indexOf("const mapCompanySnap"),
    service.indexOf("}) as B2BCompany;")
  );

  assert.match(mapping, /phone: raw\.contactPhone \|\| raw\.phone/, "phone tiene que leer contactPhone primero");
  assert.match(mapping, /whatsapp: raw\.contactWhatsapp/, "whatsapp tiene que leer contactWhatsapp primero");
  assert.match(mapping, /email: raw\.contactEmail/, "email tiene que leer contactEmail");
  for (const invented of ["+503 2200-0000", "+503 7000-0000"]) {
    assert.equal(
      mapping.includes(invented),
      false,
      `volvió a inventar un contacto de empresa: ${invented}`
    );
  }
});

test("el mapeo no inventa condición de pago ni comprobante", () => {
  // Ponía `credit30` cuando el documento no declaraba condición, y la consola
  // pintaba «Crédito 30» para una empresa sin condición: un valor con efecto de
  // facturación que nadie eligió.
  const mapping = service.slice(
    service.indexOf("const mapCompanySnap"),
    service.indexOf("}) as B2BCompany;")
  );

  assert.equal(
    /paymentCondition: raw\.paymentCondition \|\| "credit30"/.test(mapping),
    false,
    "volvió a inventar la condición de pago"
  );
  assert.match(
    mapping,
    /requiresInvoice: raw\.requiresInvoice === true/,
    "el comprobante tiene que salir del documento"
  );
});
