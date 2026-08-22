import { useCallback, useEffect, useState } from "react";
import {
  activateScene,
  addFavorite,
  createAnimation,
  fetchAnimations,
  fetchFavorites,
  fetchState,
  removeFavorite,
  setLightState,
  setRoomState,
  startAnimation,
  stopAnimation,
} from "./api.js";
import RoomCard from "./components/RoomCard.jsx";
import AutomationsList from "./components/AutomationsList.jsx";

const SITE_LABELS = { nyc: "NYC", rambles: "Rambles" };

function siteLabel(key) {
  return SITE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// Favorites first, then rooms with lights before empty ones -- an explicit
// favorite outranks the "hide empty rooms at the bottom" heuristic (a
// favorited-but-currently-empty room still belongs at the top; the
// favorite is a strong signal, emptiness is just a passive tiebreaker).
// Array.prototype.sort is stable per spec, so rooms tied on both keys keep
// whatever order the bridge/hub returned them in.
function sortRooms(rooms, favoriteRoomIds) {
  return [...rooms].sort((a, b) => {
    const aFav = favoriteRoomIds.has(a.id) ? 0 : 1;
    const bFav = favoriteRoomIds.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    const aEmpty = a.lights.length === 0 ? 1 : 0;
    const bEmpty = b.lights.length === 0 ? 1 : 0;
    return aEmpty - bEmpty;
  });
}

// Patches one light's fields wherever it appears (a room's list, or
// unassigned) across every site -- used for the optimistic on/off toggle
// below, keyed only by light id since ids are unique bridge-wide.
function patchLight(sites, site, lightId, patch) {
  const data = sites[site];
  const applyTo = (lights) => lights.map((light) => (light.id === lightId ? { ...light, ...patch } : light));
  return {
    ...sites,
    [site]: {
      ...data,
      rooms: data.rooms.map((room) => ({ ...room, lights: applyTo(room.lights) })),
      unassigned_lights: applyTo(data.unassigned_lights),
    },
  };
}

// Same idea but for every light in one room at once, used by the room-level
// on/off toggle. Returns both the patched sites state and the prior
// on-states so a failed request can restore exactly what was on before,
// not just flip everything back on.
function patchRoomLights(sites, site, roomId, on) {
  const data = sites[site];
  const room = data.rooms.find((r) => r.id === roomId);
  const priorStates = new Map(room.lights.map((light) => [light.id, light.on]));
  const nextSites = {
    ...sites,
    [site]: {
      ...data,
      rooms: data.rooms.map((r) => (r.id === roomId ? { ...r, lights: r.lights.map((l) => ({ ...l, on })) } : r)),
    },
  };
  return { nextSites, priorStates };
}

export default function App() {
  const [sites, setSites] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [animations, setAnimations] = useState([]);
  const [favoriteRoomIds, setFavoriteRoomIds] = useState(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchState()
      .then((data) => {
        setSites(data.sites);
        const keys = Object.keys(data.sites);
        setSelectedSite(keys.find((key) => data.sites[key].available) || keys[0]);
      })
      .catch(() => setError("Failed to load state."));
  }, []);

  // Polls for live state -- without this, an animation flipping scenes (or
  // Hue's own automations doing anything) never shows up here until a
  // manual page reload, since the initial fetch above only ever runs once.
  // Only updates `sites`, not `selectedSite` -- the site dropdown and each
  // room's expand/collapse state (local to RoomCard, keyed by room id) are
  // left alone so a poll landing mid-interaction doesn't reset anything.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchState()
        .then((data) => setSites(data.sites))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const reloadAnimations = useCallback((site) => {
    if (!site) return Promise.resolve();
    return fetchAnimations(site)
      .then(setAnimations)
      .catch(() => setAnimations([]));
  }, []);

  useEffect(() => {
    reloadAnimations(selectedSite);
    if (!selectedSite) return;
    fetchFavorites(selectedSite)
      .then((data) => setFavoriteRoomIds(new Set(data.room_ids)))
      .catch(() => setFavoriteRoomIds(new Set()));
  }, [selectedSite, reloadAnimations]);

  const handleToggleLight = useCallback(
    (light) => {
      if (!selectedSite) return;
      const nextOn = !light.on;
      // Flips immediately rather than waiting on a round trip to the site's
      // NUC agent (and from there the bridge) -- reverts below if the
      // bridge actually rejects it, which is rare but not impossible (a
      // stale light id, the bridge itself unreachable).
      setSites((prev) => patchLight(prev, selectedSite, light.id, { on: nextOn }));
      setLightState(selectedSite, light.id, nextOn).then((ok) => {
        if (!ok) setSites((prev) => patchLight(prev, selectedSite, light.id, { on: light.on }));
      });
    },
    [selectedSite],
  );

  const handleActivateScene = useCallback(
    (scene) => {
      if (!selectedSite) return;
      // Fire-and-forget: this page has no polling loop yet to reflect the
      // bridge's own status.active flag flipping a moment later, so there's
      // nothing useful to optimistically update here beyond sending the
      // request.
      activateScene(selectedSite, scene.id);
    },
    [selectedSite],
  );

  const handleToggleRoom = useCallback(
    (room) => {
      if (!selectedSite) return;
      // The circle is a switch: any light on -> this click turns the whole
      // room off; all off -> it turns the whole room on.
      const nextOn = !room.lights.some((light) => light.on);
      let priorStates;
      setSites((prev) => {
        const { nextSites, priorStates: prior } = patchRoomLights(prev, selectedSite, room.id, nextOn);
        priorStates = prior;
        return nextSites;
      });
      setRoomState(selectedSite, room.grouped_light_id, nextOn).then((ok) => {
        if (ok) return;
        setSites((prev) => {
          const data = prev[selectedSite];
          return {
            ...prev,
            [selectedSite]: {
              ...data,
              rooms: data.rooms.map((r) =>
                r.id === room.id ? { ...r, lights: r.lights.map((l) => ({ ...l, on: priorStates.get(l.id) })) } : r,
              ),
            },
          };
        });
      });
    },
    [selectedSite],
  );

  const handleToggleFavorite = useCallback(
    (room) => {
      if (!selectedSite) return;
      const wasFavorite = favoriteRoomIds.has(room.id);
      // Optimistic, same pattern as everything else on this page -- reverts
      // if the request fails.
      setFavoriteRoomIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(room.id);
        else next.add(room.id);
        return next;
      });
      const request = wasFavorite ? removeFavorite(selectedSite, room.id) : addFavorite(selectedSite, room.id);
      request.then((ok) => {
        if (ok) return;
        setFavoriteRoomIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(room.id);
          else next.delete(room.id);
          return next;
        });
      });
    },
    [selectedSite, favoriteRoomIds],
  );

  const handleCreateAnimation = useCallback(
    (payload) => {
      if (!selectedSite) return Promise.resolve();
      return createAnimation(selectedSite, payload).then(() => reloadAnimations(selectedSite));
    },
    [selectedSite, reloadAnimations],
  );

  const handleStopAnimation = useCallback(
    (animationId) => {
      if (!selectedSite) return;
      stopAnimation(selectedSite, animationId).then(() => reloadAnimations(selectedSite));
    },
    [selectedSite, reloadAnimations],
  );

  const handleStartAnimation = useCallback(
    (animationId) => {
      if (!selectedSite) return;
      startAnimation(selectedSite, animationId).then(() => reloadAnimations(selectedSite));
    },
    [selectedSite, reloadAnimations],
  );

  if (error) {
    return (
      <div className="page">
        <p className="unavailable">{error}</p>
      </div>
    );
  }

  if (!sites || !selectedSite) {
    return (
      <div className="page">
        <p>Loading…</p>
      </div>
    );
  }

  const data = sites[selectedSite];

  return (
    <div className="page">
      <a className="home-link" href="https://billandjessie.com">
        ← billandjessie.com
      </a>
      <header>
        <h1>Hue</h1>
        <select value={selectedSite} onChange={(event) => setSelectedSite(event.target.value)}>
          {Object.keys(sites).map((key) => (
            <option key={key} value={key}>
              {siteLabel(key)}
            </option>
          ))}
        </select>
      </header>

      {!data.available && <p className="unavailable">Agent unreachable — no live data.</p>}

      {data.available && (
        <>
          {sortRooms(data.rooms, favoriteRoomIds).map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              animations={animations}
              isFavorite={favoriteRoomIds.has(room.id)}
              onToggleFavorite={() => handleToggleFavorite(room)}
              onToggleLight={handleToggleLight}
              onActivateScene={handleActivateScene}
              onToggleRoom={() => handleToggleRoom(room)}
              onCreateAnimation={handleCreateAnimation}
              onStopAnimation={handleStopAnimation}
              onStartAnimation={handleStartAnimation}
            />
          ))}

          {data.unassigned_lights.length > 0 && (
            <RoomCard
              room={{
                id: "unassigned",
                name: "Unassigned",
                lights: data.unassigned_lights,
                scenes: [],
                grouped_light_id: "",
              }}
              animations={animations}
              onToggleLight={handleToggleLight}
              onActivateScene={handleActivateScene}
              onToggleRoom={() => {}}
              onCreateAnimation={handleCreateAnimation}
              onStopAnimation={handleStopAnimation}
              onStartAnimation={handleStartAnimation}
            />
          )}

          <AutomationsList automations={data.automations} />
        </>
      )}
    </div>
  );
}
