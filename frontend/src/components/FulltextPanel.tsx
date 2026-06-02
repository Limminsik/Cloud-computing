'use client';

import { useRef, useState, useEffect } from 'react';
import { PaperDecision } from './PaperList';

const AI_SERVICE_URL  = process.env.NEXT_PUBLIC_AI_SERVICE_URL  || 'http://localhost:8000';
const NESTJS_URL      = process.env.NEXT_PUBLIC_NESTJS_URL       || 'http://localhost:4000';
const LIBRARY_SEARCH  = 'https://lib.gachon.ac.kr/searchTotal/result?st=KWRD&si=TOTAL&oi=DISP07&os=ASC&q=';

interface UploadState {
  status: 'idle' | 'uploading' | 'done' | 'error';
  chars?: number;
  preview?: string;
  error?: string;
}

interface Props {
  sessionId: string;
  papers: PaperDecision[];          // screened INCLUDE papers
  onReady: () => void;              // callback when user clicks "Eligibility 평가 시작"
}

export default function FulltextPanel({ sessionId, papers, onReady }: Props) {
  const screened = papers.filter(p => p.stage === 'screening' && p.decision === 'INCLUDE');
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Restore upload status on mount — prefer NestJS DB (persistent), fallback to ai-service files
  useEffect(() => {
    fetch(`${NESTJS_URL}/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        const uploads: any[] = data.fulltextUploads ?? [];
        if (uploads.length > 0) {
          const restored: Record<string, UploadState> = {};
          for (const item of uploads) {
            if (item.title) restored[item.title] = { status: 'done', chars: item.chars, preview: item.preview };
          }
          setUploads(restored);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  const setUpload = (title: string, state: UploadState) =>
    setUploads(prev => ({ ...prev, [title]: state }));

  const handleUpload = async (title: string, file: File) => {
    setUpload(title, { status: 'uploading' });
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title);

      const res = await fetch(`${AI_SERVICE_URL}/sessions/${sessionId}/fulltext`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '업로드 실패' }));
        setUpload(title, { status: 'error', error: err.detail });
        return;
      }
      const data = await res.json();
      setUpload(title, { status: 'done', chars: data.chars, preview: data.preview });
      // Persist upload record to DB
      fetch(`${NESTJS_URL}/api/sessions/${sessionId}/fulltext-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, chars: data.chars, preview: data.preview }),
      }).catch(() => {});
    } catch (e: any) {
      setUpload(title, { status: 'error', error: e.message });
    }
  };

  const handleDelete = async (title: string) => {
    await fetch(`${AI_SERVICE_URL}/sessions/${sessionId}/fulltext?title=${encodeURIComponent(title)}`, {
      method: 'DELETE',
    });
    // Remove from NestJS DB
    fetch(`${NESTJS_URL}/api/sessions/${sessionId}/fulltext-upload/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    setUpload(title, { status: 'idle' });
    if (fileRefs.current[title]) fileRefs.current[title]!.value = '';
  };

  const doneCount  = Object.values(uploads).filter(u => u.status === 'done').length;
  const totalCount = screened.length;

  return (
    <div className="space-y-4">
      {/* 헤더 안내 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <p className="font-semibold mb-1">📚 전문 확보 가이드</p>
        <p>1. 아래 <strong>[도서관 검색]</strong> 버튼으로 가천대 중앙도서관에서 논문을 검색하세요.</p>
        <p>2. 원문 PDF를 다운로드한 후 <strong>[PDF 업로드]</strong>로 등록하세요.</p>
        <p>3. 전문이 없어도 Eligibility를 시작할 수 있으나, 전문이 있을 때 더 정확한 평가가 가능합니다.</p>
      </div>

      {/* 통계 */}
      <div className="flex items-center gap-4 px-1 text-xs text-gray-500">
        <span>심사 통과 논문 <strong className="text-gray-700">{totalCount}건</strong></span>
        <span className="text-green-600">✅ 전문 업로드 {doneCount}건</span>
        <span className="text-gray-400">⬜ 미업로드 {totalCount - doneCount}건</span>
      </div>

      {/* 논문 목록 */}
      {screened.length === 0 ? (
        <div className="text-center py-16 text-gray-300 text-sm">
          심사 단계를 먼저 완료해 주세요.
        </div>
      ) : (
        screened.map((paper, i) => {
          const up = uploads[paper.title] ?? { status: 'idle' };
          const libraryUrl = LIBRARY_SEARCH + encodeURIComponent(paper.title);

          return (
            <div key={i} className={`rounded-xl border bg-white transition-all ${
              up.status === 'done' ? 'border-green-200' : 'border-gray-100'
            }`}>
              <div className="px-4 py-3">
                {/* 제목 */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800 leading-snug">
                      {paper.url
                        ? <a href={paper.url} target="_blank" rel="noopener noreferrer"
                            className="hover:text-blue-600 hover:underline transition-colors">
                            {paper.title}
                          </a>
                        : paper.title}
                    </h3>
                    {(paper.year || paper.venue) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {[paper.year, paper.venue].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* 상태 배지 */}
                  <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${
                    up.status === 'done'      ? 'bg-green-100 text-green-700' :
                    up.status === 'uploading' ? 'bg-blue-100 text-blue-600' :
                    up.status === 'error'     ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {up.status === 'done'      ? `✅ 전문 확보 (${(up.chars! / 1000).toFixed(1)}k자)` :
                     up.status === 'uploading' ? '업로드 중...' :
                     up.status === 'error'     ? '오류' :
                     '미업로드'}
                  </span>
                </div>

                {/* 오류 메시지 */}
                {up.status === 'error' && (
                  <p className="mt-1.5 text-[11px] text-red-500">{up.error}</p>
                )}

                {/* 전문 미리보기 */}
                {up.status === 'done' && up.preview && (
                  <div className="mt-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-[10px] text-green-600 font-semibold mb-1">전문 미리보기</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-3 font-mono">
                      {up.preview}
                    </p>
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex items-center gap-2 mt-3">
                  {/* 도서관 검색 */}
                  <a
                    href={libraryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    🔍 도서관 검색
                  </a>

                  {/* PDF 업로드 */}
                  {up.status !== 'done' ? (
                    <>
                      <button
                        onClick={() => fileRefs.current[paper.title]?.click()}
                        disabled={up.status === 'uploading'}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        📎 PDF 업로드
                      </button>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        ref={el => { fileRefs.current[paper.title] = el; }}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(paper.title, f);
                        }}
                      />
                    </>
                  ) : (
                    <button
                      onClick={() => handleDelete(paper.title)}
                      className="text-[11px] px-3 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors"
                    >
                      🗑 삭제
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Eligibility 시작 버튼 */}
      {screened.length > 0 && (
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            {doneCount > 0
              ? `${doneCount}건 전문 확보 완료 · ${totalCount - doneCount}건은 초록 기반으로 평가됩니다.`
              : '전문 없이 초록만으로 평가합니다. PDF를 업로드하면 더 정확합니다.'}
          </p>
          <button
            onClick={onReady}
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Eligibility 평가 시작 →
          </button>
        </div>
      )}
    </div>
  );
}
