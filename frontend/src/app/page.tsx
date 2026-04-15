import SearchForm from '@/components/SearchForm';
import { listSessions } from '@/lib/api';
import Link from 'next/link';

async function RecentSessions() {
  let sessions: Awaited<ReturnType<typeof listSessions>> = [];
  try {
    sessions = await listSessions();
  } catch {
    // Backend may not be running during SSR
    sessions = [];
  }

  if (sessions.length === 0) return null;

  const statusBadge = (s: string) => {
    if (s === 'done') return <span className="badge-include">완료</span>;
    if (s === 'running') return <span className="badge-running">실행 중</span>;
    if (s === 'error') return <span className="badge-exclude">오류</span>;
    return <span className="text-xs text-gray-400">{s}</span>;
  };

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        최근 연구 세션
      </h2>
      <div className="space-y-2">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/results/${s.id}`}
            className="card flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all group"
          >
            <div>
              <p className="font-medium text-gray-800 group-hover:text-blue-700 transition-colors">
                {s.query}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(s.createdAt).toLocaleString('ko-KR')}
                {s.prismaStats && (
                  <span className="ml-2">
                    · Identified {(s.prismaStats as { identified?: number }).identified ?? 0} /
                    Included {(s.prismaStats as { included?: number }).included ?? 0}
                  </span>
                )}
              </p>
            </div>
            {statusBadge(s.status)}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          PRISMA 기반 자동 문헌 고찰
        </h2>
        <p className="text-gray-500">
          AI 멀티 에이전트가 체계적 문헌 고찰(Systematic Review)을 자동으로 수행합니다.
        </p>
        <div className="flex justify-center gap-6 mt-4 text-sm text-gray-400">
          <span>Agent 1: Gemini Search</span>
          <span>·</span>
          <span>Agent 2-4: Claude Review</span>
          <span>·</span>
          <span>Agent 5: Claude Writing</span>
        </div>
      </div>

      <div className="card">
        <SearchForm />
      </div>

      <RecentSessions />
    </div>
  );
}
