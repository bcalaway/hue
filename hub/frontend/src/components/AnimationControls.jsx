import { useState } from "react";

// At most one animation per room -- the hub enforces this too (see
// models.py's UniqueConstraint), since two animations both flipping the
// same room's scenes on their own schedules would just fight each other
// with no coherent result. This panel is either showing that one
// animation's status, or a form to create/edit it -- never a list.
export default function AnimationControls({ room, animations, onCreate, onStop, onStart, onDelete }) {
  const existing = animations.find((a) => a.room_id === room.id);
  const [editing, setEditing] = useState(!existing);
  const [sceneAId, setSceneAId] = useState(existing?.scene_a_id ?? room.scenes[0]?.id ?? "");
  const [sceneBId, setSceneBId] = useState(existing?.scene_b_id ?? room.scenes[1]?.id ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState(existing?.interval_seconds ?? 30);

  async function handleSave() {
    if (!sceneAId || !sceneBId || sceneAId === sceneBId) return;
    const sceneA = room.scenes.find((s) => s.id === sceneAId);
    const sceneB = room.scenes.find((s) => s.id === sceneBId);
    await onCreate({
      room_id: room.id,
      room_name: room.name,
      scene_a_id: sceneA.id,
      scene_a_name: sceneA.name,
      scene_b_id: sceneB.id,
      scene_b_name: sceneB.name,
      interval_seconds: Math.max(1, Number(intervalSeconds) || 30),
    });
    // Waits for the parent's reload to finish before switching views, so
    // this doesn't briefly render neither the form nor the summary while
    // `animations` still reflects the pre-save state.
    setEditing(false);
  }

  return (
    <div className="animations-panel">
      <h3>Animate</h3>

      {existing && !editing && (
        <div className="animation-row">
          <span className="animation-label">
            {existing.scene_a_name} ↔ {existing.scene_b_name} every {existing.interval_seconds}s
          </span>
          <span className="animation-actions">
            {existing.running ? (
              <button type="button" className="btn" onClick={() => onStop(existing.id)}>
                Stop
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => onStart(existing.id)}>
                Start
              </button>
            )}
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onDelete(existing.id)}>
              Delete
            </button>
          </span>
        </div>
      )}

      {editing && (
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
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={sceneAId === sceneBId}>
            {existing ? "Save" : "Start"}
          </button>
          {existing && (
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
