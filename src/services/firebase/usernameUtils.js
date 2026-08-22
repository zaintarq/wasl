export function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

export function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return /^[a-z0-9_]{3,20}$/.test(u);
}
