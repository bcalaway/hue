import { useState } from "react";

const INTERVAL_OPTIONS_SECONDS = [1, 2, 5, 10, 30];

// At most one animation per room -- the hub enforces this too (see
// models.py's UniqueConstraint), since two animations both flipping the
// same room's scenes on their own schedules would just fight each other
// with no coherent result. No delete: Stop already covers "I don't want
// this running right now" -- a separate delete action just made it
// possible to end up with nothing to click without a page refresh. No
// separate Edit/Save either: once an animation exists for a room, changing
// any field here saves immediately (an upsert on the hub, same request as
// creating one), rather than gating changes behind a save step.
export default function AnimationControls({ room, animations, onCreate, onStop, onStart }) {
  const existing = animations.find((a) => a.room_id === room.id);
  const [sceneAId, setSceneAId] = useState(existing?.scene_a_id ?? room.scenes[0]?.id ?? "");
  const [sceneBId, setSceneBId] = useState(existing?.scene_b_id ?? room.scenes[1]?.id ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState(existing?.interval_seconds ?? 5);

  function save(nextSceneAId, nextSceneBId, nextIntervalSeconds) {
    if (!nextSceneAId || !nextSceneBId || nextSceneAId === nextSceneBId) return;
    const sceneA = room.scenes.find((s) => s.id === nextSceneAId);
    const sceneB = room.scenes.find((s) => s.id === nextSceneBId);
    onCreate({
      room_id: room.id,
      room_name: room.name,
      scene_a_id: sceneA.id,
      scene_a_name: sceneA.name,
      scene_b_id: sceneB.id,
      scene_b_name: sceneB.name,
      interval_seconds: Number(nextIntervalSeconds),
    });
  }

  function handleSceneAChange(event) {
    setSceneAId(event.target.value);
    if (existing) save(event.target.value, sceneBId, intervalSeconds);
  }

  function handleSceneBChange(event) {
    setSceneBId(event.target.value);
    if (existing) save(sceneAId, event.target.value, intervalSeconds);
  }

  function handleIntervalChange(event) {
    setIntervalSeconds(event.target.value);
    if (existing) save(sceneAId, sceneBId, event.target.value);
  }

  return (
    <div className="animations-panel">
      <h3>Animate</h3>

      {existing && (
        <div className="animation-row">
          <span className="animation-label">
            {existing.scene_a_name} ↔ {existing.scene_b_name} every {existing.interval_seconds}s
          </span>
          {existing.running ? (
            <button type="button" className="btn" onClick={() => onStop(existing.id)}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => onStart(existing.id)}>
              Start
            </button>
          )}
        </div>
      )}

      <div className="animation-form">
        <select value={sceneAId} onChange={handleSceneAChange}>
          {room.scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
        <span className="animation-form-sep">↔</span>
        <select value={sceneBId} onChange={handleSceneBChange}>
          {room.scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
        <select value={intervalSeconds} onChange={handleIntervalChange} aria-label="Interval in seconds">
          {INTERVAL_OPTIONS_SECONDS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}s
            </option>
          ))}
        </select>
        {!existing && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => save(sceneAId, sceneBId, intervalSeconds)}
            disabled={sceneAId === sceneBId}
          >
            Start
          </button>
        )}
      </div>
    </div>
  );
}
