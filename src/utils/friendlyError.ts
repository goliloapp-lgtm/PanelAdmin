/**
 * Convierte cualquier error técnico (Firebase Auth, Cloud Functions HttpsError,
 * Firestore, red o validaciones) en un mensaje claro, amable y en español
 * comprensible para cualquier usuario no técnico.
 */
/**
 * La negativa P4: la reserva no entra en el techo del centro de costo.
 *
 * El servidor la cuenta entera —techo, consumido, retenido y lo que pide la
 * reserva— en inglés y con el vocabulario del dominio. El operador necesita esos
 * cuatro números para decidir qué hacer, así que se leen del texto y se devuelven
 * en una frase: cuánto hay, cuánto se gastó, cuánto queda y cuánto pide este viaje.
 *
 * @param {string} combined El texto del servidor en minúsculas.
 * @return {string | undefined} La frase, o `undefined` si no es esta negativa.
 */
function readCeilingRefusal(combined: string): string | undefined {
  if (!combined.includes("would be occupied against it")) return undefined;

  const number = "([0-9]+(?:\\.[0-9]+)?)";
  const pick = (pattern: string): number | undefined => {
    const match = new RegExp(pattern.replace("%s", number)).exec(combined);
    return match ? Number(match[1]) : undefined;
  };

  const needs = pick("needs %s");
  const ceiling = pick("ceiling is %s");
  const realised = pick("%s is realised") ?? 0;
  const reserved = pick("%s is reserved") ?? 0;
  const money = (value: number): string => `$${value.toFixed(2)}`;

  const head =
    "No se puede registrar esta reserva: supera el techo de consumo del centro " +
    "de costo";

  if (needs === undefined || ceiling === undefined) {
    return `${head}.`;
  }

  const available = ceiling - realised - reserved;
  return (
    `${head}. Techo ${money(ceiling)}, consumido ${money(realised)}, ` +
    `retenido ${money(reserved)} — disponibles ${money(available)} — y esta ` +
    `reserva pide ${money(needs)}. Subí el techo del centro de costo, liberá una ` +
    "reserva o elegí un servicio más económico."
  );
}

