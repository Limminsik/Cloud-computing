'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AgentState, AgentStatus } from '@/components/AgentPipeline';
import HeaderSearchBar from '@/components/HeaderSearchBar';
import LiveLog, { LogEntry } from '@/components/LiveLog';
import PaperList, { PaperDecision } from '@/components/PaperList';
import EligibilityPaperList from '@/components/EligibilityPaperList';
import FulltextPanel from '@/components/FulltextPanel';
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
  const [activeTab, setActiveTab]     = useState<'identified' | 'papers' | 'fulltext' | 'eligibility' | 'report'>('identified');
  const [identifiedPapers, setIdentifiedPapers] = useState<IdentifiedPaper[]>([]);
  const [completedStages, setCompletedStages]   = useState<Set<PrismaStage>>(new Set());
  const [activeStage, setActiveStage]           = useState<PrismaStage | null>(null);
  const [generatedTerms, setGeneratedTerms]     = useState<any | null>(null);
  const [researchSummary, setResearchSummary]   = useState('');

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
        if (data.generatedTerms) setGeneratedTerms(data.generatedTerms);
        if (data.researchSummary) setResearchSummary(data.researchSummary);

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

        // 중간 단계 논문 복원 (screening / eligible / included)
        const decidedPapers = allPapers.filter((p: any) => p.prismaStage !== 'identified');
        if (decidedPapers.length > 0) {
          setPapers(decidedPapers.map((p: any) => ({
            title:               p.title,
            decision:            p.decision || 'EXCLUDE',
            reason:              p.reason   || '',
            stage:               (p.prismaStage === 'eligible' || p.prismaStage === 'included')
                               ? 'eligibility' : 'screening',
            url:                 p.url      ?? null,
            article_type:            (p.extractedData as any)?.article_type            ?? null,
            exclude_reason_category: (p.extractedData as any)?.exclude_reason_category ?? null,
            pico:                    (p.extractedData as any)?.pico                    ?? null,
            key_findings:            (p.extractedData as any)?.key_findings            ?? null,
            limitations:             (p.extractedData as any)?.limitations             ?? null,
            full_text_available:     (p.extractedData as any)?.full_text_available     ?? null,
            full_text_source:        (p.extractedData as any)?.full_text_source        ?? null,
            full_text_snippet:       (p.extractedData as any)?.full_text_snippet       ?? null,
          })));

          const dbStages = new Set<PrismaStage>(['identification']);
          const hasScreened  = allPapers.some((p: any) => p.prismaStage === 'screened');
          const hasEligible  = allPapers.some((p: any) => p.prismaStage === 'eligible');
          const hasIncluded  = allPapers.some((p: any) => p.prismaStage === 'included');
          if (hasScreened)  dbStages.add('screening');
          if (hasEligible)  dbStages.add('eligibility');
          if (hasIncluded)  dbStages.add('inclusion');
          setCompletedStages(prev => new Set([...prev, ...dbStages]));

          // 가장 진행된 탭으로 이동
          if (hasEligible || hasIncluded) setActiveTab('eligibility');
          else if (hasScreened)           setActiveTab('papers');
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
        const gt = {
          domain:        event.domain,
          reasoning:     event.reasoning,
          pico:          event.pico,
          mesh_terms:    event.mesh_terms,
          keywords:      event.keywords,
          boolean_query: event.boolean_query,
          concept_groups: event.concept_groups,
        };
        setGeneratedTerms(gt);
        if (event.boolean_query) setBooleanQuery(event.boolean_query as string);
        if (event.reasoning && !researchSummary) setResearchSummary(event.reasoning as string);
      }

      if (type === 'identified_papers') {
        setIdentifiedPapers(event.papers as IdentifiedPaper[]);
        setActiveTab('identified');
      }

      if (type === 'paper_decision' && event.stage === 'eligibility') {
        setActiveTab('eligibility');
      }

      if (type === 'paper_decision') {
        setPapers(prev => [...prev, {
          title:               event.title               as string,
          decision:            event.decision            as string,
          reason:              event.reason              as string,
          stage:               event.stage               as string,
          url:                 event.url                 as string | null | undefined,
          year:                    event.year                    as number | null | undefined,
          venue:                   event.venue                   as string | null | undefined,
          article_type:            event.article_type            as string | null | undefined,
          exclude_reason_category: event.exclude_reason_category as string | null | undefined,
          pico:                    event.pico                    as PaperDecision['pico'],
          key_findings:            event.key_findings            as string | null | undefined,
          limitations:             event.limitations             as string | null | undefined,
          full_text_available:     event.full_text_available     as boolean | null | undefined,
          full_text_source:        event.full_text_source        as string | null | undefined,
          full_text_snippet:       event.full_text_snippet       as string | null | undefined,
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

  // done=true 인데 report가 없으면 최대 10초간 polling
  useEffect(() => {
    if (!done || report) return;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${NESTJS_URL}/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.report?.content) {
            setReport(data.report.content);
            clearInterval(id);
          }
        }
      } catch { /* ignore */ }
      if (attempts >= 5) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, report]);

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

  const handleRunStage = async (stage: PrismaStage | 'writer', criteria: string[]) => {
    setActiveStage(stage as PrismaStage);
    if (stage === 'eligibility') setActiveTab('eligibility');
    else if (stage === 'writer') setActiveTab('report');
    try {
      await fetch(`${NESTJS_URL}/api/sessions/${sessionId}/run-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, criteria }),
      });
    } catch { setActiveStage(null); }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">

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
          {/* 현재 탭 표시 (읽기 전용 — 좌측 PRISMA 다이어그램으로 이동) */}
          <div className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-3 py-1">
            {{
              identified: `식별 (${identifiedPapers.length})`,
              papers:     `심사 (${papers.filter(p => p.stage === 'screening').length})`,
              fulltext:   '전문 확보',
              eligibility:`적격성 (${papers.filter(p => p.stage === 'eligibility').length})`,
              report:     '리포트',
            }[activeTab]}
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
        <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-100 px-3 py-4 overflow-y-auto h-full">
          <Prisma2020Diagram
            stats={stats}
            completedStages={completedStages}
            onRunStage={handleRunStage}
            activeStage={activeStage}
            done={done}
            onSelectStage={(tab) => setActiveTab(tab)}
          />
        </aside>

        {/* ── 중앙: 콘텐츠 ── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* 고정 헤더 카드 영역 */}
          <div className="flex-shrink-0 px-6 pt-5 space-y-3">
            {showLog && <div className="card"><LiveLog logs={logs} /></div>}

            {/* Identification Analysis Card */}
            {query && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-700">
                    Research Question
                    <span className="ml-1.5 text-[10px] font-normal text-gray-400">— Identification Agent</span>
                  </p>
                  {generatedTerms?.domain && (
                    <span className="text-[11px] bg-blue-100 text-blue-600 rounded-full px-2.5 py-0.5">{generatedTerms.domain}</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed bg-white border border-blue-100 rounded-lg px-3 py-2">
                  {researchSummary || query}
                </p>
              </div>
            )}
          </div>

          {/* 스크롤 가능한 탭 콘텐츠 — 항상 동일한 높이 유지 */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {activeTab === 'identified' && (
              identifiedPapers.length === 0
                ? <div className="text-center py-20 text-gray-300 text-sm">AI 에이전트가 논문을 탐색하고 있습니다...</div>
                : <IdentifiedPaperList papers={identifiedPapers} query={query} />
            )}

            {activeTab === 'papers' && (
              papers.filter(p => p.stage === 'screening').length === 0
                ? (
                  <div className="text-center py-20 text-gray-300 text-sm space-y-2">
                    {activeStage === 'screening'
                      ? <>
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block mb-3" />
                          <p className="text-blue-400">AI가 논문을 심사하고 있습니다...</p>
                          <p className="text-gray-300 text-xs">첫 번째 결과가 곧 표시됩니다</p>
                        </>
                      : <p>좌측 PRISMA Flow에서 Screening을 실행하세요.</p>
                    }
                  </div>
                )
                : <PaperList papers={papers.filter(p => p.stage === 'screening')} query={query} isProcessing={activeStage === 'screening'} />
            )}

            {activeTab === 'fulltext' && (
              <FulltextPanel
                sessionId={sessionId}
                papers={papers}
                onReady={() => { handleRunStage('eligibility', []); setActiveTab('eligibility'); }}
              />
            )}

            {activeTab === 'eligibility' && (
              <EligibilityPaperList papers={papers} query={query} />
            )}

            {activeTab === 'report' && report && <ReviewReport content={report} />}
            {done && !report && activeTab === 'report' && (
              <div className="text-center py-12 space-y-3">
                <p className="text-gray-400 text-sm">보고서를 불러오는 중...</p>
                <button
                  onClick={fetchReport}
                  className="text-xs text-blue-500 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50"
                >
                  새로고침
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
