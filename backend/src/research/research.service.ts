import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResearchDto } from './dto/create-research.dto';
import { CompleteSessionDto } from './dto/complete-session.dto';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createSession(dto: CreateResearchDto) {
    // 1. Create session in DB
    const session = await this.prisma.researchSession.create({
      data: {
        query: dto.query,
        keywords: dto.keywords || [],
        booleanQuery: dto.booleanQuery || '',
        searchTerms: dto.searchTerms,
        inclusionCriteria: dto.inclusionCriteria,
        exclusionCriteria: dto.exclusionCriteria,
        status: 'running',
        ...(dto.researchSummary ? { researchSummary: dto.researchSummary } : {}),
        ...(dto.generatedTerms  ? { generatedTerms:  dto.generatedTerms as any } : {}),
      },
    });

    // 2. Trigger AI pipeline (fire-and-forget)
    const aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    try {
      await firstValueFrom(
        this.httpService.post(`${aiServiceUrl}/pipeline/start`, {
          session_id: session.id,
          research_question: dto.query,
          keywords: dto.keywords || [],
          boolean_query: dto.booleanQuery || '',
          search_terms: [],
          inclusion_criteria: dto.inclusionCriteria,
          exclusion_criteria: dto.exclusionCriteria,
        }),
      );
      this.logger.log(`Pipeline started for session ${session.id}`);
    } catch (err: unknown) {
      this.logger.error(`Failed to start pipeline: ${err instanceof Error ? err.message : String(err)}`);
      // Mark session as error but still return sessionId so frontend can track
      await this.prisma.researchSession.update({
        where: { id: session.id },
        data: { status: 'error' },
      });
    }

    return { sessionId: session.id };
  }

  async getSession(id: string) {
    const session = await this.prisma.researchSession.findUnique({
      where: { id },
      include: {
        papers: true,
        report: true,
      },
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  async listSessions() {
    return this.prisma.researchSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        query: true,
        status: true,
        createdAt: true,
        prismaStats: true,
      },
    });
  }

  async saveGeneratedTerms(id: string, generatedTerms: any, researchSummary?: string) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    await this.prisma.researchSession.update({
      where: { id },
      data: {
        generatedTerms,
        ...(researchSummary !== undefined ? { researchSummary } : {}),
      },
    });
    return { saved: true };
  }

  async updateResearchSummary(id: string, researchSummary: string) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    await this.prisma.researchSession.update({ where: { id }, data: { researchSummary } });
    return { saved: true };
  }

  async saveIdentifiedPapers(id: string, papers: any[], prismaStats?: any) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);

    // Replace existing identified papers only (keep screened/eligible/included)
    await this.prisma.paper.deleteMany({ where: { sessionId: id, prismaStage: 'identified' } });
    if (papers.length > 0) {
      await this.prisma.paper.createMany({
        data: papers.map(p => ({
          sessionId: id,
          title: p.title,
          authors: p.authors || [],
          year: p.year ?? null,
          url: p.url ?? null,
          abstract: p.abstract ?? null,
          venue: p.venue ?? null,
          pmcUrl: p.pmc_url ?? null,
          doiUrl: p.doi_url ?? null,
          openAccessPdf: p.open_access_pdf ?? null,
          arxivUrl: p.arxiv_url ?? null,
          pubmedUrl: p.pubmed_url ?? null,
          prismaStage: 'identified',
          decision: null,
          reason: null,
        })),
      });
    }
    if (prismaStats) {
      await this.prisma.researchSession.update({ where: { id }, data: { prismaStats } });
    }
    return { saved: papers.length };
  }

  async saveStageResults(
    id: string,
    stage: 'screened' | 'eligible' | 'included',
    papers: any[],
    prismaStats?: any,
  ) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);

    // Replace papers for this stage only
    await this.prisma.paper.deleteMany({ where: { sessionId: id, prismaStage: stage } });
    if (papers.length > 0) {
      await this.prisma.paper.createMany({
        data: papers.map(p => ({
          sessionId: id,
          title: p.title,
          authors: p.authors || [],
          year: p.year ?? null,
          url: p.url ?? null,
          abstract: p.abstract ?? null,
          venue: p.venue ?? null,
          pmcUrl: p.pmc_url ?? null,
          doiUrl: p.doi_url ?? null,
          openAccessPdf: p.open_access_pdf ?? null,
          arxivUrl: p.arxiv_url ?? null,
          pubmedUrl: p.pubmed_url ?? null,
          prismaStage: stage,
          decision: p.decision ?? null,
          reason: p.reason ?? null,
          extractedData: p.extracted_data ?? null,
        })),
      });
    }
    // Update prismaStats and set stage-based status
    const stageStatusMap: Record<string, string> = {
      screened: 'screening_done',
      eligible: 'eligibility_done',
      included: 'inclusion_done',
    };
    await this.prisma.researchSession.update({
      where: { id },
      data: {
        ...(prismaStats ? { prismaStats } : {}),
        status: stageStatusMap[stage] || 'running',
      },
    });
    return { saved: papers.length, stage };
  }

  async deleteSession(id: string) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    await this.prisma.researchSession.delete({ where: { id } });
  }

  async runStage(id: string, stage: 'screening' | 'eligibility' | 'inclusion', criteria: string[]) {
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);

    const aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    await firstValueFrom(
      this.httpService.post(`${aiServiceUrl}/pipeline/${stage}`, {
        session_id: id,
        criteria,
      }),
    );
    return { status: 'started', stage };
  }

  async completeSession(id: string, dto: CompleteSessionDto) {
    // Called by FastAPI when pipeline finishes
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);

    // Upsert included papers only — do NOT wipe intermediate stage papers
    if (dto.included_papers?.length) {
      await this.prisma.paper.deleteMany({ where: { sessionId: id, prismaStage: 'included' } });
      await this.prisma.paper.createMany({
        data: dto.included_papers.map((p) => ({
          sessionId: id,
          title: p.title,
          authors: p.authors || [],
          year: p.year,
          url: p.url,
          abstract: p.abstract,
          venue: p.venue,
          prismaStage: p.prisma_stage || 'included',
          decision: p.decision,
          reason: p.reason,
          extractedData: p.extracted_data,
        })),
      });
    }

    // Upsert report
    if (dto.review_report) {
      await this.prisma.report.upsert({
        where: { sessionId: id },
        create: { sessionId: id, content: dto.review_report },
        update: { content: dto.review_report },
      });
    }

    // Update session status + PRISMA stats
    const updated = await this.prisma.researchSession.update({
      where: { id },
      data: {
        status: 'done',
        prismaStats: dto.prisma_stats,
      },
    });

    this.logger.log(`Session ${id} completed and saved to DB`);
    return updated;
  }
}
