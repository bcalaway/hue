import { useState } from "react";
import LightTile from "./LightTile.jsx";
import SceneChip from "./SceneChip.jsx";
import AnimationControls from "./AnimationControls.jsx";

export default function RoomCard({
  room,
  animations,
  onToggleLight,
  onActivateScene,
  onTurnOffRoom,
  onCreateAnimation,
  onStopAnimation,
  onStartAnimation,
  onDeleteAnimation,
}) {
  // Collapsed by default -- a house with a dozen rooms otherwise turns into
  // a wall of tiles before you've picked one. Collapsed state still shows
  // an on/off + color summary per light so nothing's hidden, just compact.
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="room-card">
      <div className="room-header">
        <button
          type="button"
          className="room-name-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          <span className="disclosure">{expanded ? "▾" : "▸"}</span>
          <span className="room-name">{room.name}</span>
        </button>

        {!expanded && (
          <span className="room-summary">
            {room.lights.map((light) => (
              <span
                key={light.id}
                className={`summary-dot ${light.on ? "on" : "off"}`}
                style={light.on && light.color_hex ? { background: light.color_hex } : undefined}
                title={`${light.name}: ${light.on ? "on" : "off"}`}
              />
            ))}
          </span>
        )}

        {room.grouped_light_id && (
          <button type="button" className="room-off-button" onClick={onTurnOffRoom}>
            Turn off
          </button>
        )}
      </div>

      {expanded && (
        <div className="room-body">
          <div className="lights-grid">
            {room.lights.map((light) => (
              <LightTile key={light.id} light={light} onToggle={() => onToggleLight(light)} />
            ))}
          </div>

          {room.scenes.length > 0 && (
            <div className="scenes-row">
              {room.scenes.map((scene) => (
                <SceneChip key={scene.id} scene={scene} onActivate={() => onActivateScene(scene)} />
              ))}
            </div>
          )}

          {room.scenes.length >= 2 && (
            <AnimationControls
              room={room}
              animations={animations}
              onCreate={onCreateAnimation}
              onStop={onStopAnimation}
              onStart={onStartAnimation}
              onDelete={onDeleteAnimation}
            />
          )}
        </div>
      )}
    </div>
  );
}
