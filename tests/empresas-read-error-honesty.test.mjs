/**
 * Fija las tres promesas de la pantalla Empresas ante un fallo de lectura.
 *
 * Este repo no tiene runner de tests: el gate normal es `tsc` + `eslint`, y eso
 * no atrapa una regresion en lo que la pantalla MUESTRA. El incidente que
 * origino estas comprobaciones fue justamente ese: Firestore respondia
 * `permission-denied`, el servicio lo convertia en un arreglo vacio y la
 * pantalla afirmaba "0 empresas registradas" con estado de exito.
 *
 * Se ejecuta sin dependencias:
 *
 *     node --test tests/empresas-read-error-honesty.test.mjs
 *
 * Es un chequeo sobre el TEXTO FUENTE, no sobre el render: no puede probar como
 * se ve la pantalla, pero si que las tres decisiones que la hacen honesta siguen
 * en pie. Si alguien las cambia, esto falla y obliga a discutirlo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const service = readFileSync(
  resolve(ROOT, "src/services/b2b/companyService.ts"),
  "utf8"
);
const page = readFileSync(
  resolve(ROOT, "src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx"),
  "utf8"
);

/** El bloque de `subscribeToB2BCompanies`, aislado de sus vecinos. */
const subscription = service.slice(
  service.indexOf("export const subscribeToB2BCompanies"),
  service.indexOf("export const getB2BCompanyById")
);

test("un rechazo de lectura no se entrega como dataset vacio", () => {
  assert.ok(
    !/callback\(\s*\[\s*\]\s*\)/.test(subscription),
    "el manejador de error no puede llamar callback([]): es lo que convirtio un permission-denied en '0 empresas'"
  );
  assert.ok(
    /if \(onError\) onError\(error\);/.test(subscription),
    "el error tiene que seguir llegando a onError"
  );
});

test("cualquier snapshot entregado retira el aviso, tambien uno vacio", () => {
  assert.ok(
    /setLoadError\(null\);/.test(page),
    "el aviso tiene que retirarse en algun punto"
  );
  assert.ok(
    !/if \(data\.length > 0\) setLoadError\(null\);/.test(page),
    "retirar el aviso solo cuando hay documentos deja una coleccion legitimamente vacia mostrando 'no se pudo cargar' para siempre"
  );
});

test("una lectura denegada no afirma que no hay empresas", () => {
  assert.ok(
    /const metricValue = \(value: string \| number\) => \(loadError \? "—" : value\);/.test(
      page
    ),
    "las metricas no pueden mostrar 0 cuando la lectura fallo"
  );
  assert.ok(
    /!search && !loadError &&/.test(page),
    "el llamado a crear la primera empresa no puede mostrarse cuando la lectura fallo"
  );
  assert.ok(
    /No se pudo cargar el listado de empresas\./.test(page),
    "el estado vacio tiene que decir que no se pudo cargar"
  );
});
