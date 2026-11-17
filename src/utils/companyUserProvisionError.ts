/**
 * CF-103: el alta del administrador de una empresa dice en qué paso falló.
 *
 * `createCompanyUser` dejó de devolver un `internal` indistinguible: cada paso que
 * puede fallar prefija su código —`INV-1` la guarda de conductor, `INV-2` la cuenta,
 * `INV-3` el correo de bienvenida, `INV-4` la transacción— y ese código viaja en el
 * mensaje. Esta consola da de alta el **primer** administrador, y hasta acá cualquier
 * fallo del servidor se veía igual.
 *
 * EL MENSAJE DEL SERVIDOR NO SE MUESTRA. El `failed-precondition` de la guarda de
 * conductor lleva el correo COMPLETO y el uid de la persona, y el `internal` lleva
 * redacción interna en inglés: por eso se interceptan acá y no en el traductor
 * genérico. El mensaje sólo se lee para distinguir esa guarda y extraer `INV-n`.
 *
 * LO QUE ESTA PANTALLA NO MAPEA, Y POR QUÉ. El alta de una empresa entra por
 * `createCompany`, donde `already-exists` significa que el NIT ya tiene empresa
 * (`functions/src/b2b/createCompany.ts:757`) e `invalid-argument` es un dato de la
 * empresa, no de la invitación. Traducirlos con los textos de CF-103 —«Ese correo ya
 * tiene una cuenta», «Revisa los datos de la invitación»— mentiría sobre la causa:
 * esos códigos, y cualquier otro, siguen por `formatFriendlyError`.
 *
 * @see docs/CONTRATO_FRONTEND.md CF-103
 */

/** Un texto fijo de pantalla y, si el fallo fue de un paso, el código que lo nombra. */
export interface CompanyUserProvisionFailure {
  /** Texto fijo por código. Nunca contiene el mensaje del servidor. */
  message: string;
  /** `INV-n` cuando el fallo ocurrió dentro de un paso; se muestra en el texto. */
  stepCode?: string;
}

const INV_CODE = /INV-[1-5]/;

/**
 * Lee una propiedad de texto de un valor que puede no ser un objeto.
 *
 * @param {unknown} value El error recibido, de forma y origen desconocidos.
 * @param {string} key La propiedad a leer.
 * @return {string} El texto, o la cadena vacía si no está o no es texto.
 */
function readText(value: unknown, key: string): string {
  if (value === null || typeof value !== "object") return "";
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : "";
}

/**
 * Traduce el fallo del alta del administrador al texto fijo de CF-103.
 *
 * Devuelve `undefined` para todo lo que no está en la tabla —incluido el `internal`
 * sin código, que en esta pantalla no viene de los cinco pasos— para que el llamador
 * use su traductor de siempre. Esta función no inventa un texto para lo que no
 * conoce.
 *
 * @param {unknown} error El rechazo del callable, tal como llegó.
 * @return {CompanyUserProvisionFailure | undefined} El texto fijo, o `undefined`.
 */
export function describeCompanyUserProvisionFailure(
  error: unknown
): CompanyUserProvisionFailure | undefined {
  const code = readText(error, "code").toLowerCase();
  // `message` y `details` son las dos mitades donde puede viajar el código del paso:
  // el SDK de Functions pone el mensaje del servidor en `message`, y el `details` del
  // `HttpsError` viaja aparte. Se leen los dos y no se muestra ninguno.
  const raw = `${readText(error, "message")} ${readText(error, "details")}`;
  const stepCode = INV_CODE.exec(raw)?.[0];

  if (code.includes("internal") && stepCode !== undefined) {
    return {
      message: `El alta falló en el paso ${stepCode} de 5. Cita ese código a soporte.`,
      stepCode,
    };
  }

  // La guarda de conductor es el único `failed-precondition` que escribe «conductor»
  // en su mensaje, y su prueba lo fija (`functions/tests/createCompanyUser.test.js`).
  // Hoy `createCompany` no la alcanza; se intercepta igual para que el correo y el
  // uid no viajen a la pantalla si el alta del administrador pasa por el callable.
  if (code.includes("failed-precondition") && raw.toLowerCase().includes("conductor")) {
    return {
      message:
        "Ese correo pertenece a una cuenta de conductor, y un conductor no es usuario de empresa.",
    };
  }

  return undefined;
}
