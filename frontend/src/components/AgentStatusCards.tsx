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

const statusColor: Record<AgentStatus, string> = {
  waiting: 'text-gray-300',
  running: 'text-blue-500',
  done:    'text-green-500',
  error:   'text-red-500',
};

const statusIcon: Record<AgentStatus, string> = {
  waiting: '○',
  running: '●',
  done:    '✓',
  error:   '✕',
};

const statusLabel: Record<AgentStatus, string> = {
  waiting: '대기',
  running: '실행 중',
  done:    '완료',
  error:   '오류',
};

export default function AgentStatusCards({ agents }: Props) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
        Agent Pipeline
      </p>
      <div className="space-y-3">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-start gap-2">
            <span className={`mt-0.5 text-sm flex-shrink-0 ${statusColor[agent.status]} ${agent.status === 'running' ? 'animate-pulse' : ''}`}>
              {statusIcon[agent.status]}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 leading-tight">{agent.label}</p>
              <p className="text-[10px] text-gray-400">{agent.stage}</p>
              {agent.status !== 'waiting' && (
                <p className={`text-[10px] font-medium mt-0.5 ${statusColor[agent.status]}`}>
                  {statusLabel[agent.status]}
                </p>
              )}
              {agent.message && agent.status === 'running' && (
                <p className="text-[10px] text-gray-400 truncate mt-0.5 max-w-[160px]">{agent.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
