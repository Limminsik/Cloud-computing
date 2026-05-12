'use client';

import { useState } from 'react';

interface Props {
  defaultQuestion?: string;
  defaultKeywords?: string[];
  defaultBooleanQuery?: string;
}

export default function HeaderSearchBar({ defaultQuestion = '', defaultKeywords = [], defaultBooleanQuery = '' }: Props) {
  const [showTerms, setShowTerms] = useState(false);

  return (
    <div className="relative flex-1 max-w-2xl">
      <div className="flex items-center gap-2 border border-gray-200 rounded-2xl px-4 py-1.5 bg-white shadow-sm">
        <img src="/search-icon.png" alt="" className="w-4 h-4 flex-shrink-0 object-cover opacity-60" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 truncate leading-tight">{defaultQuestion || '연구 목적 없음'}</p>
          {defaultKeywords.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate leading-tight">
              {defaultKeywords.join(' · ')}
            </p>
          )}
        </div>
        {defaultBooleanQuery && (
          <button
            onClick={() => setShowTerms(v => !v)}
            className="text-[10px] text-gray-400 hover:text-blue-500 flex-shrink-0 transition-colors"
          >
            {showTerms ? '접기' : '상세'}
          </button>
        )}
      </div>

      {showTerms && defaultBooleanQuery && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 border border-blue-100 rounded-xl px-4 py-2.5 bg-blue-50 shadow-md">
          <p className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Search Terms</p>
          <p className="text-[10px] text-blue-700 font-mono leading-relaxed break-all">{defaultBooleanQuery}</p>
        </div>
      )}
    </div>
  );
}
