// Root component of the hue hub UI: lets you control lights, scenes, favorites and animations.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activateScene,
  addFavorite,
  createAnimation,
  fetchAnimations,
  fetchDetectedSite,
  fetchFavorites,
  fetchState,
  removeFavorite,
  setLightBrightness,
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

// Marks one scene active and every OTHER scene in the SAME room inactive --
// Hue's own "active" flag is effectively exclusive (a room's lights can
// only exactly match one scene's captured state at a time), so activating
// scene B should also visually deactivate whichever scene was active
// before. Used for the optimistic update on scene activation; without the
// "every other scene" half of this, the previously-active chip stayed
// green forever alongside the newly-active one.
function patchSceneActivation(sites, site, roomId, sceneId) {
  const data = sites[site];
  return {
    ...sites,
    [site]: {
      ...data,
      rooms: data.rooms.map((room) =>
        room.id === roomId
          ? { ...room, scenes: room.scenes.map((scene) => ({ ...scene, active: scene.id === sceneId })) }
          : room,
      ),
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
  // Not state -- read/written inside the poll's own interval callback and
  // inside click handlers, never something a render should react to.
  const suppressPollUntilRef = useRef(0);
  const pollInFlightRef = useRef(false);
  // Site auto-detection (see fetchDetectedSite / the hue README). `sitesRef`
  // mirrors `sites` so the roam effect below can stay `[]`-deps instead of
  // re-subscribing on every 2s poll. `lastDetectedRef` is the last site the
  // hub reported for this browser's IP; `manualOverrideRef` is set once the
  // user picks from the dropdown and cleared again only when the detected
  // network actually changes underneath them.
  const sitesRef = useRef(null);
  const lastDetectedRef = useRef(null);
  const manualOverrideRef = useRef(false);

  // Real Hue hardware doesn't flip instantly -- CLIP v2's PUT returns before
  // the Zigbee mesh has actually finished propagating the change, so a poll
  // landing right after a click can fetch state from *before* the bridge
  // caught up and stomp the optimistic update right back to its old value,
  // which looks exactly like "my click took a few seconds to do anything."
  // Every mutation calls this to give the bridge a moment before the next
  // poll is trusted to overwrite what the UI already (correctly) shows.
  const suppressPollBriefly = useCallback(() => {
    suppressPollUntilRef.current = Date.now() + 3000;
  }, []);

  useEffect(() => {
    Promise.all([fetchState(), fetchDetectedSite()])
      .then(([data, detected]) => {
        setSites(data.sites);
        const keys = Object.keys(data.sites);
        lastDetectedRef.current = detected;
        const firstAvailable = keys.find((key) => data.sites[key].available) || keys[0];
        // Detected site wins on first load even if that site's agent is
        // currently unreachable -- "you're physically at Rambles" is still
        // the right thing to show (with its unreachable notice).
        setSelectedSite(detected && keys.includes(detected) ? detected : firstAvailable);
      })
      .catch(() => setError("Failed to load state."));
  }, []);

  // Keeps sitesRef in step with sites for the roam effect below.
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  // Follows the user if they move their device between the NYC and Rambles
  // LANs with the page open -- the reason detection is done by IP
  // server-side rather than via split-horizon DNS (see the hue README).
  // Re-checks on a slow interval and whenever the tab regains
  // focus/visibility. A real network change clears any manual dropdown
  // pick; while the detected network is unchanged, a manual pick stands.
  useEffect(() => {
    function recheck() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchDetectedSite().then((detected) => {
        if (!detected) return;
        const keys = sitesRef.current ? Object.keys(sitesRef.current) : [];
        if (!keys.includes(detected)) return;
        const networkChanged = detected !== lastDetectedRef.current;
        lastDetectedRef.current = detected;
        if (networkChanged) manualOverrideRef.current = false;
        if (manualOverrideRef.current) return;
        setSelectedSite((current) => (detected === current ? current : detected));
      });
    }
    const interval = setInterval(recheck, 60000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  // Polls for live state -- without this, an animation flipping scenes (or
  // Hue's own automations doing anything) never shows up here until a
  // manual page reload, since the initial fetch above only ever runs once.
  // Only updates `sites`, not `selectedSite` -- the site dropdown and each
  // room's expand/collapse state (local to RoomCard, keyed by room id) are
  // left alone so a poll landing mid-interaction doesn't reset anything.
  // Skips a tick entirely (rather than just discarding the result) both
  // right after a click (see suppressPollBriefly) and while a previous poll
  // is still in flight -- a genuinely unreachable site can take up to the
  // backend's 3s timeout, longer than this 2s interval, so without the
  // in-flight guard two requests could overlap and land out of order.
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < suppressPollUntilRef.current) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      fetchState()
        .then((data) => setSites(data.sites))
        .catch(() => {})
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, 2000);
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

  const handleSiteChange = useCallback((event) => {
    // A deliberate pick holds until the detected network actually changes
    // under the user (see the roam effect above).
    manualOverrideRef.current = true;
    setSelectedSite(event.target.value);
  }, []);

  const handleToggleLight = useCallback(
    (light) => {
      if (!selectedSite) return;
      const nextOn = !light.on;
      suppressPollBriefly();
      // Flips immediately rather than waiting on a round trip to the site's
      // NUC agent (and from there the bridge) -- reverts below if the
      // bridge actually rejects it, which is rare but not impossible (a
      // stale light id, the bridge itself unreachable).
      setSites((prev) => patchLight(prev, selectedSite, light.id, { on: nextOn }));
      setLightState(selectedSite, light.id, nextOn).then((ok) => {
        if (!ok) setSites((prev) => patchLight(prev, selectedSite, light.id, { on: light.on }));
      });
    },
    [selectedSite, suppressPollBriefly],
  );

  const handleSetLightBrightness = useCallback(
    (light, brightness) => {
      if (!selectedSite) return;
      suppressPollBriefly();
      // Optimistic + on:true, since the agent turns the light on as part of
      // the same bridge call (dragging the slider up on an off light lights
      // it). Reverts both fields if the bridge rejects it.
      const prior = { on: light.on, brightness: light.brightness };
      setSites((prev) => patchLight(prev, selectedSite, light.id, { on: true, brightness }));
      setLightBrightness(selectedSite, light.id, brightness).then((ok) => {
        if (!ok) setSites((prev) => patchLight(prev, selectedSite, light.id, prior));
      });
    },
    [selectedSite, suppressPollBriefly],
  );

  const handleActivateScene = useCallback(
    (scene, roomId) => {
      if (!selectedSite) return;
      suppressPollBriefly();
      // Optimistic, same as everything else -- no revert-on-failure since
      // there's no clean "prior scene" to restore to on failure (this patch
      // already discards whichever scene used to be active).
      setSites((prev) => patchSceneActivation(prev, selectedSite, roomId, scene.id));
      activateScene(selectedSite, scene.id);
    },
    [selectedSite, suppressPollBriefly],
  );

  const handleToggleRoom = useCallback(
    (room) => {
      if (!selectedSite) return;
      // The circle is a switch: any light on -> this click turns the whole
      // room off; all off -> it turns the whole room on.
      const nextOn = !room.lights.some((light) => light.on);
      suppressPollBriefly();
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
    [selectedSite, suppressPollBriefly],
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
        <select value={selectedSite} onChange={handleSiteChange}>
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
              onSetLightBrightness={handleSetLightBrightness}
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
              onSetLightBrightness={handleSetLightBrightness}
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
