import { state } from "../state.js";
import { getSupabase, isCloudEnabled } from "./client.js";
import { syncGalleryWithCloud } from "./gallery-sync.js";
import { renderGallery } from "../storage/gallery.js";

function updateAuthUI() {
  const bar = document.getElementById("auth-bar");
  const status = document.getElementById("auth-status");
  const signIn = document.getElementById("btn-sign-in");
  const signOut = document.getElementById("btn-sign-out");

  if (!bar) return;

  if (!isCloudEnabled()) {
    bar.hidden = false;
    status.textContent = "Cloud sync unavailable — Supabase keys not loaded. Redeploy on Vercel after adding env vars.";
    signIn.hidden = true;
    signOut.hidden = true;
    return;
  }

  bar.hidden = false;
  const user = state.authUser;

  if (user) {
    const label = user.email || user.user_metadata?.user_name || "Signed in";
    status.textContent = `Cloud sync on · ${label}`;
    signIn.hidden = true;
    signOut.hidden = false;
  } else {
    status.textContent = "Sign in to sync My Art across devices";
    signIn.hidden = false;
    signOut.hidden = true;
  }
}

export async function signInWithGitHub() {
  const supabase = await getSupabase();
  if (!supabase) return;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin },
  });
  if (error) alert(error.message);
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) alert(error.message);
  state.authUser = null;
  updateAuthUI();
  renderGallery();
}

async function onSession(session) {
  state.authUser = session?.user ?? null;
  updateAuthUI();

  if (session?.user) {
    try {
      await syncGalleryWithCloud();
      renderGallery();
    } catch {
      alert("Could not sync your art from the cloud. Your local saves are still available.");
    }
  }
}

export async function initAuth() {
  updateAuthUI();

  const supabase = await getSupabase();
  if (!supabase) return;

  document.getElementById("btn-sign-in")?.addEventListener("click", signInWithGitHub);
  document.getElementById("btn-sign-out")?.addEventListener("click", signOut);

  const { data: { session } } = await supabase.auth.getSession();
  await onSession(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    onSession(session);
  });
}

export function isSignedIn() {
  return Boolean(state.authUser);
}
