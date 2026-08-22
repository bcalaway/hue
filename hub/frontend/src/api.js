export async function fetchState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`GET /api/state -> ${res.status}`);
  return res.json();
}

export async function setLightState(site, lightId, on) {
  const res = await fetch(`/api/site/${site}/light/${lightId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  });
  return res.ok;
}

export async function activateScene(site, sceneId) {
  const res = await fetch(`/api/site/${site}/scene/${sceneId}/activate`, { method: "POST" });
  return res.ok;
}

export async function setRoomState(site, groupedLightId, on) {
  const res = await fetch(`/api/site/${site}/grouped-light/${groupedLightId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  });
  return res.ok;
}

export async function fetchAnimations(site) {
  const res = await fetch(`/api/site/${site}/animations`);
  if (!res.ok) throw new Error(`GET /api/site/${site}/animations -> ${res.status}`);
  return res.json();
}

export async function createAnimation(site, payload) {
  const res = await fetch(`/api/site/${site}/animations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function stopAnimation(site, animationId) {
  const res = await fetch(`/api/site/${site}/animations/${animationId}/stop`, { method: "POST" });
  return res.ok;
}

export async function startAnimation(site, animationId) {
  const res = await fetch(`/api/site/${site}/animations/${animationId}/start`, { method: "POST" });
  return res.ok;
}

export async function fetchFavorites(site) {
  const res = await fetch(`/api/site/${site}/favorites`);
  if (!res.ok) throw new Error(`GET /api/site/${site}/favorites -> ${res.status}`);
  return res.json();
}

export async function addFavorite(site, roomId) {
  const res = await fetch(`/api/site/${site}/favorites/${roomId}`, { method: "POST" });
  return res.ok;
}

export async function removeFavorite(site, roomId) {
  const res = await fetch(`/api/site/${site}/favorites/${roomId}`, { method: "DELETE" });
  return res.ok;
}
