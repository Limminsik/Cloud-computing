'use client';

import { useState } from 'react';

export type PrismaStage = 'identification' | 'screening' | 'eligibility' | 'inclusion';

export interface PrismaStats {
  identified: number;
  fetched?: number;
  duplicates?: number;
  screened: number;
  eligible: number;
  included: number;
}

interface Props {
  stats: PrismaStats;
  completedStages: Set<PrismaStage>;
  activeStage: PrismaStage | null;
  done?: boolean;
  onRunStage: (stage: PrismaStage | 'writer', criteria: string[]) => void;
  onSelectStage?: (tab: 'identified' | 'papers' | 'fulltext' | 'eligibility' | 'report') => void;
}

function VLine({ active }: { active?: boolean }) {
  return <div className={`mx-auto w-px h-4 ${active ? 'bg-gray-300' : 'bg-gray-100'}`} />;
}

function Row({
  label, n, note, indent, active,
}: {
  label: string; n?: number | null; note?: string; indent?: boolean; active?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 py-0.5 ${indent ? 'pl-3' : ''}`}>
      <span className={`text-[10px] leading-tight ${active ? 'text-gray-700' : 'text-gray-400'}`}>
        {indent && <span className="mr-1 text-gray-300">└</span>}
        {label}
        {note && <span className="ml-1 text-[9px] text-gray-300">({note})</span>}
      </span>
      <span className={`text-[11px] tabular-nums font-medium flex-shrink-0 ${active ? 'text-gray-800' : 'text-gray-300'}`}>
        {n == null ? '—' : n.toLocaleString()}
      </span>
    </div>
  );
}

export default function Prisma2020Diagram({ stats, completedStages, activeStage, done, onRunStage, onSelectStage }: Props) {
  const [inputs, setInputs] = useState({ screening: '', eligibility: '', writer: '' });

  const id  = completedStages.has('identification');
  const sc  = completedStages.has('screening');
  const el  = completedStages.has('eligibility');
  const inc = completedStages.has('inclusion');

  const fetched   = stats.fetched ?? stats.identified;
  const dupes     = id && stats.duplicates != null ? stats.duplicates : null;
  const excScreen = sc  ? Math.max(0, fetched - stats.screened) : null;
  const excElig   = el  ? Math.max(0, stats.screened - stats.eligible) : null;
  const excInc    = inc ? Math.max(0, stats.eligible - stats.included) : null;

  const canRun = (stage: PrismaStage | 'writer') => {
    if (stage === 'screening')   return id  && !sc  && activeStage !== 'screening';
    if (stage === 'eligibility') return sc  && !el  && activeStage !== 'eligibility';
    if (stage === 'writer')      return el  && !done && activeStage !== 'inclusion';
    return false;
  };

  const handleRun = (stage: 'screening' | 'eligibility' | 'writer') => {
    const criteria = inputs[stage].split('\n').map(s => s.trim()).filter(Boolean);
    onRunStage(stage, criteria);
  };

  const clickable = (tab: 'identified' | 'papers' | 'fulltext' | 'eligibility' | 'report', enabled: boolean) =>
    enabled && onSelectStage
      ? { onClick: () => onSelectStage(tab), className: 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-colors' }
      : {};

  return (
    <div className="select-none">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-4">PRISMA 2020</p>

      {/* ── Identification ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Identification</p>
      <div {...clickable('identified', id)} className={`border border-gray-100 rounded-md px-2.5 py-2 space-y-0.5 ${id && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-colors' : ''}`}>
        <Row label="Records identified" n={id ? stats.identified : null} active={id} />
        <Row label="Duplicates removed" n={id ? dupes : null} indent active={id && dupes != null} />
      </div>
      <VLine active={id} />
      <div {...clickable('identified', id)} className={`border border-gray-100 rounded-md px-2.5 py-2 ${id && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-colors' : ''}`}>
        <Row label="Records retrieved" n={id ? fetched : null} active={id} />
      </div>

      <VLine active={id} />

      {/* ── Screening ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Screening</p>
      <div
        {...clickable('papers', sc)}
        className={`border rounded-md px-2.5 py-2 space-y-0.5 transition-colors ${
          activeStage === 'screening' ? 'border-blue-200' : 'border-gray-100'
        } ${sc && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30' : ''}`}
      >
        <Row label="Records screened" n={id ? fetched : null} active={sc || activeStage === 'screening'} />
        <Row label="Records excluded" n={excScreen} indent active={sc} />
        <Row label="Reports sought" n={sc ? stats.screened : null} active={sc} />
      </div>

      {canRun('screening') && (
        <div className="mt-1.5 space-y-1">
          <textarea rows={2} value={inputs.screening}
            onChange={e => setInputs(p => ({ ...p, screening: e.target.value }))}
            placeholder="포함/제외 기준 (선택)"
            className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white placeholder-gray-300" />
          <button onClick={() => handleRun('screening')}
            className="w-full text-[10px] font-medium py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Screening 실행
          </button>
        </div>
      )}
      {activeStage === 'screening' && (
        <p className="text-[9px] text-blue-400 animate-pulse text-center mt-1">진행 중...</p>
      )}

      <VLine active={sc} />

      {/* ── Full-text 확보 ── */}
      {sc && (
        <>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Full-text</p>
          <div
            {...clickable('fulltext', sc)}
            className={`border rounded-md px-2.5 py-2 transition-colors ${
              'border-gray-100'
            } ${sc && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-2 py-0.5">
              <span className="text-[10px] text-gray-400">전문 확보 (PDF 업로드)</span>
            </div>
          </div>
          <VLine active={sc} />
        </>
      )}

      {/* ── Eligibility ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Eligibility</p>
      <div
        {...clickable('eligibility', el)}
        className={`border rounded-md px-2.5 py-2 space-y-0.5 transition-colors ${
          activeStage === 'eligibility' ? 'border-blue-200' : 'border-gray-100'
        } ${el && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30' : ''}`}
      >
        <Row label="Reports assessed" n={sc ? stats.screened : null} active={el || activeStage === 'eligibility'} />
        <Row label="Reports excluded" n={excElig} indent active={el} />
      </div>

      {canRun('eligibility') && (
        <div className="mt-1.5 space-y-1">
          <textarea rows={2} value={inputs.eligibility}
            onChange={e => setInputs(p => ({ ...p, eligibility: e.target.value }))}
            placeholder="적격성 기준 (선택)"
            className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white placeholder-gray-300" />
          <button onClick={() => handleRun('eligibility')}
            className="w-full text-[10px] font-medium py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Eligibility 실행
          </button>
        </div>
      )}
      {activeStage === 'eligibility' && (
        <p className="text-[9px] text-blue-400 animate-pulse text-center mt-1">진행 중...</p>
      )}

      <VLine active={el} />

      {/* ── Included ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Included</p>
      <div
        {...clickable('report', inc)}
        className={`border border-gray-100 rounded-md px-2.5 py-2 space-y-0.5 ${inc && onSelectStage ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-colors' : ''}`}
      >
        <Row label="Studies included" n={inc ? stats.included : null} active={inc} />
        {excInc != null && excInc > 0 && (
          <Row label="Excluded" n={excInc} indent active={inc} />
        )}
      </div>

      {canRun('writer') && (
        <div className="mt-1.5 space-y-1">
          <button onClick={() => handleRun('writer')}
            className="w-full text-[10px] font-semibold py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            보고서 작성 시작 →
          </button>
        </div>
      )}
      {done && (
        <button onClick={() => onSelectStage?.('report')}
          className="mt-1.5 w-full text-[10px] font-medium py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
          리포트 보기
        </button>
      )}
      {activeStage === 'inclusion' && (
        <p className="text-[9px] text-blue-400 animate-pulse text-center mt-1">보고서 작성 중...</p>
      )}
    </div>
  );
}
