'use client';

import { useEffect, useRef } from 'react';

export interface LogEntry {
  id: string;
  type: string;
  agent?: string;
  message: string;
  timestamp: string;
}

interface Props {
  logs: LogEntry[];
}

const logColor: Record<string, string> = {
  agent_start:    'text-blue-600',
  agent_progress: 'text-blue-400',
  agent_complete: 'text-green-600',
  paper_decision: 'text-gray-700',
  prisma_update:  'text-purple-600',
  pipeline_done:  'text-green-700 font-bold',
  error:          'text-red-600',
  heartbeat:      'text-gray-300',
};

export default function LiveLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const visible = logs.filter((l) => l.type !== 'heartbeat');

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Live Log
      </h2>
      <div className="bg-gray-950 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
        {visible.length === 0 ? (
          <p className="text-gray-500 italic">파이프라인 시작 대기 중...</p>
        ) : (
          visible.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-gray-600 shrink-0">{log.timestamp}</span>
              {log.agent && (
                <span className="text-yellow-500 shrink-0">[{log.agent}]</span>
              )}
              <span className={logColor[log.type] || 'text-gray-300'}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
