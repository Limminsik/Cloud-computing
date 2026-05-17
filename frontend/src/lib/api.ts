const NESTJS_URL = process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000';
const AI_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000';

export interface CreateResearchPayload {
  query: string;
  keywords?: string[];
  booleanQuery?: string;
  searchTerms: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  researchSummary?: string;
  generatedTerms?: Record<string, unknown>;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  url?: string;
  abstract?: string;
  venue?: string;
  prismaStage: string;
  decision?: string;
  reason?: string;
  extractedData?: Record<string, unknown>;
}

export interface ResearchSession {
  id: string;
  query: string;
  searchTerms: string[];
  status: string;
  createdAt: string;
  prismaStats?: {
    identified: number;
    screened: number;
    eligible: number;
    included: number;
  };
  papers?: Paper[];
  report?: { content: string };
}

export interface SearchTerms {
  domain?: string;
  reasoning?: string;
  concept_groups?: { concept: string; synonyms: string[] }[];
  pico?: { population?: string; intervention?: string; comparison?: string; outcome?: string };
  mesh_terms?: string[];
  keywords?: string[];
  boolean_query?: string;
}

export async function previewSearch(boolean_query: string, research_question: string): Promise<{
  status: string;
  query: string;
  counts: { pubmed: number | null; semantic_scholar: number | null };
}> {
  const res = await fetch(`${AI_SERVICE_URL}/pipeline/preview-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boolean_query, research_question }),
  });
  if (!res.ok) throw new Error(`preview-search failed: ${res.statusText}`);
  return res.json();
}

export async function generateTerms(research_question: string, keywords?: string[]): Promise<{ status: string; terms: SearchTerms | null; message?: string }> {
  const res = await fetch(`${AI_SERVICE_URL}/pipeline/generate-terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ research_question, keywords: keywords ?? [] }),
  });
  if (!res.ok) throw new Error(`generate-terms failed: ${res.statusText}`);
  return res.json();
}

export async function createResearch(payload: CreateResearchPayload): Promise<{ sessionId: string }> {
  const res = await fetch(`${NESTJS_URL}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create research: ${res.statusText}`);
  return res.json();
}

export async function getSession(id: string): Promise<ResearchSession> {
  const res = await fetch(`${NESTJS_URL}/api/sessions/${id}`);
  if (!res.ok) throw new Error(`Session not found: ${res.statusText}`);
  return res.json();
}

export async function listSessions(): Promise<ResearchSession[]> {
  const res = await fetch(`${NESTJS_URL}/api/sessions`);
  if (!res.ok) throw new Error('Failed to list sessions');
  return res.json();
}

export async function updateResearchSummary(sessionId: string, researchSummary: string): Promise<void> {
  const res = await fetch(`${NESTJS_URL}/api/sessions/${sessionId}/research-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ researchSummary }),
  });
  if (!res.ok) throw new Error('Failed to update research summary');
}

/** Returns the SSE URL for direct browser connection to the AI service. */
export function getSSEUrl(sessionId: string): string {
  return `${AI_SERVICE_URL}/stream/${sessionId}`;
}
