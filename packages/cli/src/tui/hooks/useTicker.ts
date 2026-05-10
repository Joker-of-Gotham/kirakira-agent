import { useEffect, useState } from "react";

export function useTicker(enabled: boolean, intervalMs = 120): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      setTick((value) => (value + 1) % 1000000);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs]);

  return tick;
}
