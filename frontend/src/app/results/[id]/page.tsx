'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PrismaFlowDiagram from '@/components/PrismaFlowDiagram';
import AgentStatusCards, { AgentState, AgentStatus } from '@/components/AgentStatusCards';
import LiveLog, { LogEntry } from '@/components/LiveLog';
import PaperList, { PaperDecision } from '@/components/PaperList';
import ReviewReport from '@/components/ReviewReport';
import { getSSEUrl } from '@/lib/api';

const INITIAL_AGENTS: AgentState[] = [
  { name: 'SearchAgent',      label: 'Search Agent',      stage: 'Identification', status: 'waiting', message: '' },
  { name: 'ScreeningAgent',   label: 'Screening Agent',   stage: 'Screening',      status: 'waiting', message: '' },
  { name: 'EligibilityAgent', label: 'Eligibility Agent', stage: 'Eligibility',    status: 'waiting', message: '' },
  { name: 'ExtractionAgent',  label: 'Extraction Agent',  stage: 'Data Extraction',status: 'waiting', message: '' },
  { name: 'WriterAgent',      label: 'Writer Agent',      stage: 'Synthesis',      status: 'waiting', message: '' },
];

const INITIAL_STATS = { identified: 0, screened: 0, eligible: 0, included: 0 };

let logIdCounter = 0;
function makeLog(event: Record<string, unknown>): LogEntry {
  return {
    id: String(++logIdCounter),
    type: event.type as string,
    agent: event.agent as string | undefined,
    message: (event.message as string) || JSON.stringify(event),
    timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
  };
}

export default function ResultsPage() {
  const { id: sessionId } = useParams<{ id: string }>();

  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [papers, setPapers] = useState<PaperDecision[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  const esRef = useRef<EventSource | null>(null);

  const updateAgent = useCallback((name: string, status: AgentStatus, message: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.name === name ? { ...a, status, message } : a)),
    );
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const url = getSSEUrl(sessionId);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnectionError('');

    es.onmessage = (e) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      const type = event.type as string;
      const agent = event.agent as string | undefined;

      // Append log
      if (type !== 'heartbeat') {
        setLogs((prev) => [...prev, makeLog(event)]);
      }

      if (type === 'agent_start' && agent) {
        updateAgent(agent, 'running', event.message as string);
      }

      if (type === 'agent_progress' && agent) {
        updateAgent(agent, 'running', event.message as string);
      }

      if (type === 'agent_complete' && agent) {
        updateAgent(agent, 'done', event.message as string);
      }

      if (type === 'error' && agent) {
        updateAgent(agent, 'error', event.message as string);
      }

      if (type === 'prisma_update') {
        setStats(event.counts as typeof INITIAL_STATS);
      }

      if (type === 'paper_decision') {
        setPapers((prev) => [
          ...prev,
          {
            title: event.title as string,
            decision: event.decision as string,
            reason: event.reason as string,
            stage: event.stage as string,
          },
        ]);
      }

      if (type === 'pipeline_done') {
        setDone(true);
        es.close();
        // Fetch final report from backend DB after a short delay
        setTimeout(() => fetchReport(), 2000);
      }
    };

    es.onerror = () => {
      if (!done) setConnectionError('SSE 연결 끊김. 자동 재연결 중...');
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchReport = async () => {
    try {
      const NESTJS_URL = process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000';
      const res = await fetch(`${NESTJS_URL}/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.report?.content) setReport(data.report.content);
      }
    } catch {
      // Non-fatal
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">연구 진행 중</h2>
          <p className="text-sm text-gray-400 font-mono mt-0.5">Session: {sessionId}</p>
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <span className="badge-include text-sm px-3 py-1">파이프라인 완료</span>
          ) : (
            <span className="badge-running text-sm px-3 py-1">실행 중</span>
          )}
        </div>
      </div>

      {connectionError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-700">
          {connectionError}
        </div>
      )}

      {/* PRISMA Flow */}
      <div className="card">
        <PrismaFlowDiagram stats={stats} />
      </div>

      {/* 2-column: Agents + Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <AgentStatusCards agents={agents} />
        </div>
        <div className="card">
          <LiveLog logs={logs} />
        </div>
      </div>

      {/* Paper List */}
      {papers.length > 0 && (
        <div className="card">
          <PaperList papers={papers} />
        </div>
      )}

      {/* Final Report */}
      {report && (
        <div className="card">
          <ReviewReport content={report} />
        </div>
      )}

      {done && !report && (
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm">
            파이프라인 완료. 보고서를 DB에서 불러오는 중...
          </p>
        </div>
      )}
    </div>
  );
}
