/**
 * Fija que el precio de una solicitud B2B salga SÓLO de la cotización oficial.
 *
 * Este repo no tiene runner de tests: el gate normal es `tsc` + `eslint`, y eso no
 * atrapa una regresión en lo que la pantalla MUESTRA. El incidente que origina
 * estas comprobaciones fue que el formulario calculaba su propio desglose y lo
 * usaba como respaldo: si `getFareQuote` fallaba, mostraba —y mandaba— un importe
 * que la plataforma no había calculado.
 *
 *     node --test tests/quote-authority-in-panel.test.mjs
 *
 * Es un chequeo sobre el TEXTO FUENTE. No prueba cómo se ve la pantalla; prueba
 * que las decisiones que la hacen honesta siguen en pie.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const form = read("src/app/(DashboardLayout)/(B2B)/Solicitudes/nueva/page.tsx");
const list = read("src/app/(DashboardLayout)/(B2B)/Solicitudes/page.tsx");
const fleet = read("src/app/(DashboardLayout)/(B2B)/Flota/page.tsx");
const companies = read("src/app/(DashboardLayout)/(B2B)/Empresas/page.tsx");
const board = read("src/app/(DashboardLayout)/(B2B)/DashboardB2B/page.tsx");

test("el formulario no cae a su propio desglose para el importe", () => {
  // El respaldo local era una segunda implementación de la fórmula: mostraba un
  // número que el backend no había calculado.
  for (const forbidden of [
    ": tariffBreakdown.finalFare",
    "tariffBreakdown.ratePerKm.toFixed",
    "tariffBreakdown.breakdownSummary",
  ]) {
    assert.equal(
      form.includes(forbidden),
      false,
      `el formulario volvió a usar su desglose local: ${forbidden}`
    );
  }
});

test("sin cotización oficial no se registra la solicitud", () => {
  assert.match(form, /if \(!backendQuote\) \{/, "falta la guarda del submit");
  assert.match(
    form,
    /disabled=\{[\s\S]{0,160}!backendQuote/,
    "el botón de enviar tiene que estar deshabilitado sin cotización"
  );
});

test("las pantallas B2B no afirman tarifas que nadie leyó", () => {
  for (const [name, source] of [
    ["Solicitudes/nueva", form],
    ["Solicitudes", list],
    ["Flota", fleet],
    ["Empresas", companies],
    ["DashboardB2B", board],
  ]) {
    assert.equal(
      /\$0\.(67|90)\/km/.test(source),
      false,
      `${name} volvió a hardcodear una tarifa por kilómetro`
    );
    assert.equal(
      /ratePerKm:\s*0\.67/.test(source),
      false,
      `${name} volvió a inventar una tarifa en la fila`
    );
  }
});

test("la cotización del panel nombra la empresa (CF-98)", () => {
  // Sin `companyId`, el backend cotiza como DIRECTA y muestra la tarifa del país
  // mientras la reserva se cobra con la negociada: dos precios para el mismo viaje.
  assert.match(
    form,
    /getFareQuoteCallable\(\s*companyId \? \{ legs, categoryId, companyId \}/,
    "la cotización tiene que mandar la empresa"
  );
  assert.match(
    form,
    /tariffBreakdown\.estimatedDurationMinutes, companyId\]/,
    "la empresa tiene que estar en las dependencias del efecto: si cambia, se recotiza"
  );
});
