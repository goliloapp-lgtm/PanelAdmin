/**
 * CF-99 — la consola deja de inventar los hechos de una reserva de plataforma.
 *
 *     node --test tests/proyeccion-con-datos-reales.test.mjs
 *
 * Chequeo sobre el TEXTO FUENTE, como el resto de las suites de este repo: el arnés
 * no renderiza componentes, así que lo que se fija es la forma exacta de cada
 * decisión —de dónde sale cada número y qué se imprime cuando falta—.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

const lista = read("src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx");
const dash = read("src/app/(DashboardLayout)/(B2B)/DashboardB2B/page.tsx");
const contrato = read("src/utils/functions.ts");

test("la consola no reparte el total del viaje a mano", () => {
  assert.ok(
    !/\*\s*0\.7/.test(lista),
    "el reparto del conductor no se calcula con 0.7: el backend publica driverEarning"
  );
  assert.ok(
    !lista.includes("* 0.3"),
    "la comisión no se calcula con 0.3: el backend publica commissionAmount"
  );
  assert.ok(
    !/commissionRate:\s*0\.3/.test(lista),
    "la tasa de comisión no se declara fija: el backend publica commissionRate"
  );
});

test("la consola lee el reparto que la reserva trae congelado", () => {
  assert.match(lista, /driverEarning:\s*\(st as any\)\.driverEarning/);
  assert.match(lista, /commissionAmount:\s*\(st as any\)\.commissionAmount/);
  assert.match(lista, /commissionRate:\s*\(st as any\)\.commissionRate/);
});

test("la distancia no cae a un 15 propio ni inventa el piso", () => {
  assert.ok(
    !/chargedDistance \|\| 15/.test(lista),
    "la distancia facturable no puede caer a 15"
  );
  assert.ok(
    !/distance:\s*Number\(\(st as any\)\.chargedDistance \|\| 15\)/.test(lista),
    "la pierna del viaje no puede caer a 15"
  );
  assert.match(lista, /chargedDistance:\s*\(st as any\)\.chargedDistance/);
});

test("la tarifa y el piso salen de la reserva, no de una tabla", () => {
  assert.match(lista, /ratePerKm:\s*\(st as any\)\.appliedFareRate/);
  assert.match(lista, /baseDistanceKm:\s*\(st as any\)\.billableDistance/);
  assert.match(lista, /minimumDistanceKm:\s*\(st as any\)\.minimumDistance/);
  assert.ok(
    !/minFare:\s*\(st as any\)\.minimumApplied === true/.test(lista),
    "el piso de distancia no puede imprimirse como importe mínimo"
  );
});

test("el piso se imprime como distancia y sin dato cuando falta", () => {
  assert.match(lista, /Piso de distancia/);
  assert.ok(
    !/Mínimo:\{" "\}/.test(lista),
    "la ficha no puede seguir rotulando «Mínimo» un importe"
  );
  assert.match(lista, /piso sin dato/);
});

test("los pasajeros salen de la reserva en las dos pantallas", () => {
  assert.match(
    lista,
    /passengersCount:\s*readPassengerCount\(\(st as any\)\.passengerCount\)/
  );
  assert.match(dash, /passengersCount:\s*st\.passengerCount \?\? UNKNOWN_PASSENGERS/);
  // Control positivo: el hueco sigue existiendo y se marca, no se rellena.
  assert.match(dash, /pax s\/d/);
});

test("el contrato del callable declara los hechos que ahora viajan", () => {
  const row = contrato.slice(
    contrato.indexOf("interface PlatformScheduledTripRow"),
    contrato.indexOf("interface ListPlatformScheduledTripsParams")
  );
  for (const campo of [
    "passengerCount",
    "appliedFareRate",
    "farePrice",
    "chargedDistance",
    "billableDistance",
    "minimumDistance",
    "minimumApplied",
    "distanceUnit",
    "commissionRate",
    "commissionAmount",
    "driverEarning",
  ]) {
    assert.match(
      row,
      new RegExp(`\\b${campo}\\?:`),
      `${campo} falta en PlatformScheduledTripRow`
    );
  }
});
