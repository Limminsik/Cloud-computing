'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AgentStatusCards, { AgentState, AgentStatus } from '@/components/AgentStatusCards';
import LiveLog, { LogEntry } from '@/components/LiveLog';
import PaperList, { PaperDecision } from '@/components/PaperList';
import ReviewReport from '@/components/ReviewReport';
import PrismaInteractiveFlow, { PrismaStage } from '@/components/PrismaInteractiveFlow';
import { getSSEUrl } from '@/lib/api';

const NESTJS_URL = process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000';

const INITIAL_AGENTS: AgentState[] = [
  { name: 'SearchAgent',      label: 'Search',      stage: 'Identification', status: 'waiting', message: '' },
  { name: 'ScreeningAgent',   label: 'Screening',   stage: 'Screening',      status: 'waiting', message: '' },
  { name: 'EligibilityAgent', label: 'Eligibility', stage: 'Eligibility',    status: 'waiting', message: '' },
  { name: 'ExtractionAgent',  label: 'Extraction',  stage: 'Data Extraction',status: 'waiting', message: '' },
  { name: 'WriterAgent',      label: 'Writer',      stage: 'Synthesis',      status: 'waiting', message: '' },
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

  const [agents, setAgents]       = useState<AgentState[]>(INITIAL_AGENTS);
  const [stats, setStats]         = useState(INITIAL_STATS);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [papers, setPapers]       = useState<PaperDecision[]>([]);
  const [report, setReport]       = useState<string | null>(null);
  const [done, setDone]           = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [showLog, setShowLog]     = useState(false);
  const [query, setQuery]         = useState('');
  const [activeTab, setActiveTab] = useState<'papers' | 'report'>('papers');
  const [completedStages, setCompletedStages] = useState<Set<PrismaStage>>(new Set());
  const [activeStage, setActiveStage] = useState<PrismaStage | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const updateAgent = useCallback((name: string, status: AgentStatus, message: string) => {
    setAgents(prev => prev.map(a => a.name === name ? { ...a, status, message } : a));
  }, []);

  // 초기 세션 로드 (완료된 세션이면 DB에서 바로 표시)
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${NESTJS_URL}/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.query) setQuery(data.query);
        if (data.prismaStats) setStats(data.prismaStats);
        if (data.status === 'done') {
          setDone(true);
          setCompletedStages(new Set(['identification', 'screening', 'eligibility', 'inclusion']));
          if (data.papers?.length) {
            setPapers(data.papers.map((p: { title: string; decision?: string; reason?: string; prismaStage?: string }) => ({
              title: p.title,
              decision: p.decision || 'EXCLUDE',
              reason: p.reason || '',
              stage: p.prismaStage || 'identified',
            })));
          }
          if (data.report?.content) {
            setReport(data.report.content);
          }
          setAgents(prev => prev.map(a => ({ ...a, status: 'done' as AgentStatus })));
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // SSE 구독
  useEffect(() => {
    if (!sessionId) return;
    const url = getSSEUrl(sessionId);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnectionError('');
    es.onmessage = (e) => {
      let event: Record<string, unknown>;
      try { event = JSON.parse(e.data); } catch { return; }

      const type  = event.type as string;
      const agent = event.agent as string | undefined;

      if (type !== 'heartbeat') setLogs(prev => [...prev, makeLog(event)]);
      if (type === 'agent_start'    && agent) updateAgent(agent, 'running', event.message as string);
      if (type === 'agent_progress' && agent) updateAgent(agent, 'running', event.message as string);
      if (type === 'agent_complete' && agent) updateAgent(agent, 'done',    event.message as string);
      if (type === 'error'          && agent) updateAgent(agent, 'error',   event.message as string);
      if (type === 'prisma_update') setStats(event.counts as typeof INITIAL_STATS);

      if (type === 'paper_decision') {
        setPapers(prev => [...prev, {
          title:    event.title    as string,
          decision: event.decision as string,
          reason:   event.reason   as string,
          stage:    event.stage    as string,
        }]);
      }

      // 단계 완료 이벤트
      if (type === 'stage_complete') {
        const stage = event.stage as PrismaStage;
        setCompletedStages(prev => new Set([...prev, stage]));
        setActiveStage(null);
      }

      if (type === 'pipeline_done') {
        setDone(true);
        setCompletedStages(new Set(['identification', 'screening', 'eligibility', 'inclusion']));
        setActiveStage(null);
        es.close();
        setTimeout(() => fetchReport(), 2000);
      }
    };
    es.onerror = () => { if (!done) setConnectionError('SSE 연결 끊김. 자동 재연결 중...'); };
    return () => { es.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Identification 완료 감지 → completedStages에 추가
  useEffect(() => {
    if (stats.identified > 0 && !completedStages.has('identification')) {
      setCompletedStages(prev => new Set([...prev, 'identification']));
      setActiveStage(null);
    }
  }, [stats.identified]);

  const fetchReport = async () => {
    try {
      const res = await fetch(`${NESTJS_URL}/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.report?.content) { setReport(data.report.content); setActiveTab('report'); }
        if (data.query) setQuery(data.query);
      }
    } catch { /* Non-fatal */ }
  };

  const handleRunStage = async (stage: PrismaStage, criteria: string[]) => {
    setActiveStage(stage);
    try {
      await fetch(`${NESTJS_URL}/api/sessions/${sessionId}/run-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, criteria }),
      });
    } catch {
      setActiveStage(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── 상단 헤더 ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-30">
        <Link href="/" className="text-lg font-light flex-shrink-0" style={{ fontFamily: "var(--font-iris), 'Noto Sans KR', sans-serif" }}>
          <span style={{ color: '#1A3C8F' }}>Ga</span>
          <span style={{ color: '#F37021' }}>ch</span>
          <span style={{ color: '#6DBE45' }}>on</span>
          <span style={{ color: '#000' }}> Scholar</span>
        </Link>
        <div className="flex items-center border border-gray-300 rounded-full px-4 py-1.5 flex-1 max-w-2xl bg-white shadow-sm">
          <img src="/search-icon.png" alt="" className="w-5 h-5 mr-2 flex-shrink-0 object-cover" />
          <span className="text-sm text-gray-700 truncate">{query || sessionId}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {done
            ? <span className="badge-include text-xs px-3 py-1">분석 완료</span>
            : <span className="badge-running text-xs px-3 py-1">분석 중</span>
          }
          <button
            onClick={() => setShowLog(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-full px-3 py-1"
          >
            Live Log
          </button>
          {done && report && (
            <div className="flex border border-gray-200 rounded-full overflow-hidden text-xs">
              <button onClick={() => setActiveTab('papers')} className={`px-3 py-1 transition-colors ${activeTab === 'papers' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>논문</button>
              <button onClick={() => setActiveTab('report')} className={`px-3 py-1 transition-colors ${activeTab === 'report' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>리포트</button>
            </div>
          )}
        </div>
      </div>

      {connectionError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-xs text-yellow-700">{connectionError}</div>
      )}

      <div className="flex flex-1">
        {/* ── 좌측: Agent 상태 ── */}
        <aside className="w-44 flex-shrink-0 bg-white border-r border-gray-100 px-4 py-5">
          <AgentStatusCards agents={agents} />
        </aside>

        {/* ── 중앙: 논문 목록 / 리포트 ── */}
        <main className="flex-1 px-6 py-5 min-w-0 space-y-4">
          {showLog && <div className="card"><LiveLog logs={logs} /></div>}

          {activeTab === 'papers' && (
            papers.length === 0 && !done
              ? <div className="text-center py-20 text-gray-300 text-sm">AI 에이전트가 논문을 분석하고 있습니다...</div>
              : <PaperList papers={papers} query={query} />
          )}

          {activeTab === 'report' && report && <ReviewReport content={report} />}

          {done && !report && (
            <div className="text-center py-12 text-gray-400 text-sm">보고서를 불러오는 중...</div>
          )}
        </main>

        {/* ── 우측: 인터랙티브 PRISMA Flow ── */}
        <aside className="w-64 flex-shrink-0 bg-white border-l border-gray-100 px-4 py-5 overflow-y-auto">
          <PrismaInteractiveFlow
            sessionId={sessionId}
            stats={stats}
            completedStages={completedStages}
            onRunStage={handleRunStage}
            activeStage={activeStage}
          />
        </aside>
      </div>
    </div>
  );
}
