"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

/**
 * Identifies the current user in PostHog once a wallet address is available.
 * Resets identity when the address becomes undefined (logout).
 */
export function usePostHogIdentify(
  address: string | undefined,
  properties?: Record<string, string>,
) {
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (address && identified.current !== address) {
      posthog.identify(address, properties);
      identified.current = address;
    } else if (!address && identified.current) {
      posthog.reset();
      identified.current = null;
    }
  }, [address, properties]);
}
