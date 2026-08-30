import { useCallback, useState } from 'react';

/** Tracks measured height of the bottom dock (composer + accessory rows). */
export function useChatDockHeight(initial = 72) {
  const [dockHeight, setDockHeight] = useState(initial);

  const onDockLayout = useCallback((event) => {
    const next = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (next > 0) {
      setDockHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    }
  }, []);

  return { dockHeight, onDockLayout };
}
