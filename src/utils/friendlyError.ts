/**
 * Convierte cualquier error técnico (Firebase Auth, Cloud Functions HttpsError,
 * Firestore, red o validaciones) en un mensaje claro, amable y en español
 * comprensible para cualquier usuario no técnico.
 */
export function formatFriendlyError(
  err: unknown,
  fallbackMessage = "No pudimos completar la operación en este momento. Por favor intenta nuevamente."
): string {
  if (!err) return fallbackMessage;

  const rawMessage =
    typeof err === "string"
      ? err
      : typeof (err as any)?.message === "string"
      ? (err as any).message
      : "";
  const rawCode =
    typeof (err as any)?.code === "string" ? (err as any).code : "";
  const combined = `${rawCode} ${rawMessage}`.toLowerCase();

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
  if (
    combined.includes("resource-exhausted") ||
    combined.includes("budget") ||
    combined.includes("ceiling") ||
    combined.includes("techo de consumo") ||
    combined.includes("presupuesto")
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
    return "Por favor selecciona un centro de costo válido para continuar.";
  }

  // 6. Viajero corporativo requerido o inactivo
  if (combined.includes("traveller")) {
    return "Por favor selecciona un pasajero corporativo activo de la empresa.";
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
  if (
    (combined.includes("cancel") || combined.includes("cancelar")) &&
    (combined.includes("already") ||
      combined.includes("status") ||
      combined.includes("in_progress") ||
      combined.includes("completed") ||
      combined.includes("failed-precondition"))
  ) {
    return "No es posible cancelar este traslado porque ya se encuentra en curso o ya fue finalizado.";
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
      combined.includes("eligible") ||
      combined.includes("failed-precondition")
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

  // 11. Permisos
  if (
    combined.includes("permission-denied") ||
    combined.includes("insufficient permissions") ||
    combined.includes("[403]")
  ) {
    return "No tienes permisos suficientes para realizar esta acción.";
  }

  // 12. Registro no encontrado
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

  return fallbackMessage;
}
