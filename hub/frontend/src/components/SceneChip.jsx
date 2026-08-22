export default function SceneChip({ scene, onActivate }) {
  return (
    <button type="button" className={`scene-chip ${scene.active ? "active" : ""}`} onClick={onActivate}>
      <span className="swatch" style={{ background: scene.color_hex || "#cccccc" }} />
      <span>{scene.name}</span>
    </button>
  );
}
