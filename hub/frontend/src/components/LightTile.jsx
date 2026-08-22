import { swatchColor } from "../colors.js";

export default function LightTile({ light, onToggle }) {
  const color = swatchColor(light.on, light.color_hex);
  return (
    <button type="button" className={`light-tile ${light.on ? "on" : "off"}`} onClick={onToggle}>
      <span className="swatch" style={color ? { background: color } : undefined} />
      <span className="light-info">
        <span className="light-name">{light.name}</span>
        <span className="light-state">
          {light.on ? (light.dimmable ? `${Math.round(light.brightness)}%` : "on") : "off"}
        </span>
      </span>
    </button>
  );
}
