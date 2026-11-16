/**
 * T9 (S4) — la consola de plataforma deja de inventar categoría, pasajeros y tarifa.
 *
 *     node --test tests/reservation-categories-console.test.mjs
 *
 * Chequeo sobre el TEXTO FUENTE, como el resto de las suites de este repo: el arnés
 * no renderiza componentes, así que lo que se fija es la forma exacta de cada
 * decisión (de dónde salen las categorías, qué viaja como `categoryId`, qué se
 * imprime cuando falta la cotización).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

const nueva = read("src/app/(DashboardLayout)/(B2B)/Solicitudes/nueva/page.tsx");
const lista = read("src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx");
const dash = read("src/app/(DashboardLayout)/(B2B)/DashboardB2B/page.tsx");
const service = read("src/services/b2b/requestService.ts");

/** El bloque del alta programada, aislado del alta inmediata. */
const scheduledBranch = service.slice(
  service.indexOf("if (!data.isImmediate) {"),
  service.indexOf("} else {", service.indexOf("if (!data.isImmediate) {"))
);
const immediateBranch = service.slice(
  service.indexOf("} else {", service.indexOf("if (!data.isImmediate) {")),
  service.indexOf("notifyRequestSubscribers();")
);

test("el selector se arma con las filas del callable, no con una tabla", () => {
  assert.match(nueva, /listScheduledTripCategoriesCallable\(\{\s*passengerCount: passengersCount\s*\}\)/);
  assert.match(nueva, /assignableCategories\.map\(/);
  assert.ok(!/getAllowedCategoriesForPassengers/.test(nueva), "la tabla fija no puede seguir en el formulario");
  assert.ok(!/setVehicleCategory\("microbus"\)/.test(nueva), "ya no se fuerza microbús");
  assert.ok(!/byCategory\.suv/.test(dash), "el gráfico no puede tener tres cubetas fijas");
});

test("el id elegido viaja como categoryId, y solo por el alta programada", () => {
  assert.match(service, /const requestedCategoryId =\s*\n?\s*typeof data\.vehicleCategory === "string" && data\.vehicleCategory\.trim\(\) !== ""/);
  assert.match(scheduledBranch, /categoryId: requestedCategoryId,/);
  assert.ok(!/categoryId: requestedCategoryId/.test(immediateBranch), "el alta inmediata no toma la categoría por esta puerta");
});

test("no se puede enviar la categoría de otra cantidad de pasajeros", () => {
  assert.match(nueva, /categoriesLoadedForCount === passengersCount/);
  assert.match(nueva, /if \(!categoriesReadyForCurrentCount \|\| !effectiveCategoryId\) \{/);
  const submit = nueva.slice(nueva.lastIndexOf('type="submit"'));
  assert.ok(/!categoriesReadyForCurrentCount \|\|/.test(submit), "el submit tiene que estar deshabilitado mientras la lista no corresponda");
  assert.ok(/!effectiveCategoryId \|\|/.test(submit), "sin categoría elegida no hay submit");
  assert.match(nueva, /Cargando categorías…/);
});

test("el techo mostrado es maximumPassengers de la categoría, o ninguno", () => {
  assert.match(
    nueva,
    /typeof category\.maximumPassengers === "number"\s*\n?\s*\? ` \(hasta \$\{category\.maximumPassengers\} pax\)`\s*\n?\s*: ""/
  );
});

test("ningún lector colapsa la categoría a suv ni consulta elegibilidad con otra", () => {
  assert.match(lista, /vehicleCategory: st\.categoryId as VehicleCategory/);
  assert.match(dash, /vehicleCategory: st\.categoryId as B2BVehicle\["category"\]/);
  assert.match(lista, /categoryId: activeCategoryId,/);
  assert.ok(!/rawCat\.includes\("pickup"\)/.test(dash), "el colapso por rótulo no puede volver");
});

test("ningún lector imprime NaN como si fuera un conteo", () => {
  // Cada interpolación de un conteo tiene que venir detrás de su propio Number.isFinite:
  // dentro de un ternario o de un `&&`. El sentinela es Number.NaN y `${NaN}` imprime "NaN".
  const guarded = (text, expr) => {
    const out = [];
    const needle = "$" + "{" + expr + "}";
    let at = text.indexOf(needle);
    while (at !== -1) {
      out.push(/Number\.isFinite\([^)]*\b/.test(text.slice(Math.max(0, at - 160), at)));
      at = text.indexOf(needle, at + 1);
    }
    return out;
  };
  for (const [name, text] of [["lista", lista], ["dash", dash]]) {
    const checks = guarded(text, "req.passengersCount");
    assert.ok(checks.length >= 1, `${name}: no se encontró el rótulo del conteo`);
    assert.ok(checks.every(Boolean), `${name}: hay una interpolación de req.passengersCount sin Number.isFinite`);
  }
  assert.match(
    lista,
    /Number\.isFinite\(activeRequest\.passengersCount\)\s*\n\s*\? activeRequest\.passengersCount\s*\n\s*: "s\/d"/,
    "el detalle no interpola el conteo a secas"
  );
  assert.match(lista, /Number\.isFinite\(sReq\.passengersCount\)\s*\n?\s*\? sReq\.passengersCount\s*\n?\s*: list\[existingIdx\]\.passengersCount/);
});

test("la tarifa que se imprime es la de la reserva, o se dice que falta", () => {
  assert.ok(!/0\.67/.test(lista) && !/13\.56/.test(lista), "no quedan tarifas fijas en el lector");
  assert.match(lista, /: "pendiente de cotización"\}/);
});

test("más de cuatro pasajeros ya no promete una categoría automática", () => {
  // El aviso prometía «asigna automáticamente Microbús Corporativo»; ahora quien
  // elige la categoría es el operador sobre el conjunto del callable (S4).
  assert.ok(!/asigna automáticamente/i.test(nueva), "ninguna pantalla promete la asignación automática");
  assert.ok(!/automatically assigns/i.test(nueva), "tampoco la variante en inglés");
  assert.ok(!/Microbús Corporativo/.test(nueva), "el rótulo de la tabla no puede volver como promesa");
  assert.ok(!/passengersCount > 4\b/.test(nueva), "el aviso por «más de 4» no vuelve");
  assert.ok(!/more than 4\)/.test(nueva), "ni la variante en inglés del aviso");
  // El único techo que queda es el de capacidad real de la flota.
  assert.match(nueva, /passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY/);
});

test("el resumen nombra la categoría elegida, no la fila de respaldo de la tabla", () => {
  // `calculateB2BTariff` cae en la fila del SUV para cualquier id que no conozca:
  // su rótulo y su mínimo no pueden describir una reserva `van`.
  assert.ok(!/tariffBreakdown\.rule/.test(nueva), "el rótulo del resumen no sale de la tabla");
  assert.ok(!/tariffBreakdown\.minFare/.test(nueva), "el mínimo local no puede viajar al alta");
  assert.match(
    nueva,
    /assignableCategories\.find\(\s*\(row\) => row\.categoryId === effectiveCategoryId\s*\)/
  );
  assert.match(nueva, /label=\{selectedCategoryLabel\}/);
  // Las líneas de dinero salen de la cotización, o dicen que falta.
  assert.match(nueva, /minFare: Number\(\s*\(\s*backendQuote\.minimumDistance \* backendQuote\.appliedFareRate\s*\)\.toFixed\(2\)\s*\)/);
  assert.match(nueva, /baseDistanceKm: backendQuote\.minimumDistance,/);
  assert.match(nueva, /: "pendiente de cotización"/);
});
