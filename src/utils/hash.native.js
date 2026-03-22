import * as Crypto from 'expo-crypto';

export async function sha256(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}





