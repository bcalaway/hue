export default function LightTile({ light, onToggle }) {
  return (
    <button type="button" className={`light-tile ${light.on ? "on" : "off"}`} onClick={onToggle}>
      <span
        className="swatch"
        style={light.on && light.color_hex ? { background: light.color_hex } : undefined}
      />
      <span className="light-info">
        <span className="light-name">{light.name}</span>
        <span className="light-state">{light.on ? `${Math.round(light.brightness)}%` : "off"}</span>
      </span>
    </button>
  );
}
