// Optimistic uploads registry persisted to AsyncStorage.
// Stores recently uploaded photos so UI (Gallery/ItemDetail) can show them instantly
// before the DB round-trip/realtime notification arrives. Persisted so they survive restarts.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'PENDING_UPLOADS_V1';
let pendingMap = {}; // { [listId]: [ { file, uri, date, title, itemId } ] }
let loaded = false;

async function load() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) pendingMap = JSON.parse(raw) || {};
  } catch (e) {
    // ignore
    pendingMap = {};
  }
  loaded = true;
}

async function save() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingMap || {}));
  } catch (e) {
    // ignore
  }
}

export async function addPendingUpload(listId, file, uri, date = new Date().toISOString(), title = '', itemId = null) {
  if (!listId) return;
  await load();
  const arr = pendingMap[listId] || [];
  arr.unshift({ file, uri, date, title, itemId });
  pendingMap[listId] = arr;
  await save();
}

export async function getPendingForList(listId) {
  await load();
  return pendingMap[listId] || [];
}

export async function removePendingByFile(listId, file) {
  if (!listId) return;
  await load();
  const arr = pendingMap[listId] || [];
  const filtered = arr.filter(p => p.file !== file);
  if (filtered.length) pendingMap[listId] = filtered; else delete pendingMap[listId];
  await save();
}

export async function clearPending(listId) {
  await load();
  if (!listId) return;
  delete pendingMap[listId];
  await save();
}

export default { addPendingUpload, getPendingForList, removePendingByFile, clearPending };
