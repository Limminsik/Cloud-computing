'use client';

export type AgentStatus = 'waiting' | 'running' | 'done' | 'error';

export interface AgentState {
  name: string;
  label: string;
  sublabel: string;
  status: AgentStatus;
  message: string;
}

interface Props {
  agents: AgentState[];
}

export default function AgentPipeline({ agents }: Props) {
  return (
    <div className="flex items-center gap-0">
      {agents.map((agent, i) => (
        <div key={agent.name} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
            agent.status === 'running' ? 'bg-blue-50 border-blue-300 text-blue-700' :
            agent.status === 'done'    ? 'bg-green-50 border-green-300 text-green-700' :
            agent.status === 'error'   ? 'bg-red-50 border-red-300 text-red-600' :
            'bg-gray-100 border-gray-200 text-gray-400'
          }`}>
            <span className={`text-xs flex-shrink-0 ${agent.status === 'running' ? 'animate-pulse' : ''}`}>
              {agent.status === 'done' ? '✓' : agent.status === 'error' ? '✕' : agent.status === 'running' ? '●' : '○'}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight whitespace-nowrap">{agent.label}</p>
              <p className="text-[10px] opacity-70 leading-tight whitespace-nowrap">{agent.sublabel}</p>
            </div>
            {agent.status === 'running' && agent.message && (
              <p className="text-[10px] opacity-60 max-w-[140px] truncate ml-1 hidden lg:block">
                {agent.message}
              </p>
            )}
          </div>

          {i < agents.length - 1 && (
            <div className="flex items-center px-1">
              <div className={`h-px w-6 ${agents[i + 1].status !== 'waiting' ? 'bg-green-300' : 'bg-gray-200'}`} />
              <svg className={`w-2 h-2 flex-shrink-0 ${agents[i + 1].status !== 'waiting' ? 'text-green-400' : 'text-gray-300'}`}
                fill="currentColor" viewBox="0 0 8 8">
                <path d="M0 0 L8 4 L0 8 Z" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