export function formatFriendlyError(
  err: unknown,
  fallbackMessage = "No pudimos completar la operación en este momento. Por favor intenta nuevamente."
): string {
  if (!err) return fallbackMessage;

  // Orden de lectura del motivo: `details` (lo que el servidor nombró), después
  // `message`, después `code`. `details` entra en el texto que clasifican los
  // mapeos amables de abajo y, si ninguno aplica, se devuelve tal cual.
  const serverDetail = readServerDetail((err as any)?.details);

  const rawMessage =
    typeof err === "string"
      ? err
      : typeof (err as any)?.message === "string"
      ? (err as any).message
      : "";
  const rawCode =
    typeof (err as any)?.code === "string" ? (err as any).code : "";
  const combined = `${rawCode} ${serverDetail} ${rawMessage}`.toLowerCase();

  // 0. Techo de consumo (P4): la reserva no entra. Va primero porque es la única
  // negativa que trae los cuatro números que el operador necesita para decidir.
  const ceilingRefusal = readCeilingRefusal(combined);
  if (ceilingRefusal !== undefined) return ceilingRefusal;

  // 1. Anticipación mínima de reserva (minimumBookingLeadMinutes)
  if (
    combined.includes("minimumbookingleadminutes") ||
    combined.includes("leaves ") ||
    combined.includes("requires at least")
  ) {
    const reqMatch = rawMessage.match(/requires at least\s+(\d+)/i);
    const reqMinutes = reqMatch ? Number(reqMatch[1]) : 180;
    const hours = Math.round((reqMinutes / 60) * 10) / 10;
    const timeLabel =
      reqMinutes >= 60 && reqMinutes % 60 === 0
        ? `${hours} ${hours === 1 ? "hora" : "horas"}`
        : `${reqMinutes} minutos`;
    return `La hora de salida seleccionada es muy próxima. Las reservas para esta empresa deben programarse con al menos ${timeLabel} de anticipación. Por favor elige una hora más tarde.`;
  }

  // 2. Viajes inmediatos deshabilitados (allowsImmediateTrips)
  if (
    combined.includes("allowsimmediatetrips") ||
    combined.includes("immediate trip") ||
    combined.includes("inmediatos inhabilitados")
  ) {
    return "Esta empresa tiene habilitadas únicamente las reservas programadas. Por favor selecciona una fecha y hora de salida.";
  }

  // 3. Presupuesto / Techo del centro de costo agotado
  // Solo las frases con las que el backend NOMBRA el techo agotado. Antes entraba
  // cualquier mensaje que dijera "budget" o "presupuesto", y el rechazo de
  // `updateCompany` termina con "the balance to the budget ledger": cualquier
  // invalid-argument de ese callable se mostraba como techo agotado.
  if (
    combined.includes("resource-exhausted") ||
    combined.includes("budgetlimit") ||
    combined.includes("raise the ceiling") ||
    combined.includes("techo de consumo")
  ) {
    return "El centro de costo seleccionado ha alcanzado su presupuesto máximo disponible para este periodo.";
  }

  // 4. Capacidad máxima de pasajeros (> 12)
  if (
    combined.includes("12 pasajeros") ||
    combined.includes("12 passengers") ||
    combined.includes("passengercount")
  ) {
    return "Para viajes de más de 12 pasajeros se requiere coordinación directa de flota especial.";
  }

  // 5. Centro de costo requerido o inválido
  if (
    combined.includes("costcentre") ||
    combined.includes("costcenter") ||
    combined.includes("cost centre")
  ) {
    if (combined.includes("cost-centre-not-found") || combined.includes("does not hold")) {
      return `El centro de costo seleccionado no existe en la empresa: ${rawMessage.replace(/Nothing was written\.?/gi, "").trim()}`;
    }
    if (combined.includes("cost-centre-id-required") || (combined.includes("holds") && combined.includes("documents"))) {
      return "La empresa posee múltiples centros de costo. Por favor selecciona uno específico de la lista desplegable.";
    }
    if (combined.includes("window-not-current") || combined.includes("budgetwindowstart")) {
      return `La ventana de facturación del centro de costo no está vigente para esta fecha: ${rawMessage.replace(/Nothing was written\.?/gi, "").trim()}`;
    }
    if (combined.includes("cost-centre-inactive")) {
      return "El centro de costo seleccionado está inactivo o retirado.";
    }
    if (combined.includes("no-cost-centre") || combined.includes("no document")) {
      return "La empresa seleccionada no tiene ningún centro de costo registrado en su expediente corporativo.";
    }
    return `Centro de costo inválido: ${rawMessage.replace(/Nothing was written\.?/gi, "").trim()}`;
  }

  // 6. Viajero corporativo requerido o inactivo
  if (combined.includes("traveller")) {
    return "Por favor selecciona un pasajero corporativo activo de la empresa.";
  }

  // 6b. Flota vehicular y distancia de ruta
  if (combined.includes("no active vehicle") || combined.includes("load fleet first")) {
    return "No hay vehículos activos registrados en la flota de El Salvador para atender este traslado corporativo.";
  }
  if (combined.includes("summed distance") || combined.includes("not above zero") || combined.includes("zero-distance")) {
    return "La distancia total de la ruta debe ser mayor a 0 km. Por favor verifica las coordenadas de origen y destino.";
  }
  if (combined.includes("do not fit in any vehicle")) {
    return "La cantidad de pasajeros seleccionada excede la capacidad de la flota vehicular disponible en El Salvador.";
  }

  // 7. Tarifas y categorías vehiculares (distinguiendo formato/categoría/tasa de alta B2B vs cotización)
  if (
    combined.includes("object keyed by categoryid") ||
    combined.includes('requires "farerates"')
  ) {
    return "El formato de tarifas por categoría (fareRates) es inválido: debe enviarse como un mapa por categoría.";
  }

  const invalidB2BCategoryMatch = rawMessage.match(
    /fareRates\.([^\s]+)\s+is not a b2b-enabled category/i
  );
  if (invalidB2BCategoryMatch || combined.includes("not a b2b-enabled category")) {
    const categoryName = invalidB2BCategoryMatch?.[1];
    return categoryName
      ? `La categoría "${categoryName}" no está habilitada para operación corporativa B2B.`
      : "La categoría seleccionada no está habilitada para operación corporativa B2B.";
  }

  const invalidRateMatch = rawMessage.match(/fareRates\.([^\s]+)\s+is\b/i);
  if (
    combined.includes("not a rate greater than zero") ||
    (combined.includes("farerates.") && combined.includes("greater than zero"))
  ) {
    const categoryName = invalidRateMatch?.[1];
    return categoryName
      ? `La tarifa por km para "${categoryName}" debe ser un número mayor a $0.00.`
      : "La tarifa por km debe ser un número mayor a $0.00.";
  }

  if (
    combined.includes("categoryid") ||
    combined.includes("vehicle category") ||
    combined.includes("farerate")
  ) {
    return "No se pudo calcular la tarifa para la categoría de vehículo seleccionada.";
  }

  // 8. Cancelación no permitida por estado del viaje
  // SÓLO las frases con las que el backend NOMBRA la negativa a cancelar. Antes
  // bastaba un mensaje que dijera «cancel» y trajera el código del error: cualquier
  // `failed-precondition` que nombrara un estado se mostraba como «no es posible
  // cancelar», y el mensaje real —el que dice qué arreglar— se perdía.
  if (
    combined.includes("cannot be cancelled") ||
    combined.includes("cannot be canceled") ||
    combined.includes("already in progress") ||
    combined.includes("already completed") ||
    combined.includes("is cancelled by the trip path") ||
    combined.includes("nothing left to cancel")
  ) {
    return "No es posible cancelar este traslado porque ya se encuentra en curso o ya fue finalizado.";
  }

  // 8b. Compuerta de documentos de membresía y verificación (CF-104 / CF-104.1)
  if (combined.includes("has documents that are not accepted")) {
    const unacceptedMatch = rawMessage.match(
      /has documents that are not accepted:\s*([^.]+)\./i
    );
    const docsList = unacceptedMatch?.[1]?.trim();
    return docsList
      ? `No se puede aprobar al conductor mientras queden documentos sin aceptar: ${docsList}. Revisa y acepta cada documento uno por uno antes de verificar.`
      : "No se puede aprobar al conductor mientras queden documentos sin aceptar. Revisa y acepta cada documento uno por uno.";
  }

  if (combined.includes("missing") && combined.includes("required document")) {
    const missingMatch = rawMessage.match(
      /missing\s+\d+\s+required document\(s\)\s+for\s+[^:]+:\s*([^.]+)\./i
    );
    const docsList = missingMatch?.[1]?.trim();
    return docsList
      ? `Faltan documentos obligatorios aceptados en la membresía del conductor: ${docsList}. Revisa y acepta cada documento antes de aprobar.`
      : "Faltan documentos obligatorios aceptados en la membresía del conductor. Revisa y acepta cada documento antes de aprobar.";
  }

  // 9. Conductor o vehículo no disponible
  if (
    combined.includes("vehicle") ||
    combined.includes("driver") ||
    combined.includes("conductor")
  ) {
    if (
      combined.includes("not available") ||
      combined.includes("already assigned") ||
      combined.includes("eligible")
    ) {
      return "El conductor o vehículo seleccionado no está disponible en este momento. Por favor elige otra unidad.";
    }
  }

  // 10. Errores de inicio de sesión y autenticación
  if (
    combined.includes("auth/invalid-credential") ||
    combined.includes("auth/wrong-password") ||
    combined.includes("auth/user-not-found")
  ) {
    return "El correo electrónico o la contraseña no son correctos. Por favor verifica tus datos.";
  }

  if (combined.includes("unauthenticated") || combined.includes("authenticated caller")) {
    return "Tu sesión ha expirado. Por favor vuelve a iniciar sesión.";
  }

  // 11. Permisos y Doble Validación
  if (
    combined.includes("countryids") ||
    combined.includes("token declares none (countryids)")
  ) {
    return "Tu cuenta de administrador no tiene asignado ningún país de operación ('countryIds'). Solicita a un Super Administrador que configure tus países autorizados.";
  }

  if (combined.includes("does not operate in the country")) {
    return "No tienes autorización para gestionar conductores o membresías fuera de tus países asignados en plataforma.";
  }

  if (
    combined.includes("four eyes") ||
    combined.includes("different administrator must approve") ||
    combined.includes("cuatro ojos")
  ) {
    return "Por política de doble validación (cuatro ojos), esta reserva de plataforma debe ser aprobada por otro administrador diferente a quien la creó.";
  }

  if (
    combined.includes("only the assigned driver") ||
    combined.includes("assigned driver only")
  ) {
    return "Solo el conductor asignado desde la App Driver puede ejecutar esta acción.";
  }

  if (
    combined.includes("only a super-admin may verify") ||
    combined.includes("only a super-admin may approve") ||
    combined.includes("only a super-admin may review")
  ) {
    return "Esta acción requiere permisos de Super Administrador de plataforma. Tu cuenta tiene rol Admin de país pero no el permiso superAdmin necesario.";
  }

  if (
    combined.includes("permission-denied") ||
    combined.includes("insufficient permissions") ||
    combined.includes("[403]")
  ) {
    return "No tienes permisos suficientes para realizar esta acción.";
  }

  // 12. Registro no encontrado
  if (
    (combined.includes("riderequests") || combined.includes("rideRequests")) &&
    (combined.includes("does not exist") || combined.includes("not-found"))
  ) {
    return "El viaje aún no existe en tiempo real (la reserva programada aún debe ser despachada por el conductor desde la App Driver).";
  }

  if (
    combined.includes("not-found") ||
    combined.includes("does not exist") ||
    combined.includes("disappeared") ||
    combined.includes("[404]")
  ) {
    return "No encontramos el registro solicitado o fue modificado recientemente.";
  }

  // 13. Red / Conexión
  if (
    combined.includes("network-request-failed") ||
    combined.includes("failed to fetch") ||
    combined.includes("networkerror") ||
    combined.includes("deadline-exceeded") ||
    combined.includes("unavailable")
  ) {
    return "Hay un problema temporal de conexión a internet. Intenta nuevamente en unos segundos.";
  }

  // El motivo que el servidor adjuntó en `details` no se filtra: es el único
  // texto que nombra la negativa, y limpiarlo o resumirlo lo borraría. Los
  // mapeos amables de arriba ya tuvieron su oportunidad (techo, centro de
  // costo, permisos con texto deliberado, sesión, red); acá llega lo que
  // ninguno conoce y se muestra tal cual lo escribió el servidor.
  if (serverDetail) return serverDetail;

  const cleanedSpanish = rawMessage
    .replace(/\[4\d\d\]|\[5\d\d\]/g, "")
    .replace(/\((?:CF|LO|D)-\d+(?:\.\d+)?\)/gi, "")
    .replace(/Nothing was written\.?/gi, "")
    .replace(/Firebase:\s*Error\s*\([^)]+\)\.?/gi, "")
    .trim();

  const looksTechnicalOrEnglish =
    /requires|must be|nothing was written|httpserror|firebase|invalid-argument|failed-precondition|already-exists|undefined|null|uid|callable|collection|document|\[4\d\d\]|\[5\d\d\]/i.test(
      rawMessage
    );

  if (!looksTechnicalOrEnglish && cleanedSpanish.length > 4) {
    return cleanedSpanish;
  }

  if (rawMessage && rawMessage.length > 5) {
    const compact = rawMessage
      .replace(/Nothing was written\.?/gi, "")
      .replace(/Firebase:\s*Error\s*\([^)]+\)\.?/gi, "")
      .trim();
    return `${fallbackMessage}: ${compact}`;
  }

  return fallbackMessage;
}

/**
 * Texto accionable que un callable adjuntó en `HttpsError.details`.
 *
 * El backend nombra el motivo ahí y no en `message`: `no-cost-centre`,
 * `ceiling-reached`, `realise-exceeds-reserved`, o el campo que el rechazo
 * nombra (`invalid-argument`). Antes este helper sólo miraba `message` y `code`,
 * así que ese motivo se perdía y la pantalla mostraba un texto genérico.
 *
 * Acepta la cadena tal cual o el objeto que traiga el servidor, y devuelve el
 * primer valor de texto útil: `message` (el texto largo que nombra el documento
 * y el campo), `reason` (el código de la negativa) o `field` (el campo
 * rechazado). No traduce ni resume: el texto del servidor se usa tal cual.
 */
function readServerDetail(details: unknown): string {
  if (typeof details === "string") return details.trim();
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "";
  }
  const record = details as Record<string, unknown>;
  for (const key of ["message", "reason", "field"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}
