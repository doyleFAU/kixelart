import {
  GALLERY_INDEX_KEY,
  GALLERY_ITEM_PREFIX,
  MAX_GALLERY_ITEMS,
} from "../config.js";
import { state } from "../state.js";
import { getSupabase } from "./client.js";
import {
  sanitizeGalleryId,
  normalizeGalleryItem,
  validateGalleryIndexEntry,
  parseJsonSafe,
} from "../utils/security.js";
import { countPaintedPixels } from "../utils/pixels.js";

function storagePayload(item) {
  if (!item) return item;
  return {
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    gridSize: item.gridSize,
    pixels: item.pixels,
    palette: item.palette,
    recentColors: item.recentColors,
    currentColor: item.currentColor,
    secondaryColor: item.secondaryColor,
    showGrid: item.showGrid,
    mirrorX: item.mirrorX,
    brushSize: item.brushSize,
  };
}

function isSignedIn() {
  return Boolean(state.authUser);
}

function itemToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    name: item.name,
    grid_size: item.gridSize,
    pixels: item.pixels,
    palette: item.palette,
    recent_colors: item.recentColors,
    current_color: item.currentColor,
    secondary_color: item.secondaryColor,
    show_grid: item.showGrid,
    mirror_x: item.mirrorX,
    brush_size: item.brushSize,
    thumbnail: item.thumbnail || null,
    created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date(item.updatedAt).toISOString(),
  };
}

function readLocalItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return null;
  try {
    const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + safeId);
    if (!raw) return null;
    return normalizeGalleryItem(parseJsonSafe(raw));
  } catch {
    return null;
  }
}

function mapCloudRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    name: row.name,
    gridSize: row.grid_size ?? row.gridSize,
    pixels: row.pixels,
    palette: row.palette,
    recentColors: row.recent_colors ?? row.recentColors,
    currentColor: row.current_color ?? row.currentColor,
    secondaryColor: row.secondary_color ?? row.secondaryColor,
    showGrid: row.show_grid ?? row.showGrid,
    mirrorX: row.mirror_x ?? row.mirrorX,
    brushSize: row.brush_size ?? row.brushSize,
    thumbnail: row.thumbnail,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function cloudRowToItem(row) {
  return normalizeGalleryItem(mapCloudRow(row) ?? row);
}

function cacheGalleryItem(item) {
  if (!item?.id) return;
  const existing = readLocalItem(item.id);
  if (
    existing
    && countPaintedPixels(existing.pixels) > countPaintedPixels(item.pixels)
  ) {
    return;
  }
  localStorage.setItem(
    GALLERY_ITEM_PREFIX + item.id,
    JSON.stringify(storagePayload(item))
  );
}

function readGalleryIndexRaw() {
  try {
    const raw = localStorage.getItem(GALLERY_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendCloudOnlyItems(localIndex, cloudRows) {
  const localIds = new Set(
    localIndex
      .map((entry) => sanitizeGalleryId(entry?.id))
      .filter(Boolean)
  );

  const added = [];
  for (const row of cloudRows || []) {
    const cloudItem = cloudRowToItem(row);
    if (!cloudItem) continue;
    if (localIds.has(cloudItem.id)) continue;
    if (countPaintedPixels(cloudItem.pixels) === 0) continue;

    cacheGalleryItem(cloudItem);
    localIds.add(cloudItem.id);

    const entry = validateGalleryIndexEntry({
      id: cloudItem.id,
      name: cloudItem.name,
      updatedAt: cloudItem.updatedAt,
      gridSize: cloudItem.gridSize,
      thumbnail: cloudItem.thumbnail,
    });
    if (entry) added.push(entry);
  }

  if (!added.length) return localIndex;

  const merged = [...added, ...localIndex]
    .slice(0, MAX_GALLERY_ITEMS);
  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(merged));
  return merged;
}

let syncInFlight = null;

async function ensureAuthSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session ?? null;
  }
  if (session) return session;
  if (state.authUser) return { user: state.authUser };
  return null;
}

export async function waitForGallerySync() {
  await waitForGallerySyncSafe();
}

export async function waitForGallerySyncSafe(timeoutMs = 5000) {
  if (!syncInFlight) return;
  await Promise.race([
    syncInFlight.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function pushGalleryItemToCloud(item) {
  if (!isSignedIn()) return;
  const supabase = await getSupabase();
  if (!supabase || !item) return;

  const userId = state.authUser.id;
  const { error } = await supabase.from("gallery_items").upsert(
    itemToRow(item, userId),
    { onConflict: "user_id,id" }
  );
  if (error) throw error;
}

export async function deleteGalleryItemFromCloud(id) {
  if (!isSignedIn()) return;
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return;

  const supabase = await getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("gallery_items")
    .delete()
    .eq("user_id", state.authUser.id)
    .eq("id", safeId);
  if (error) throw error;
}

export async function syncGalleryWithCloud() {
  if (!isSignedIn()) return;
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const supabase = await getSupabase();
    if (!supabase) return;

    const session = await ensureAuthSession(supabase);
    if (!session) return;

    const userId = session.user.id;
    const localIndex = readGalleryIndexRaw();

    for (const entry of localIndex) {
      const item = readLocalItem(entry.id);
      if (!item) continue;
      const { error } = await supabase.from("gallery_items").upsert(
        itemToRow(item, userId),
        { onConflict: "user_id,id" }
      );
      if (error) console.warn("Cloud upload failed for", entry.id, error.message);
    }

    const { data, error } = await supabase.from("gallery_items")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(MAX_GALLERY_ITEMS);

    if (error) throw error;

    appendCloudOnlyItems(localIndex, data);
  })();

  try {
    await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export async function queryCloudGalleryItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId || !isSignedIn()) return null;

  const supabase = await getSupabase();
  if (!supabase) return null;

  const session = await ensureAuthSession(supabase);
  if (!session) return null;

  try {
    const { data, error } = await supabase
      .from("gallery_items")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("id", safeId)
      .maybeSingle();

    if (error) {
      console.warn("Cloud gallery fetch failed:", error.message);
      return null;
    }
    if (!data) return null;

    return cloudRowToItem(data);
  } catch (err) {
    console.warn("Cloud gallery fetch failed:", err);
    return null;
  }
}

export async function fetchGalleryItemFromCloud(id) {
  const item = await queryCloudGalleryItem(id);
  if (!item) return null;
  cacheGalleryItem(item);
  return item;
}
