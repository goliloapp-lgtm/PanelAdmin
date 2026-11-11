/**
 * Realtime Database Trip Status Feed Service for SuperAdmin Dashboard.
 *
 * Listens to `tripStatusFeed` and `rideRequests/{tripId}` directly via WebSocket.
 * No polling, no local overrides.
 */

import {
  ref,
  onValue,
  query,
  orderByChild,
  limitToLast,
  Unsubscribe,
} from "firebase/database";
import { rtdb } from "@/utils/firebase";
import { TripStatusFeedEntry } from "@/utils/tripStatus";

export type TripStatusFeedMap = Record<string, TripStatusFeedEntry>;

/**
 * Subscribes to the RTDB `tripStatusFeed` node (limited to last 300 active/updated trips).
 */
export function subscribeToTripStatusFeed(
  onUpdate: (feedMap: TripStatusFeedMap) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const feedRef = ref(rtdb, "tripStatusFeed");

  return onValue(
    feedRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, TripStatusFeedEntry>;
        onUpdate(val || {});
      } else {
        onUpdate({});
      }
    },
    (err) => {
      console.warn("[subscribeToTripStatusFeed] RTDB read error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribes to a single ride in `rideRequests/{rideId}` for deep telemetry / driver details.
 */
export function subscribeToRideRequest(
  rideId: string,
  onUpdate: (rideData: Record<string, any> | null) => void
): Unsubscribe {
  const rideRef = ref(rtdb, `rideRequests/${rideId}`);
  return onValue(
    rideRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.val());
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn(`[subscribeToRideRequest] Error on ${rideId}:`, err);
    }
  );
}
