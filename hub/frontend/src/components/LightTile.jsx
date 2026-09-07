import { useState } from "react";
import { swatchColor } from "../colors.js";

export default function LightTile({ light, onToggle, onSetBrightness }) {
  const color = swatchColor(light.on, light.color_hex);
  // Brightness while the slider is being dragged -- shields the thumb from
  // the 2s state poll landing mid-drag and yanking it back. null when not
  // interacting, so the tile follows live state the rest of the time.
  const [dragging, setDragging] = useState(null);
  const shown = dragging ?? Math.round(light.brightness);

  // Commit on release, not per-pixel -- a real Zigbee bulb can't keep up
  // with a request per slider step, and the Hue app itself only sends on
  // release. Wired to pointer/key up and blur so mouse, touch, and
  // keyboard users all land the value; the guard makes redundant fires
  // (e.g. blur right after pointerup) no-ops.
  function commit() {
    if (dragging === null) return;
    onSetBrightness(light, dragging);
    setDragging(null);
  }

  return (
    <div className={`light-tile ${light.on ? "on" : "off"}`}>
      <button type="button" className="light-toggle" onClick={onToggle}>
        <span className="swatch" style={color ? { background: color } : undefined} />
        <span className="light-info">
          <span className="light-name">{light.name}</span>
          <span className="light-state">
            {light.on ? (light.dimmable ? `${shown}%` : "on") : "off"}
          </span>
        </span>
      </button>
      {light.dimmable && (
        <input
          type="range"
          className="brightness-slider"
          min="1"
          max="100"
          value={shown}
          aria-label={`${light.name} brightness`}
          onChange={(event) => setDragging(Number(event.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      )}
    </div>
  );
}
