import { useState } from "react";

function AutomationRow({ automation }) {
  const [showDefinition, setShowDefinition] = useState(false);

  let formatted = automation.configuration_json;
  try {
    formatted = JSON.stringify(JSON.parse(automation.configuration_json), null, 2);
  } catch {
    // Not valid JSON (or empty) -- fall back to showing it raw rather than
    // hiding the automation entirely.
  }

  return (
    <li>
      <div className="automation-row">
        <span>{automation.name}</span>
        <span className={automation.enabled ? "on" : "off"}>{automation.status}</span>
        <button type="button" className="definition-toggle" onClick={() => setShowDefinition((prev) => !prev)}>
          {showDefinition ? "Hide definition" : "Show definition"}
        </button>
      </div>
      {showDefinition && <pre className="automation-definition">{formatted}</pre>}
    </li>
  );
}

export default function AutomationsList({ automations }) {
  if (automations.length === 0) return null;
  return (
    <section className="automations">
      <h3>Automations</h3>
      <ul>
        {automations.map((automation) => (
          <AutomationRow key={automation.id} automation={automation} />
        ))}
      </ul>
    </section>
  );
}
