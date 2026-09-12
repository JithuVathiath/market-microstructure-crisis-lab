import type { AgentView } from "../engine/types";

interface AgentTableProps {
  agents: AgentView[];
}

export const AgentTable = ({ agents }: AgentTableProps) => (
  <section className="panel agent-panel" aria-labelledby="agent-title">
    <div className="panel__header">
      <div>
        <span className="eyebrow">Heterogeneous Behaviour</span>
        <h2 id="agent-title">Participant Monitor</h2>
      </div>
      <span className="count-chip">{agents.length} agents</span>
    </div>
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Participant</th>
            <th>P&amp;L</th>
            <th>Inventory</th>
            <th>Fill</th>
            <th>Last decision</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>
                <span className={`agent-dot agent-dot--${agent.kind}`} />
                {agent.label}
              </td>
              <td className={agent.pnl >= 0 ? "positive" : "negative"}>
                {agent.pnl >= 0 ? "+" : ""}${agent.pnl.toFixed(0)}
              </td>
              <td>{agent.inventory.toLocaleString()}</td>
              <td>{(agent.fillRate * 100).toFixed(0)}%</td>
              <td title={agent.lastDecision}>{agent.lastDecision}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);
