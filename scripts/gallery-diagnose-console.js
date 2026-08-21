// Paste in browser DevTools console on kixelart.vercel.app to diagnose gallery state.
(() => {
  const INDEX = "kixelart-gallery-index";
  const PREFIX = "kixelart-gallery-";
  let index = [];
  try { index = JSON.parse(localStorage.getItem(INDEX) || "[]"); } catch {}
  if (!Array.isArray(index)) index = [];

  const rows = index.map((entry) => {
    const id = entry?.id;
    const raw = id ? localStorage.getItem(PREFIX + id) : null;
    let painted = 0;
    let parseOk = false;
    if (raw) {
      try {
        const data = JSON.parse(raw);
        parseOk = !!data?.pixels;
        const flat = (data.pixels || []).flat?.() || [];
        painted = flat.filter(Boolean).length;
      } catch {}
    }
    return {
      id,
      name: entry?.name,
      hasPayload: !!raw,
      parseOk,
      paintedPixels: painted,
    };
  });

  const orphans = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const id = key.slice(PREFIX.length);
    if (!index.some((e) => e.id === id)) orphans.push(id);
  }

  console.table(rows);
  console.log("Index entries:", rows.length);
  console.log("Missing payloads:", rows.filter((r) => !r.hasPayload).length);
  console.log("Zero-pixel payloads:", rows.filter((r) => r.hasPayload && r.paintedPixels === 0).length);
  console.log("Orphan payload keys (not in index):", orphans);
  console.log("Signed in UI:", document.getElementById("auth-status")?.textContent || "(no auth bar)");
})();
