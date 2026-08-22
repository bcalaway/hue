import { useState } from "react";

export default function AnimationControls({ room, animations, onCreate, onStop, onStart, onDelete }) {
  const [sceneAId, setSceneAId] = useState(room.scenes[0]?.id ?? "");
  const [sceneBId, setSceneBId] = useState(room.scenes[1]?.id ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState(30);

  const roomAnimations = animations.filter((a) => a.room_id === room.id);

  function handleCreate() {
    if (!sceneAId || !sceneBId || sceneAId === sceneBId) return;
    const sceneA = room.scenes.find((s) => s.id === sceneAId);
    const sceneB = room.scenes.find((s) => s.id === sceneBId);
    onCreate({
      room_id: room.id,
      room_name: room.name,
      scene_a_id: sceneA.id,
      scene_a_name: sceneA.name,
      scene_b_id: sceneB.id,
      scene_b_name: sceneB.name,
      interval_seconds: Math.max(1, Number(intervalSeconds) || 30),
    });
  }

  return (
    <div className="animations-panel">
      <h3>Animate</h3>

      {roomAnimations.map((animation) => (
        <div key={animation.id} className="animation-row">
          <span className="animation-label">
            {animation.scene_a_name} ↔ {animation.scene_b_name} every {animation.interval_seconds}s
          </span>
          <span className="animation-actions">
            {animation.running ? (
              <button type="button" className="btn" onClick={() => onStop(animation.id)}>
                Stop
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => onStart(animation.id)}>
                Start
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={() => onDelete(animation.id)}>
              Delete
            </button>
          </span>
        </div>
      ))}

      <div className="animation-form">
        <select value={sceneAId} onChange={(e) => setSceneAId(e.target.value)}>
          {room.scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
        <span className="animation-form-sep">↔</span>
        <select value={sceneBId} onChange={(e) => setSceneBId(e.target.value)}>
          {room.scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(e.target.value)}
          aria-label="Interval in seconds"
        />
        <span className="animation-form-sep">sec</span>
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={sceneAId === sceneBId}>
          Start new
        </button>
      </div>
    </div>
  );
}
