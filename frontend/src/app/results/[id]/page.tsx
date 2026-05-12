'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AgentState, AgentStatus } from '@/components/AgentPipeline';
import HeaderSearchBar from '@/components/HeaderSearchBar';
import LiveLog, { LogEntry } from '@/components/LiveLog';
import PaperList, { PaperDecision } from '@/components/PaperList';
import IdentifiedPaperList, { IdentifiedPaper } from '@/components/IdentifiedPaperList';
import ReviewReport from '@/components/ReviewReport';
import Prisma2020Diagram, { PrismaStage } from '@/components/Prisma2020Diagram';
import { getSSEUrl } from '@/lib/api';

const NESTJS_URL = process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000';

// 3개 에이전트 기준
const INITIAL_AGENTS: AgentState[] = [
  {
    name: 'IdentificationAgent',
    label: 'Identification',
    sublabel: 'Steps 1–3 · Gemini',
    status: 'waiting',
    message: '',
  },
  {
    name: 'ScreeningEligibilityAgent',
    label: 'Screening & Eligibility',
    sublabel: 'Steps 4–8 · Gemini + Claude',
    status: 'waiting',
    message: '',
  },
  {
    name: 'WriterAgent',
    label: 'Writer',
    sublabel: 'Steps 9–10 · Claude',
    status: 'waiting',
    message: '',
  },
];

// AI Service 에이전트 이름 → 3개 에이전트 이름 매핑
const AGENT_NAME_MAP: Record<string, string> = {
  IdentificationAgent:  'IdentificationAgent',
  SearchAgent:          'IdentificationAgent',   // 하위 호환
  ScreeningAgent:       'ScreeningEligibilityAgent',
  EligibilityAgent:     'ScreeningEligibilityAgent',
  ExtractionAgent:      'WriterAgent',
  WriterAgent:          'WriterAgent',
};

// 세션 status → 완료된 에이전트 목록
const DONE_AGENTS_BY_STATUS: Record<string, string[]> = {
  running:          [],
  screening_done:   ['IdentificationAgent', 'ScreeningEligibilityAgent'],
  eligibility_done: ['IdentificationAgent', 'ScreeningEligibilityAgent'],
  inclusion_done:   ['IdentificationAgent', 'ScreeningEligibilityAgent'],
  done:             ['IdentificationAgent', 'ScreeningEligibilityAgent', 'WriterAgent'],
};

const INITIAL_STATS = { identified: 0, fetched: 0, duplicates: 0, screened: 0, eligible: 0, included: 0 };

