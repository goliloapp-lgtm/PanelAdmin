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
