'use client';

interface PrismaStats {
  identified: number;
  screened: number;
  eligible: number;
  included: number;
}

interface Props {
  stats: PrismaStats;
}

export default function PrismaFlowDiagram({ stats }: Props) {
  const stages = [
    {
      label: 'Identification',
      sublabel: '논문 식별',
      count: stats.identified,
      color: 'bg-purple-100 border-purple-300 text-purple-800',
      dot: 'bg-purple-500',
    },
    {
      label: 'Screening',
      sublabel: '1차 선별',
      count: stats.screened,
      color: 'bg-blue-100 border-blue-300 text-blue-800',
      dot: 'bg-blue-500',
    },
    {
      label: 'Eligibility',
      sublabel: '적격성 평가',
      count: stats.eligible,
      color: 'bg-amber-100 border-amber-300 text-amber-800',
      dot: 'bg-amber-500',
    },
    {
      label: 'Included',
      sublabel: '최종 포함',
      count: stats.included,
      color: 'bg-green-100 border-green-300 text-green-800',
      dot: 'bg-green-500',
    },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        PRISMA Flow
      </h2>
      <div className="flex items-center gap-1">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center flex-1">
            <div
              className={`flex-1 border-2 rounded-xl p-3 text-center transition-all duration-500 ${stage.color}`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                <span className="text-xs font-semibold">{stage.label}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums">{stage.count}</div>
              <div className="text-xs opacity-70">{stage.sublabel}</div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex flex-col items-center mx-1">
                <div className="text-gray-300 text-lg">›</div>
                {i < stages.length - 1 && (
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    -{stages[i].count - stages[i + 1].count > 0
                      ? stages[i].count - stages[i + 1].count
                      : 0}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
