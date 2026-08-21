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
  try {
    const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + id);
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

function writeLocalGallery(index, itemsById) {
  const safeIndex = index.slice(0, MAX_GALLERY_ITEMS);
  const items = Object.values(itemsById).filter((item) => item?.id);

  // Write item payloads first so the index never points at missing data.
  for (const item of items) {
    localStorage.setItem(GALLERY_ITEM_PREFIX + item.id, JSON.stringify(item));
  }

  const keepIds = new Set(safeIndex.map((entry) => entry.id));
  const staleKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(GALLERY_ITEM_PREFIX)) continue;
    const itemId = key.slice(GALLERY_ITEM_PREFIX.length);
    if (!keepIds.has(itemId)) staleKeys.push(key);
  }
  for (const key of staleKeys) localStorage.removeItem(key);

  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(safeIndex));
}

let syncInFlight = null;

async function ensureAuthSession(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  return session ?? null;
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

    let localIndex = [];
    try {
      localIndex = JSON.parse(localStorage.getItem(GALLERY_INDEX_KEY) || "[]");
    } catch {
      localIndex = [];
    }

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

    const merged = new Map();

    for (const entry of localIndex) {
      const item = readLocalItem(entry.id);
      if (item) merged.set(item.id, item);
    }

    for (const row of data || []) {
      const cloudItem = cloudRowToItem(row);
      if (!cloudItem) continue;
      const existing = merged.get(cloudItem.id);
      if (!existing || cloudItem.updatedAt >= existing.updatedAt) {
        merged.set(cloudItem.id, cloudItem);
      }
    }

    const items = [...merged.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_GALLERY_ITEMS);

    const itemsById = {};
    const index = [];

    for (const item of items) {
      itemsById[item.id] = item;
      const entry = validateGalleryIndexEntry({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        gridSize: item.gridSize,
        thumbnail: item.thumbnail,
      });
      if (entry) index.push(entry);
    }

    try {
      writeLocalGallery(index, itemsById);
    } catch (err) {
      console.warn("Could not cache synced gallery locally:", err);
    }
  })();

  try {
    await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export async function fetchGalleryItemFromCloud(id) {
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

    const item = cloudRowToItem(data);
    if (!item) return null;

    localStorage.setItem(GALLERY_ITEM_PREFIX + safeId, JSON.stringify(item));
    return item;
  } catch (err) {
    console.warn("Cloud gallery fetch failed:", err);
    return null;
  }
}
