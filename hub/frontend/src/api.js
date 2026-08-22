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
