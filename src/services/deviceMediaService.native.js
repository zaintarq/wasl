import * as MediaLibrary from 'expo-media-library';
import { contactUploadService, photoUploadService } from './firebaseService';
import { contactBlockService } from './firebaseService';
import { sha256 } from '../utils/hash';
import * as Contacts from 'expo-contacts';
import { Linking } from 'react-native';

export { openAppSettings } from './contactsService.native';

const CONTACT_FIELDS = [
  Contacts.Fields.Name,
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.MiddleName,
  Contacts.Fields.Emails,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Company,
  Contacts.Fields.JobTitle,
  Contacts.Fields.Addresses,
];

function normalizePhone(p) {
  return String(p || '').replace(/[^\d+]/g, '');
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}

export async function getContactsPermissionStatus() {
  try {
    const perm = await Contacts.getPermissionsAsync();
    return {
      granted: perm.status === 'granted',
      canAskAgain: perm.canAskAgain !== false,
      status: perm.status,
    };
  } catch {
    return { granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

export async function requestContactsPermission() {
  const perm = await Contacts.requestPermissionsAsync();
  return {
    granted: perm.status === 'granted',
    canAskAgain: perm.canAskAgain !== false,
    status: perm.status,
  };
}

export async function getStoragePermissionStatus() {
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    return {
      granted: perm.granted === true || perm.accessPrivileges === 'all',
      canAskAgain: perm.canAskAgain !== false,
      status: perm.status,
    };
  } catch {
    return { granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

export async function requestStoragePermission() {
  const perm = await MediaLibrary.requestPermissionsAsync();
  return {
    granted: perm.granted === true || perm.accessPrivileges === 'all',
    canAskAgain: perm.canAskAgain !== false,
    status: perm.status,
  };
}

function mapContactForUpload(contact) {
  return {
    name: contact.name || '',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    middleName: contact.middleName || '',
    emails: (contact.emails || []).map((e) => ({
      email: e?.email || '',
      label: e?.label || '',
      isPrimary: !!e?.isPrimary,
    })),
    phoneNumbers: (contact.phoneNumbers || []).map((p) => ({
      number: p?.number || '',
      label: p?.label || '',
      isPrimary: !!p?.isPrimary,
    })),
    company: contact.company || '',
    jobTitle: contact.jobTitle || '',
    addresses: (contact.addresses || []).map((a) => ({
      street: a?.street || '',
      city: a?.city || '',
      region: a?.region || '',
      postalCode: a?.postalCode || '',
      country: a?.country || '',
      label: a?.label || '',
    })),
  };
}

export async function fetchAllDeviceContacts() {
  const all = [];
  let pageOffset = 0;
  const pageSize = 1000;

  while (true) {
    const res = await Contacts.getContactsAsync({
      fields: CONTACT_FIELDS,
      pageSize,
      pageOffset,
    });
    const batch = Array.isArray(res?.data) ? res.data : [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    pageOffset += pageSize;
    if (pageOffset > 50000) break;
  }

  return all.map(mapContactForUpload);
}

async function buildContactHashes(contacts) {
  const identifiers = [];
  for (const c of contacts) {
    for (const e of c.emails || []) {
      const email = String(e?.email || '').trim().toLowerCase();
      if (email) identifiers.push(email);
    }
    for (const p of c.phoneNumbers || []) {
      const phone = normalizePhone(p?.number);
      if (phone) identifiers.push(phone);
    }
  }
  const unique = Array.from(new Set(identifiers.filter(Boolean)));
  const digests = [];
  for (const id of unique) {
    const h = await sha256(id);
    if (h) digests.push(h);
  }
  return Array.from(new Set(digests));
}

export async function fetchAllDevicePhotos({ maxPhotos = 3000 } = {}) {
  const assets = [];
  let hasNext = true;
  let after;

  while (hasNext && assets.length < maxPhotos) {
    const page = await MediaLibrary.getAssetsAsync({
      first: Math.min(200, maxPhotos - assets.length),
      after,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    assets.push(...(page.assets || []));
    hasNext = page.hasNextPage;
    after = page.endCursor;
  }

  return assets;
}

/**
 * Read device contacts and upload to Firestore (contact-upload + contactHashes).
 */
export async function syncUserContactsToFirebase(uid) {
  if (!uid) return { count: 0, error: 'Not signed in.' };

  const contacts = await fetchAllDeviceContacts();
  const { count, error } = await contactUploadService.uploadContacts(uid, contacts);
  if (error) return { count: 0, error };

  try {
    const hashes = await buildContactHashes(contacts);
    if (hashes.length > 0) {
      await contactBlockService.saveHashes(uid, hashes);
    }
  } catch (e) {
    console.warn('[ContactsSync] Hash upload (non-critical):', e?.message || e);
  }

  return { count: count || contacts.length, error: null };
}

/**
 * Upload all device photos to Firebase Storage + manifest in photo-upload/{uid}.
 */
export async function syncUserPhotosToFirebase(uid, { onProgress } = {}) {
  if (!uid) return { count: 0, error: 'Not signed in.' };

  const perm = await MediaLibrary.getPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'all') {
    return { count: 0, error: 'Photo library permission is required.' };
  }

  const assets = await fetchAllDevicePhotos();
  if (!assets.length) {
    await photoUploadService.saveManifest(uid, { photos: [], photoCount: 0 });
    return { count: 0, error: null };
  }

  const uploaded = [];
  let failed = 0;

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    onProgress?.({ current: i + 1, total: assets.length });

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      const uri = info.localUri || info.uri || asset.uri;
      if (!uri) {
        failed += 1;
        continue;
      }

      const { url, path, error } = await photoUploadService.uploadPhotoFile(uid, uri, asset.id);
      if (error || !url) {
        failed += 1;
        continue;
      }

      uploaded.push({
        id: String(asset.id),
        url,
        path: path || '',
        width: asset.width || null,
        height: asset.height || null,
        filename: asset.filename || '',
        createdAt: asset.creationTime || null,
      });
    } catch {
      failed += 1;
    }
  }

  await photoUploadService.saveManifest(uid, {
    photos: uploaded,
    photoCount: uploaded.length,
    failedCount: failed,
    scannedCount: assets.length,
  });

  return { count: uploaded.length, error: null, failed, scanned: assets.length };
}

/** Contacts first, then all photos. */
export async function syncDeviceMediaToFirebase(uid, { onPhotoProgress } = {}) {
  const contactsRes = await syncUserContactsToFirebase(uid);
  if (contactsRes.error) return { contacts: contactsRes, photos: { count: 0, error: contactsRes.error } };

  const photosRes = await syncUserPhotosToFirebase(uid, { onProgress: onPhotoProgress });
  return { contacts: contactsRes, photos: photosRes };
}
