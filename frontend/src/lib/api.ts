const NESTJS_URL = process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000';
const AI_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000';

export interface CreateResearchPayload {
  query: string;
  searchTerms: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
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

/** Returns the SSE URL for direct browser connection to the AI service. */
export function getSSEUrl(sessionId: string): string {
  return `${AI_SERVICE_URL}/stream/${sessionId}`;
}
