'use client';

import { useState } from 'react';

export type PrismaStage = 'identification' | 'screening' | 'eligibility' | 'inclusion';

export interface PrismaStats {
  identified: number;
  fetched?: number;
  screened: number;
  eligible: number;
  included: number;
}

interface Props {
  sessionId: string;
  stats: PrismaStats;
  completedStages: Set<PrismaStage>;
  onRunStage: (stage: PrismaStage, criteria: string[]) => void;
  activeStage: PrismaStage | null;
}

// PRISMA 2020 기준 4개 박스 — Screening & Eligibility는 하나의 에이전트가 담당
const STAGE_INFO = [
  {
    key: 'identification' as PrismaStage,
    label: 'Identification',
    sublabel: 'Steps 1–3',
    agentLabel: 'Identification Agent',
    statKey: 'identified' as keyof PrismaStats,
    color: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', dot: 'bg-blue-400' },
    description: 'Research Question → Search Terms 변환 후 PubMed · Semantic Scholar · Google Scholar 병렬 검색 및 중복 제거',
    runnable: false,
  },
  {
    key: 'screening' as PrismaStage,
    label: 'Screening',
    sublabel: 'Steps 4–5',
    agentLabel: 'Screening & Eligibility Agent',
    statKey: 'screened' as keyof PrismaStats,
    color: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', dot: 'bg-yellow-400' },
    description: 'Gemini가 제목·초록 기반으로 1차 선별 (포함/제외 기준 적용)',
    criteriaPlaceholder: '예: 2020년 이후 논문, 영어 논문만, 임상 연구 포함',
    runTrigger: 'screening' as PrismaStage,
    runLabel: 'Screening 실행',
  },
  {
    key: 'eligibility' as PrismaStage,
    label: 'Eligibility',
    sublabel: 'Steps 6–8',
    agentLabel: 'Screening & Eligibility Agent',
    statKey: 'eligible' as keyof PrismaStats,
    color: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', dot: 'bg-orange-400' },
    description: 'Claude가 전문(PDF·HTML·arXiv)을 직접 읽고 5기준 적격성 심층 평가',
    criteriaPlaceholder: '예: 샘플 수 50명 이상, 대조군 포함, 편향 위험 낮음',
    runTrigger: 'eligibility' as PrismaStage,
    runLabel: 'Eligibility 실행',
  },
  {
    key: 'inclusion' as PrismaStage,
    label: 'Included',
    sublabel: 'Steps 9–10',
    agentLabel: 'Writer Agent',
    statKey: 'included' as keyof PrismaStats,
    color: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', dot: 'bg-green-400' },
    description: 'Claude가 포함 논문 데이터를 추출하고 PRISMA 형식 문헌 고찰 리포트 생성',
    criteriaPlaceholder: '예: 핵심 결과 변수 포함, 리포트에 강조할 관점',
    runTrigger: 'inclusion' as PrismaStage,
    runLabel: '리포트 생성',
  },
];

export default function PrismaInteractiveFlow({ stats, completedStages, onRunStage, activeStage }: Props) {
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({
    screening: '', eligibility: '', inclusion: '',
  });

  const isStageRunnable = (stageKey: PrismaStage): boolean => {
    if (stageKey === 'screening')  return completedStages.has('identification') && !completedStages.has('screening');
    if (stageKey === 'eligibility') return completedStages.has('screening') && !completedStages.has('eligibility');
    if (stageKey === 'inclusion')  return completedStages.has('eligibility') && !completedStages.has('inclusion');
    return false;
  };

  const handleRun = (triggerStage: PrismaStage, inputKey: string) => {
    const criteria = (stageInputs[inputKey] || '').split('\n').map(s => s.trim()).filter(Boolean);
    onRunStage(triggerStage, criteria);
  };

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        PRISMA 2020 Flow
      </p>

      {STAGE_INFO.map((stage, i) => {
        const count   = stats[stage.statKey] ?? 0;
        const isDone  = completedStages.has(stage.key);
        const isRunning = activeStage === (stage as any).runTrigger;
        const canRun  = 'runTrigger' in stage && isStageRunnable((stage as any).runTrigger);
        const prevCount = i > 0 ? (stats[STAGE_INFO[i - 1].statKey] ?? null) : null;
        const excluded  = prevCount !== null ? Math.max(0, prevCount - count) : null;

        return (
          <div key={stage.key}>
            {/* 연결선 + 제외 수 */}
            {i > 0 && (
              <div className="flex flex-col items-center py-1 gap-0.5">
                <div className="w-px h-2 bg-gray-200" />
                {excluded !== null && excluded > 0 && (
                  <span className="text-[9px] text-red-400 font-medium">−{excluded}건 제외</span>
                )}
                <div className="w-px h-2 bg-gray-200" />
              </div>
            )}

            {/* 단계 박스 */}
            <div className={`rounded-xl border-2 p-3 transition-all duration-300 ${
              isRunning
                ? `${stage.color.border} ${stage.color.bg} shadow-md`
                : isDone
                  ? `${stage.color.border} ${stage.color.bg}`
                  : 'border-gray-200 bg-gray-50'
            }`}>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDone || isRunning ? stage.color.dot : 'bg-gray-300'}`} />
                  <div>
                    <span className={`text-xs font-semibold ${isDone || isRunning ? stage.color.text : 'text-gray-400'}`}>
                      {stage.label}
                    </span>
                    <span className={`ml-1 text-[9px] ${isDone || isRunning ? stage.color.text : 'text-gray-300'}`}>
                      {stage.sublabel}
                    </span>
                  </div>
                  {isRunning && <span className="text-[9px] text-blue-500 animate-pulse ml-1">실행 중</span>}
                  {isDone    && <span className="text-[9px] text-green-600 ml-1">✓</span>}
                </div>
                <span className={`text-base font-bold tabular-nums ${isDone || isRunning ? stage.color.text : 'text-gray-300'}`}>
                  {stage.key === 'identification' && stats.identified > 0
                    ? stats.identified.toLocaleString()
                    : count > 0 ? count : '—'}
                </span>
              </div>

              {/* identified 보조 수치 */}
              {stage.key === 'identification' && (stats.fetched ?? 0) > 0 && stats.fetched !== stats.identified && (
                <p className="text-[9px] text-gray-400 mb-1 text-right">수집 {stats.fetched}건</p>
              )}

              {/* 설명 */}
              <p className="text-[10px] text-gray-400 leading-relaxed mb-2">{stage.description}</p>

              {/* 담당 에이전트 */}
              <p className="text-[9px] text-gray-300 italic">{stage.agentLabel}</p>

              {/* 기준 입력 + 실행 버튼 */}
              {canRun && 'runTrigger' in stage && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={stageInputs[(stage as any).runTrigger] || ''}
                    onChange={e => setStageInputs(prev => ({ ...prev, [(stage as any).runTrigger]: e.target.value }))}
                    placeholder={(stage as any).criteriaPlaceholder}
                    rows={2}
                    className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white placeholder-gray-300"
                  />
                  <button
                    onClick={() => handleRun((stage as any).runTrigger, (stage as any).runTrigger)}
                    className={`w-full text-xs font-semibold py-1.5 rounded-lg transition-colors border ${stage.color.bg} ${stage.color.border} ${stage.color.text} hover:opacity-80`}
                  >
                    ▶ {(stage as any).runLabel}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
