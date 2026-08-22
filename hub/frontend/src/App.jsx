import { useCallback, useEffect, useState } from "react";
import { activateScene, fetchState, setLightState } from "./api.js";
import RoomCard from "./components/RoomCard.jsx";
import AutomationsList from "./components/AutomationsList.jsx";

const SITE_LABELS = { nyc: "NYC", rambles: "Rambles" };

function siteLabel(key) {
  return SITE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
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

export default function App() {
  const [sites, setSites] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
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
          {data.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onToggleLight={handleToggleLight}
              onActivateScene={handleActivateScene}
            />
          ))}

          {data.unassigned_lights.length > 0 && (
            <RoomCard
              room={{ id: "unassigned", name: "Unassigned", lights: data.unassigned_lights, scenes: [] }}
              onToggleLight={handleToggleLight}
              onActivateScene={handleActivateScene}
            />
          )}

          <AutomationsList automations={data.automations} />
        </>
      )}
    </div>
  );
}
