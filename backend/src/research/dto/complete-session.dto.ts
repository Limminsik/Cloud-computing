export class CompleteSessionDto {
  prisma_stats: {
    identified: number;
    screened: number;
    eligible: number;
    included: number;
  };

  included_papers: Array<{
    title: string;
    authors: string[];
    year?: number;
    url?: string;
    abstract?: string;
    venue?: string;
    prisma_stage: string;
    decision?: string;
    reason?: string;
    extracted_data?: Record<string, any>;
  }>;

  review_report: string;
}