interface SearchTermsInfo {
  pico?: { population?: string; intervention?: string; comparison?: string; outcome?: string };
  mesh_terms?: string[];
  keywords?: string[];
  boolean_query?: string;
}

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

  const [agents, setAgents]           = useState<AgentState[]>(INITIAL_AGENTS);
  const [stats, setStats]             = useState(INITIAL_STATS);
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [papers, setPapers]           = useState<PaperDecision[]>([]);
  const [report, setReport]           = useState<string | null>(null);
  const [done, setDone]               = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [showLog, setShowLog]         = useState(false);
  const [query, setQuery]             = useState('');
  const [keywords, setKeywords]       = useState<string[]>([]);
  const [booleanQuery, setBooleanQuery] = useState('');
  const [activeTab, setActiveTab]     = useState<'identified' | 'papers' | 'report'>('identified');
  const [identifiedPapers, setIdentifiedPapers] = useState<IdentifiedPaper[]>([]);
  const [completedStages, setCompletedStages]   = useState<Set<PrismaStage>>(new Set());
  const [activeStage, setActiveStage]           = useState<PrismaStage | null>(null);
  const [searchTerms, setSearchTerms]           = useState<SearchTermsInfo | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const updateAgent = useCallback((rawName: string, status: AgentStatus, message: string) => {
    const mappedName = AGENT_NAME_MAP[rawName] ?? rawName;
    setAgents(prev => prev.map(a =>
      a.name === mappedName ? { ...a, status, message } : a
    ));
  }, []);

  // 초기 세션 로드 (완료된 세션이면 DB에서 복원)
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${NESTJS_URL}/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.query) setQuery(data.query);
        if (data.keywords?.length) setKeywords(data.keywords);
        if (data.booleanQuery) setBooleanQuery(data.booleanQuery);
        if (data.prismaStats) setStats(data.prismaStats);

        const allPapers: any[] = data.papers || [];

        // 식별된 논문 복원
        const identified = allPapers.filter((p: any) => p.prismaStage === 'identified');
        if (identified.length > 0) {
          setIdentifiedPapers(identified.map((p: any) => ({
            title: p.title, authors: p.authors || [],
            year: p.year, url: p.url,
            abstract: p.abstract || '', venue: p.venue || '',
          })));
          setCompletedStages(prev => new Set([...prev, 'identification']));
          setActiveTab('identified');
        }

        // 중간 단계 논문 복원
        const decidedPapers = allPapers.filter((p: any) => p.prismaStage !== 'identified');
        if (decidedPapers.length > 0) {
          setPapers(decidedPapers.map((p: any) => ({
            title: p.title, decision: p.decision || 'EXCLUDE',
            reason: p.reason || '', stage: p.prismaStage || 'screened',
          })));
          const dbStages = new Set<PrismaStage>(['identification']);
          if (allPapers.some((p: any) => p.prismaStage === 'screened'))  dbStages.add('screening');
          if (allPapers.some((p: any) => p.prismaStage === 'eligible'))  dbStages.add('eligibility');
          if (allPapers.some((p: any) => p.prismaStage === 'included'))  dbStages.add('inclusion');
          setCompletedStages(prev => new Set([...prev, ...dbStages]));
          setActiveTab('papers');
        }

        // 에이전트 상태 복원
        const completedAgents = DONE_AGENTS_BY_STATUS[data.status as string] || [];
        if (completedAgents.length > 0) {
          setAgents(prev => prev.map(a => ({
            ...a,
            status: completedAgents.includes(a.name) ? 'done' as AgentStatus : a.status,
          })));
        }

        if (data.status === 'done') {
          setDone(true);
          setCompletedStages(new Set(['identification', 'screening', 'eligibility', 'inclusion']));
          if (data.report?.content) setReport(data.report.content);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // SSE 구독
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(getSSEUrl(sessionId));
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

      // Identification Agent가 생성한 Search Terms
      if (type === 'search_terms_generated') {
        setSearchTerms({
          pico:         event.pico as SearchTermsInfo['pico'],
          mesh_terms:   event.mesh_terms as string[],
          keywords:     event.keywords as string[],
          boolean_query: event.boolean_query as string,
        });
        if (event.boolean_query) setBooleanQuery(event.boolean_query as string);
      }

      if (type === 'identified_papers') {
        setIdentifiedPapers(event.papers as IdentifiedPaper[]);
        setActiveTab('identified');
      }

      if (type === 'paper_decision') {
        setPapers(prev => [...prev, {
          title:    event.title    as string,
          decision: event.decision as string,
          reason:   event.reason   as string,
          stage:    event.stage    as string,
        }]);
        setActiveTab(prev => prev === 'identified' ? 'papers' : prev);
      }

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
        setTimeout(fetchReport, 2000);
      }
    };
    es.onerror = () => { if (!done) setConnectionError('SSE 연결 끊김. 자동 재연결 중...'); };
    return () => { es.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // identified 수 확보 시 identification 완료 처리
  useEffect(() => {
    if (stats.identified > 0 && !completedStages.has('identification')) {
      setCompletedStages(prev => new Set([...prev, 'identification']));
      setActiveStage(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch { setActiveStage(null); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── 상단 헤더 ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-4 sticky top-0 z-30">
        <Link href="/" className="text-lg font-light flex-shrink-0" style={{ fontFamily: "var(--font-iris), 'Noto Sans KR', sans-serif" }}>
          <span style={{ color: '#1A3C8F' }}>Ga</span>
          <span style={{ color: '#F37021' }}>ch</span>
          <span style={{ color: '#6DBE45' }}>on</span>
          <span style={{ color: '#000' }}> Scholar</span>
        </Link>
        <HeaderSearchBar defaultQuestion={query || ''} defaultKeywords={keywords} defaultBooleanQuery={booleanQuery} />

        {/* 분석 상태 + 인라인 Agent Pipeline */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            done
              ? 'border-green-200 text-green-600 bg-green-50'
              : 'border-blue-200 text-blue-500 bg-blue-50'
          }`}>
            {done ? '완료' : '분석 중'}
          </span>
          {/* 미니 파이프라인 */}
          <div className="flex items-center gap-1">
            {agents.map((agent, i) => (
              <div key={agent.name} className="flex items-center gap-1">
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  agent.status === 'running' ? 'text-blue-600' :
                  agent.status === 'done'    ? 'text-green-600' :
                  agent.status === 'error'   ? 'text-red-500' :
                  'text-gray-300'
                }`}>
                  <span className={agent.status === 'running' ? 'animate-pulse' : ''}>
                    {agent.status === 'done' ? '✓' : agent.status === 'error' ? '✕' : agent.status === 'running' ? '●' : '○'}
                  </span>
                  <span className="hidden sm:inline">{agent.label}</span>
                </div>
                {i < agents.length - 1 && (
                  <span className={`text-[10px] ${agents[i+1].status !== 'waiting' ? 'text-gray-400' : 'text-gray-200'}`}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowLog(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded-full px-2.5 py-1"
          >
            Log
          </button>
          {/* 탭 전환 */}
          <div className="flex border border-gray-200 rounded-full overflow-hidden text-[10px]">
            {identifiedPapers.length > 0 && (
              <button
                onClick={() => setActiveTab('identified')}
                className={`px-2.5 py-1 transition-colors ${activeTab === 'identified' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                식별 {identifiedPapers.length > 0 && `(${identifiedPapers.length})`}
              </button>
            )}
            {(papers.length > 0 || completedStages.has('identification')) && (
              <button
                onClick={() => setActiveTab('papers')}
                className={`px-2.5 py-1 transition-colors ${activeTab === 'papers' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                심사 {papers.length > 0 ? `(${papers.length})` : ''}
              </button>
            )}
            {report && (
              <button
                onClick={() => setActiveTab('report')}
                className={`px-2.5 py-1 transition-colors ${activeTab === 'report' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                리포트
              </button>
            )}
          </div>
        </div>
      </div>

      {connectionError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-xs text-yellow-700">
          {connectionError}
        </div>
      )}

      <div className="flex flex-1 min-h-0">

        {/* ── 좌측: PRISMA 2020 Flow Diagram ── */}
        <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-100 px-3 py-4 overflow-y-auto">
          <Prisma2020Diagram
            stats={stats}
            completedStages={completedStages}
            onRunStage={handleRunStage}
            activeStage={activeStage}
          />
        </aside>

        {/* ── 중앙: 콘텐츠 ── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {showLog && <div className="card"><LiveLog logs={logs} /></div>}

            {/* Search Terms (Identification 완료 시) */}
            {searchTerms && activeTab === 'identified' && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700">Identification Agent — 생성된 Search Terms</p>
                {searchTerms.keywords && searchTerms.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {searchTerms.keywords.map((t, i) => (
                      <span key={i} className="text-[11px] bg-white border border-blue-200 text-blue-700 rounded-full px-2.5 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
                {searchTerms.boolean_query && (
                  <code className="text-xs bg-white border border-blue-100 rounded-lg px-3 py-2 block text-gray-700 break-all font-mono">
                    {searchTerms.boolean_query}
                  </code>
                )}
              </div>
            )}

            {activeTab === 'identified' && (
              identifiedPapers.length === 0
                ? <div className="text-center py-20 text-gray-300 text-sm">AI 에이전트가 논문을 탐색하고 있습니다...</div>
                : <IdentifiedPaperList papers={identifiedPapers} query={query} />
            )}

            {activeTab === 'papers' && (
              papers.length === 0
                ? (
                  <div className="text-center py-20 text-gray-300 text-sm space-y-2">
                    {activeStage
                      ? <>
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block mb-3" />
                          <p className="text-blue-400">AI가 논문을 심사하고 있습니다...</p>
                          <p className="text-gray-300 text-xs">첫 번째 결과가 곧 표시됩니다</p>
                        </>
                      : <p>좌측 PRISMA Flow에서 Screening을 실행하세요.</p>
                    }
                  </div>
                )
                : <PaperList papers={papers} query={query} isProcessing={!done && !!activeStage} />
            )}

            {activeTab === 'report' && report && <ReviewReport content={report} />}
            {done && !report && activeTab === 'report' && (
              <div className="text-center py-12 text-gray-400 text-sm">보고서를 불러오는 중...</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
