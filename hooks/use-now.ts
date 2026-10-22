"use client";

import * as React from "react";

/** Re-renders periodically so relative timestamps stay current. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
