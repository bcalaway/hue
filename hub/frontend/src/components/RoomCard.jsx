import LightTile from "./LightTile.jsx";
import SceneChip from "./SceneChip.jsx";

export default function RoomCard({ room, onToggleLight, onActivateScene }) {
  return (
    <div className="room-card">
      <h2>{room.name}</h2>
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
    </div>
  );
}
