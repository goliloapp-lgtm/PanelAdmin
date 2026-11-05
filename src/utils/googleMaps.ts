/**
 * Google Maps Integration Service - El Salvador (Lilo Dashboard Admin)
 * Manejo centralizado de API Script Loader, DirectionsService y Geocoding.
 */

export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "AIzaSyBaihhE0x9C1PJrJ1BNZnxUoAH2jKmkmjk";

export const DEFAULT_SV_CENTER = {
  lat: 13.6929,
  lng: -89.2182, // San Salvador
};

let googleScriptLoadingPromise: Promise<typeof google> | null = null;

export function loadGoogleMapsScript(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps cannot be loaded on server side"));
  }

  if (window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }

  if (googleScriptLoadingPromise) {
    return googleScriptLoadingPromise;
  }

  googleScriptLoadingPromise = new Promise<typeof google>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google) resolve(window.google);
        else reject(new Error("Google Maps loaded but window.google is undefined"));
      });
      existingScript.addEventListener("error", (e) => reject(e));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry&language=es&region=SV`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps loaded but window.google.maps is undefined"));
      }
    };

    script.onerror = (err) => {
      googleScriptLoadingPromise = null;
      reject(new Error(`Error al cargar el script de Google Maps: ${err}`));
    };

    document.head.appendChild(script);
  });

  return googleScriptLoadingPromise;
}

export interface RoutePointCoord {
  lat: number;
  lng: number;
  address?: string;
}

export interface RouteCalculationResult {
  success: boolean;
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  legs: Array<{
    distanceKm: number;
    durationMinutes: number;
    startAddress?: string;
    endAddress?: string;
  }>;
  directionsResult: google.maps.DirectionsResult | null;
  error?: string;
}

/**
 * Calcula la ruta vial real en El Salvador con Google Maps DirectionsService
 */
export async function calculateGoogleRoute(
  origin: RoutePointCoord | string,
  destination: RoutePointCoord | string,
  waypoints: Array<RoutePointCoord | string> = [],
  roundTrip: boolean = false
): Promise<RouteCalculationResult> {
  const g = await loadGoogleMapsScript();
  const directionsService = new g.maps.DirectionsService();

  const toLocation = (pt: RoutePointCoord | string): google.maps.LatLngLiteral | string => {
    if (typeof pt === "string") return pt;
    return { lat: pt.lat, lng: pt.lng };
  };

  const formattedWaypoints: google.maps.DirectionsWaypoint[] = waypoints.map((w) => ({
    location: toLocation(w),
    stopover: true,
  }));

  const originLocation = toLocation(origin);
  const destLocation = toLocation(destination);

  try {
    const response = await directionsService.route({
      origin: originLocation,
      destination: destLocation,
      waypoints: formattedWaypoints,
      travelMode: g.maps.TravelMode.DRIVING,
      unitSystem: g.maps.UnitSystem.METRIC,
      optimizeWaypoints: false,
    });

    if (!response || !response.routes || response.routes.length === 0) {
      throw new Error("No se encontró una ruta vial para las coordenadas especificadas");
    }

    const route = response.routes[0];
    let totalMeters = 0;
    let totalSeconds = 0;
    const computedLegs: RouteCalculationResult["legs"] = [];

    for (const leg of route.legs) {
      const legMeters = leg.distance?.value || 0;
      const legSecs = leg.duration?.value || 0;
      totalMeters += legMeters;
      totalSeconds += legSecs;

      computedLegs.push({
        distanceKm: Number((legMeters / 1000).toFixed(1)),
        durationMinutes: Math.max(1, Math.round(legSecs / 60)),
        startAddress: leg.start_address,
        endAddress: leg.end_address,
      });
    }

    let finalDistanceKm = Number((totalMeters / 1000).toFixed(1));
    let finalDurationMinutes = Math.max(5, Math.round(totalSeconds / 60));

    if (roundTrip) {
      finalDistanceKm = Number((finalDistanceKm * 2).toFixed(1));
      finalDurationMinutes = Math.round(finalDurationMinutes * 2);
    }

    return {
      success: true,
      distanceKm: finalDistanceKm,
      durationMinutes: finalDurationMinutes,
      distanceText: `${finalDistanceKm.toFixed(1)} km`,
      durationText: `~${finalDurationMinutes} min`,
      legs: computedLegs,
      directionsResult: response,
    };
  } catch (err: any) {
    console.warn("[calculateGoogleRoute] Error DirectionsService:", err?.message || err);
    return {
      success: false,
      distanceKm: 0,
      durationMinutes: 0,
      distanceText: "0 km",
      durationText: "0 min",
      legs: [],
      directionsResult: null,
      error: err?.message || "No se pudo calcular la ruta vial",
    };
  }
}
