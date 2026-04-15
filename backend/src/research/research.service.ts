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
        searchTerms: dto.searchTerms,
        inclusionCriteria: dto.inclusionCriteria,
        exclusionCriteria: dto.exclusionCriteria,
        status: 'running',
      },
    });

    // 2. Trigger AI pipeline (fire-and-forget)
    const aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    try {
      await firstValueFrom(
        this.httpService.post(`${aiServiceUrl}/pipeline/start`, {
          session_id: session.id,
          query: dto.query,
          search_terms: dto.searchTerms,
          inclusion_criteria: dto.inclusionCriteria,
          exclusion_criteria: dto.exclusionCriteria,
        }),
      );
      this.logger.log(`Pipeline started for session ${session.id}`);
    } catch (err) {
      this.logger.error(`Failed to start pipeline: ${err.message}`);
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

  async completeSession(id: string, dto: CompleteSessionDto) {
    // Called by FastAPI when pipeline finishes
    const session = await this.prisma.researchSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);

    // Upsert papers
    if (dto.included_papers?.length) {
      await this.prisma.paper.deleteMany({ where: { sessionId: id } });
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
