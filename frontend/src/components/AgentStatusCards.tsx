'use client';

export type AgentStatus = 'waiting' | 'running' | 'done' | 'error';

export interface AgentState {
  name: string;
  label: string;
  stage: string;
  status: AgentStatus;
  message: string;
}

interface Props {
  agents: AgentState[];
}

const statusStyle: Record<AgentStatus, string> = {
  waiting: 'border-gray-200 bg-gray-50',
  running: 'border-blue-300 bg-blue-50 shadow-blue-100 shadow-md',
  done:    'border-green-300 bg-green-50',
  error:   'border-red-300 bg-red-50',
};

const statusIcon: Record<AgentStatus, string> = {
  waiting: '○',
  running: '⟳',
  done:    '✓',
  error:   '✕',
};

const statusColor: Record<AgentStatus, string> = {
  waiting: 'text-gray-400',
  running: 'text-blue-500 animate-spin inline-block',
  done:    'text-green-600',
  error:   'text-red-600',
};

export default function AgentStatusCards({ agents }: Props) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Agent Pipeline
      </h2>
      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={`border-2 rounded-xl p-3 transition-all duration-300 ${statusStyle[agent.status]}`}
          >
            <div className="flex items-start gap-3">
              <span className={`text-lg font-bold mt-0.5 ${statusColor[agent.status]}`}>
                {statusIcon[agent.status]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{agent.label}</span>
                  <span className="text-xs text-gray-400">({agent.stage})</span>
                  {agent.status === 'running' && (
                    <span className="badge-running">실행 중</span>
                  )}
                  {agent.status === 'done' && (
                    <span className="badge-include">완료</span>
                  )}
                </div>
                {agent.message && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.message}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
