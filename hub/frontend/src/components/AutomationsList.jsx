export default function AutomationsList({ automations }) {
  if (automations.length === 0) return null;
  return (
    <section className="automations">
      <h3>Automations</h3>
      <ul>
        {automations.map((automation) => (
          <li key={automation.id}>
            <span>{automation.name}</span>
            <span className={automation.enabled ? "on" : "off"}>{automation.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
