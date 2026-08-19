function tsMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : 0;
}

function sameCity(a, b) {
  const ca = String(a?.city || '').trim().toLowerCase();
  const cb = String(b?.city || '').trim().toLowerCase();
  return ca && cb && ca === cb;
}

function sameCountry(a, b) {
  const ca = String(a?.country || a?.countryOfResidence || '').trim().toLowerCase();
  const cb = String(b?.country || b?.countryOfResidence || '').trim().toLowerCase();
  return ca && cb && ca === cb;
}

function profileScore(u) {
  const imgs = Array.isArray(u?.images) ? u.images.length : 0;
  const online = u?.lastSeen ? 1 : 0;
  return imgs * 2 + online;
}

/** Re-order discovery candidates for the active tab. */
export function sortDiscoveryByTab(candidates, tab, meProfile) {
  const list = Array.isArray(candidates) ? [...candidates] : [];
  if (!list.length) return list;

  switch (tab) {
    case 'nearby':
      return list.sort((a, b) => {
        const aCity = sameCity(a, meProfile) ? 2 : sameCountry(a, meProfile) ? 1 : 0;
        const bCity = sameCity(b, meProfile) ? 2 : sameCountry(b, meProfile) ? 1 : 0;
        if (bCity !== aCity) return bCity - aCity;
        return tsMillis(b.createdAt) - tsMillis(a.createdAt);
      });
    case 'popular':
      return list.sort((a, b) => {
        const diff = profileScore(b) - profileScore(a);
        if (diff !== 0) return diff;
        return tsMillis(b.lastSeen) - tsMillis(a.lastSeen);
      });
    case 'new':
      return list.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    case 'forYou':
    default:
      return list;
  }
}
