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
  // A sequence, not just a pair -- 2 is the minimum (enforced below and on
  // the hub, schemas.py's AnimationCreate), not a fixed size.
  const [sceneIds, setSceneIds] = useState(
    existing ? existing.scenes.map((s) => s.id) : [room.scenes[0]?.id ?? "", room.scenes[1]?.id ?? ""],
  );
  const [intervalSeconds, setIntervalSeconds] = useState(existing?.interval_seconds ?? 5);

  const isValidSequence =
    sceneIds.length >= 2 && sceneIds.every(Boolean) && new Set(sceneIds).size === sceneIds.length;

  function save(nextSceneIds, nextIntervalSeconds) {
    if (nextSceneIds.length < 2 || !nextSceneIds.every(Boolean)) return;
    if (new Set(nextSceneIds).size !== nextSceneIds.length) return;
    onCreate({
      room_id: room.id,
      room_name: room.name,
      scenes: nextSceneIds.map((id) => {
        const scene = room.scenes.find((s) => s.id === id);
        return { id: scene.id, name: scene.name };
      }),
      interval_seconds: Number(nextIntervalSeconds),
    });
  }

  function handleSceneChange(index, value) {
    const next = sceneIds.map((id, i) => (i === index ? value : id));
    setSceneIds(next);
    if (existing) save(next, intervalSeconds);
  }

  function handleAddScene() {
    const unused = room.scenes.find((s) => !sceneIds.includes(s.id));
    const next = [...sceneIds, unused?.id ?? room.scenes[0].id];
    setSceneIds(next);
    if (existing) save(next, intervalSeconds);
  }

  function handleRemoveScene(index) {
    if (sceneIds.length <= 2) return;
    const next = sceneIds.filter((_, i) => i !== index);
    setSceneIds(next);
    if (existing) save(next, intervalSeconds);
  }

  function handleIntervalChange(event) {
    setIntervalSeconds(event.target.value);
    if (existing) save(sceneIds, event.target.value);
  }

  return (
    <div className="animations-panel">
      <h3>Animate</h3>

      {existing && (
        <div className="animation-row">
          <span className="animation-label">
            {existing.scenes.map((s) => s.name).join(" → ")} every {existing.interval_seconds}s
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
        <div className="animation-scene-list">
          {sceneIds.map((sceneId, index) => (
            // Index as key is safe here: each row is a fully-controlled
            // <select> with no internal state of its own, so there's
            // nothing for React to misassociate across an add/remove.
            <span key={index} className="animation-scene-row">
              <select value={sceneId} onChange={(event) => handleSceneChange(index, event.target.value)}>
                {room.scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
              {sceneIds.length > 2 && (
                <button
                  type="button"
                  className="animation-remove-scene"
                  onClick={() => handleRemoveScene(index)}
                  aria-label={`Remove scene ${index + 1}`}
                >
                  ✕
                </button>
              )}
              {index < sceneIds.length - 1 && <span className="animation-form-sep">→</span>}
            </span>
          ))}
          {sceneIds.length < room.scenes.length && (
            <button type="button" className="btn" onClick={handleAddScene}>
              + Scene
            </button>
          )}
        </div>
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
            onClick={() => save(sceneIds, intervalSeconds)}
            disabled={!isValidSequence}
          >
            Start
          </button>
        )}
      </div>
    </div>
  );
}
