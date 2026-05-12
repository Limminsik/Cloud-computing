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
  onRunStage: (stage: PrismaStage, criteria: string[]) => void;
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

export default function Prisma2020Diagram({ stats, completedStages, activeStage, onRunStage }: Props) {
  const [inputs, setInputs] = useState({ screening: '', eligibility: '', inclusion: '' });

  const id  = completedStages.has('identification');
  const sc  = completedStages.has('screening');
  const el  = completedStages.has('eligibility');
  const inc = completedStages.has('inclusion');

  const fetched   = stats.fetched ?? stats.identified;
  const dupes     = id && stats.duplicates != null ? stats.duplicates : null;
  const excScreen = sc  ? Math.max(0, fetched - stats.screened) : null;
  const excElig   = el  ? Math.max(0, stats.screened - stats.eligible) : null;
  const excInc    = inc ? Math.max(0, stats.eligible - stats.included) : null;

  const canRun = (stage: PrismaStage) => {
    if (stage === 'screening')   return id  && !sc  && activeStage !== 'screening';
    if (stage === 'eligibility') return sc  && !el  && activeStage !== 'eligibility';
    if (stage === 'inclusion')   return el  && !inc && activeStage !== 'inclusion';
    return false;
  };

  const handleRun = (stage: 'screening' | 'eligibility' | 'inclusion') => {
    const criteria = inputs[stage].split('\n').map(s => s.trim()).filter(Boolean);
    onRunStage(stage, criteria);
  };

  return (
    <div className="select-none">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-4">PRISMA 2020</p>

      {/* ── Identification ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Identification</p>
      <div className="border border-gray-100 rounded-md px-2.5 py-2 space-y-0.5">
        <Row label="Records identified" n={id ? stats.identified : null} active={id} />
        <Row label="Duplicates removed" n={id ? dupes : null} indent active={id && dupes != null} />
      </div>
      <VLine active={id} />
      <div className="border border-gray-100 rounded-md px-2.5 py-2">
        <Row label="Records retrieved" n={id ? fetched : null} active={id} />
      </div>

      <VLine active={id} />

      {/* ── Screening ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Screening</p>
      <div className={`border rounded-md px-2.5 py-2 space-y-0.5 transition-colors ${
        activeStage === 'screening' ? 'border-blue-200' : 'border-gray-100'
      }`}>
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

      {/* ── Eligibility ── */}
      <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Eligibility</p>
      <div className={`border rounded-md px-2.5 py-2 space-y-0.5 transition-colors ${
        activeStage === 'eligibility' ? 'border-blue-200' : 'border-gray-100'
      }`}>
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
      <div className="border border-gray-100 rounded-md px-2.5 py-2 space-y-0.5">
        <Row label="Studies included" n={inc ? stats.included : null} active={inc} />
        {excInc != null && excInc > 0 && (
          <Row label="Excluded" n={excInc} indent active={inc} />
        )}
      </div>

      {canRun('inclusion') && (
        <div className="mt-1.5 space-y-1">
          <textarea rows={2} value={inputs.inclusion}
            onChange={e => setInputs(p => ({ ...p, inclusion: e.target.value }))}
            placeholder="리포트 관점/강조 사항 (선택)"
            className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white placeholder-gray-300" />
          <button onClick={() => handleRun('inclusion')}
            className="w-full text-[10px] font-medium py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            리포트 생성
          </button>
        </div>
      )}
      {activeStage === 'inclusion' && (
        <p className="text-[9px] text-blue-400 animate-pulse text-center mt-1">진행 중...</p>
      )}
    </div>
  );
}
