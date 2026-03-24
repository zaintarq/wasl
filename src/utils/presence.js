/**
 * Presence helpers: derive "Online" vs "Last online today / N days ago" from `lastSeen`.
 * Peers should heartbeat `lastSeen` while the app is foregrounded (see PresenceHeartbeat).
 */

/** Considered online if last heartbeat was within this window. */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export function toPresenceDate(lastSeen) {
  if (!lastSeen) return null;
  try {
    if (lastSeen instanceof Date) return Number.isNaN(lastSeen.getTime()) ? null : lastSeen;
    if (typeof lastSeen?.toDate === 'function') {
      const d = lastSeen.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof lastSeen?.toMillis === 'function') {
      const d = new Date(lastSeen.toMillis());
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof lastSeen === 'number') {
      const d = new Date(lastSeen);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

export function isUserOnline(lastSeen) {
  const d = toPresenceDate(lastSeen);
  if (!d) return false;
  return Date.now() - d.getTime() <= ONLINE_THRESHOLD_MS;
}

/**
 * @returns {{ kind: 'online', label: string } | { kind: 'away', label: string } | null}
 */
export function getPresenceDisplay(lastSeen) {
  const d = toPresenceDate(lastSeen);
  if (!d) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs <= ONLINE_THRESHOLD_MS) {
    return { kind: 'online', label: 'Online' };
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startThat) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return { kind: 'away', label: 'Last online today' };
  }
  if (diffDays === 1) {
    return { kind: 'away', label: 'Last online 1 day ago' };
  }
  if (diffDays >= 2 && diffDays <= 60) {
    return { kind: 'away', label: `Last online ${diffDays} days ago` };
  }

  return {
    kind: 'away',
    label: `Last online ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined })}`,
  };
}

/** One line for headers / list rows (e.g. chat subtitle). */
export function getPresenceLine(lastSeen, { fallback = '' } = {}) {
  const p = getPresenceDisplay(lastSeen);
  if (p) return p.label;
  return fallback || '';
}
