import { useState } from "react";
import LightTile from "./LightTile.jsx";
import SceneChip from "./SceneChip.jsx";
import AnimationControls from "./AnimationControls.jsx";
import { swatchColor } from "../colors.js";

export default function RoomCard({
  room,
  animations,
  isFavorite,
  onToggleFavorite,
  onToggleLight,
  onActivateScene,
  onToggleRoom,
  onCreateAnimation,
  onStopAnimation,
  onStartAnimation,
}) {
  // Collapsed by default -- a house with a dozen rooms otherwise turns into
  // a wall of tiles before you've picked one. Collapsed state still shows
  // an on/off + color summary per light so nothing's hidden, just compact.
  const [expanded, setExpanded] = useState(false);
  const roomOn = room.lights.some((light) => light.on);

  return (
    <div className="room-card">
      <div className="room-header">
        {/* Only real Hue rooms get a favorite star -- the synthetic
            "Unassigned" card (App.jsx) doesn't pass onToggleFavorite at all. */}
        {onToggleFavorite && (
          <button
            type="button"
            className={`favorite-star ${isFavorite ? "active" : ""}`}
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Unfavorite this room" : "Favorite this room"}
            aria-pressed={isFavorite}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        )}

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
                style={{ background: swatchColor(light.on, light.color_hex) }}
                title={`${light.name}: ${light.on ? "on" : "off"}`}
              />
            ))}
          </span>
        )}

        {room.grouped_light_id && (
          <button
            type="button"
            className={`room-toggle ${roomOn ? "on" : "off"}`}
            onClick={onToggleRoom}
            aria-label={roomOn ? "Turn room off" : "Turn room on"}
            aria-pressed={roomOn}
            title={roomOn ? "Turn room off" : "Turn room on"}
          >
            <span className="swatch" style={{ background: swatchColor(roomOn, "") }} />
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
            />
          )}
        </div>
      )}
    </div>
  );
}
