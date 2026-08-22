import { useState } from "react";

const INTERVAL_OPTIONS_SECONDS = [1, 2, 5, 10, 30];

// At most one animation per room -- the hub enforces this too (see
// models.py's UniqueConstraint), since two animations both flipping the
// same room's scenes on their own schedules would just fight each other
// with no coherent result. This panel is either showing that one
// animation's status, or a form to create/edit it -- never a list. No
// delete: Stop already covers "I don't want this running right now", and
// Edit covers "I want different scenes" -- a separate delete action just
// made it possible to end up with nothing to click without a page refresh.
export default function AnimationControls({ room, animations, onCreate, onStop, onStart }) {
  const existing = animations.find((a) => a.room_id === room.id);
  const [editing, setEditing] = useState(!existing);
  const [sceneAId, setSceneAId] = useState(existing?.scene_a_id ?? room.scenes[0]?.id ?? "");
  const [sceneBId, setSceneBId] = useState(existing?.scene_b_id ?? room.scenes[1]?.id ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState(existing?.interval_seconds ?? 5);

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
      interval_seconds: Number(intervalSeconds),
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
          <select
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(e.target.value)}
            aria-label="Interval in seconds"
          >
            {INTERVAL_OPTIONS_SECONDS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}s
              </option>
            ))}
          </select>
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
