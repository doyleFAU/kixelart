import {
  GALLERY_INDEX_KEY,
  GALLERY_ITEM_PREFIX,
  MAX_GALLERY_ITEMS,
} from "../config.js";
import { state } from "../state.js";
import { getSupabase } from "./client.js";
import {
  sanitizeGalleryId,
  validateGalleryItem,
  validateGalleryIndexEntry,
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

function rowToItem(row) {
  return validateGalleryItem({
    id: row.id,
    name: row.name,
    gridSize: row.grid_size,
    pixels: row.pixels,
    palette: row.palette,
    recentColors: row.recent_colors,
    currentColor: row.current_color,
    secondaryColor: row.secondary_color,
    showGrid: row.show_grid,
    mirrorX: row.mirror_x,
    brushSize: row.brush_size,
    thumbnail: row.thumbnail,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  });
}

function readLocalIndex() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_INDEX_KEY) || "[]");
  } catch {
    return [];
  }
}

function readLocalItem(id) {
  try {
    const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalGallery(index, itemsById) {
  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(index.slice(0, MAX_GALLERY_ITEMS)));
  for (const [id, item] of Object.entries(itemsById)) {
    localStorage.setItem(GALLERY_ITEM_PREFIX + id, JSON.stringify(item));
  }
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

  const supabase = await getSupabase();
  if (!supabase) return;

  const userId = state.authUser.id;

  const localIndex = readLocalIndex();
  for (const entry of localIndex) {
    const item = validateGalleryItem(readLocalItem(entry.id));
    if (item) {
      await supabase.from("gallery_items").upsert(
        itemToRow(item, userId),
        { onConflict: "user_id,id" }
      );
    }
  }

  const { data, error } = await supabase.from("gallery_items")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_GALLERY_ITEMS);

  if (error) throw error;

  const itemsById = {};
  const index = [];

  for (const row of data || []) {
    const item = rowToItem(row);
    if (!item) continue;
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

  writeLocalGallery(index, itemsById);
}

export async function fetchGalleryItemFromCloud(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId || !isSignedIn()) return null;

  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .eq("user_id", state.authUser.id)
    .eq("id", safeId)
    .maybeSingle();

  if (error || !data) return null;

  const item = rowToItem(data);
  if (!item) return null;

  localStorage.setItem(GALLERY_ITEM_PREFIX + safeId, JSON.stringify(item));
  return item;
}
