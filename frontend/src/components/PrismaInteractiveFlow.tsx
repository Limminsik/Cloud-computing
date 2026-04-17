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

interface StageState {
  status: 'waiting' | 'running' | 'done' | 'ready';
  criteria: string;
}

interface Props {
  sessionId: string;
  stats: PrismaStats;
  completedStages: Set<PrismaStage>;
  onRunStage: (stage: PrismaStage, criteria: string[]) => void;
  activeStage: PrismaStage | null;
}

const STAGE_INFO = [
  {
    key: 'identification' as PrismaStage,
    label: 'Identification',
    sublabel: '논문 식별',
    statKey: 'identified' as keyof PrismaStats,
    color: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', dot: 'bg-purple-400' },
    description: '검색 엔진을 통해 식별된 논문',
    criteriaPlaceholder: '예: 2020년 이후 논문, 영어 논문만',
    nextStage: 'screening' as PrismaStage,
    nextLabel: 'Screening 기준 입력 후 실행',
  },
  {
    key: 'screening' as PrismaStage,
    label: 'Screening',
    sublabel: '1차 선별',
    statKey: 'screened' as keyof PrismaStats,
    color: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', dot: 'bg-blue-400' },
    description: '제목 및 초록 기반 선별',
    criteriaPlaceholder: '예: 임상 연구 포함, 리뷰 논문 제외',
    nextStage: 'eligibility' as PrismaStage,
    nextLabel: 'Eligibility 기준 입력 후 실행',
  },
  {
    key: 'eligibility' as PrismaStage,
    label: 'Eligibility',
    sublabel: '적격성 평가',
    statKey: 'eligible' as keyof PrismaStats,
    color: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', dot: 'bg-amber-400' },
    description: '전문 검토 기반 적격성 평가',
    criteriaPlaceholder: '예: 샘플 수 50명 이상, 대조군 포함',
    nextStage: 'inclusion' as PrismaStage,
    nextLabel: 'Inclusion 기준 입력 후 최종 선정',
  },
  {
    key: 'inclusion' as PrismaStage,
    label: 'Included',
    sublabel: '최종 포함',
    statKey: 'included' as keyof PrismaStats,
    color: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', dot: 'bg-green-400' },
    description: '체계적 문헌 고찰에 포함된 논문',
    criteriaPlaceholder: '예: 핵심 결과 변수 포함, 편향 위험 낮음',
    nextStage: null,
    nextLabel: '리뷰 리포트 생성',
  },
];

export default function PrismaInteractiveFlow({ stats, completedStages, onRunStage, activeStage }: Props) {
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({
    screening: '',
    eligibility: '',
    inclusion: '',
  });

  const isStageRunnable = (stageKey: PrismaStage): boolean => {
    if (stageKey === 'screening') return completedStages.has('identification') && !completedStages.has('screening');
    if (stageKey === 'eligibility') return completedStages.has('screening') && !completedStages.has('eligibility');
    if (stageKey === 'inclusion') return completedStages.has('eligibility') && !completedStages.has('inclusion');
    return false;
  };

  const handleRun = (stageKey: PrismaStage) => {
    const input = stageInputs[stageKey] || '';
    const criteria = input.split('\n').map(s => s.trim()).filter(Boolean);
    onRunStage(stageKey, criteria);
  };

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        PRISMA Flow
      </p>

      {STAGE_INFO.map((stage, i) => {
        const count = stats[stage.statKey];
        const isDone = completedStages.has(stage.key);
        const isRunning = activeStage === stage.key;
        const canRun = isStageRunnable(stage.key);
        const prevCount = i > 0 ? stats[STAGE_INFO[i - 1].statKey] : null;
        const excluded = prevCount !== null ? Math.max(0, prevCount - count) : null;

        return (
          <div key={stage.key}>
            {/* 화살표 + 제외 수 */}
            {i > 0 && (
              <div className="flex items-center justify-center py-1 gap-1">
                <div className="w-px h-4 bg-gray-200" />
                {excluded !== null && excluded > 0 && (
                  <span className="text-[10px] text-red-400 font-medium">−{excluded}건 제외</span>
                )}
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
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isDone || isRunning ? stage.color.dot : 'bg-gray-300'}`} />
                  <span className={`text-xs font-semibold ${isDone || isRunning ? stage.color.text : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                  {isRunning && (
                    <span className="text-[10px] text-blue-500 animate-pulse">실행 중...</span>
                  )}
                  {isDone && (
                    <span className="text-[10px] text-green-600">✓</span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold tabular-nums ${isDone || isRunning ? stage.color.text : 'text-gray-300'}`}>
                    {stage.key === 'identification' && stats.identified > 0
                      ? stats.identified.toLocaleString()
                      : count}
                  </span>
                  {stage.key === 'identification' && stats.fetched !== undefined && stats.fetched > 0 && stats.fetched !== stats.identified && (
                    <p className="text-[9px] text-gray-400 leading-none mt-0.5">수집 {stats.fetched}건</p>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-gray-400 mb-2">{stage.description}</p>

              {/* 기준 입력 — 실행 가능한 단계에만 표시 */}
              {canRun && stage.key !== 'identification' && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={stageInputs[stage.key] || ''}
                    onChange={e => setStageInputs(prev => ({ ...prev, [stage.key]: e.target.value }))}
                    placeholder={stage.criteriaPlaceholder}
                    rows={2}
                    className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white placeholder-gray-300"
                  />
                  <button
                    onClick={() => handleRun(stage.key)}
                    className={`w-full text-xs font-medium py-1.5 rounded-lg transition-colors ${stage.color.bg} ${stage.color.border} border ${stage.color.text} hover:opacity-80`}
                  >
                    ▶ {stage.nextLabel}
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
