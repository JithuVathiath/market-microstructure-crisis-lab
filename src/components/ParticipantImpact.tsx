import type { AgentView } from "../engine/types";

interface ParticipantImpactProps {
  agents: AgentView[];
}

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

export const ParticipantImpact = ({ agents }: ParticipantImpactProps) => {
  const groups = [...new Set(agents.map((agent) => agent.kind))].map((kind) => {
    const members = agents.filter((agent) => agent.kind === kind);
    return {
      kind,
      count: members.length,
      pnl: mean(members.map((agent) => agent.pnl)),
      fill: mean(members.map((agent) => agent.fillRate)),
      inventoryRisk: mean(
        members.map(
          (agent) =>
            Math.abs(agent.inventory - 1_000) /
            Math.max(1, agent.inventoryLimit - 1_000),
        ),
      ),
      cancellations: members.reduce(
        (total, agent) => total + agent.cancellations,
        0,
      ),
      latency: members[0]?.latency.label ?? "—",
    };
  });

  return (
    <section
      id="research"
      className="panel impact-panel"
      aria-labelledby="impact-title"
    >
      <div className="panel__header">
        <div>
          <span className="eyebrow">Distributional effects</span>
          <h2 id="impact-title">Participant impact analysis</h2>
        </div>
        <span className="count-chip">Synthetic classes</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Participant class</th>
              <th>Profile</th>
              <th>Mean P&amp;L</th>
              <th>Fill probability</th>
              <th>Inventory risk</th>
              <th>Cancellations</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.kind}>
                <td>
                  <span className={`agent-dot agent-dot--${group.kind}`} />
                  {group.kind} ({group.count})
                </td>
                <td>{group.latency}</td>
                <td className={group.pnl >= 0 ? "positive" : "negative"}>
                  {group.pnl >= 0 ? "+" : ""}${group.pnl.toFixed(0)}
                </td>
                <td>{(group.fill * 100).toFixed(1)}%</td>
                <td>{(group.inventoryRisk * 100).toFixed(1)}%</td>
                <td>{group.cancellations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note">
        Differences are distributional effects within this synthetic model; they
        do not establish real-world discrimination, fairness, or causal effects.
      </p>
    </section>
  );
};
