import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ResearchService } from './research.service';
import { CreateResearchDto } from './dto/create-research.dto';
import { CompleteSessionDto } from './dto/complete-session.dto';

@Controller()
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  /** Create a new research session and start the AI pipeline */
  @Post('research')
  @HttpCode(HttpStatus.CREATED)
  async createResearch(@Body() dto: CreateResearchDto) {
    return this.researchService.createSession(dto);
  }

  /** List recent sessions */
  @Get('sessions')
  async listSessions() {
    return this.researchService.listSessions();
  }

  /** Get a specific session (with papers + report) */
  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    return this.researchService.getSession(id);
  }

  /** Save identified papers from search stage */
  @Post('sessions/:id/identified')
  @HttpCode(HttpStatus.OK)
  async saveIdentified(
    @Param('id') id: string,
    @Body() body: { papers: any[]; prisma_stats?: any },
  ) {
    return this.researchService.saveIdentifiedPapers(id, body.papers, body.prisma_stats);
  }

  /** Save intermediate stage results (screened / eligible / included) */
  @Post('sessions/:id/stage-results')
  @HttpCode(HttpStatus.OK)
  async saveStageResults(
    @Param('id') id: string,
    @Body() body: { stage: 'screened' | 'eligible' | 'included'; papers: any[]; prisma_stats?: any },
  ) {
    return this.researchService.saveStageResults(id, body.stage, body.papers, body.prisma_stats);
  }

  /** Save Identification Agent's generated terms + auto summary */
  @Post('sessions/:id/generated-terms')
  @HttpCode(HttpStatus.OK)
  async saveGeneratedTerms(
    @Param('id') id: string,
    @Body() body: { generatedTerms: any; researchSummary?: string },
  ) {
    return this.researchService.saveGeneratedTerms(id, body.generatedTerms, body.researchSummary);
  }

  /** Update user-edited research summary */
  @Post('sessions/:id/research-summary')
  @HttpCode(HttpStatus.OK)
  async updateResearchSummary(
    @Param('id') id: string,
    @Body() body: { researchSummary: string },
  ) {
    return this.researchService.updateResearchSummary(id, body.researchSummary);
  }

  /** Delete a session */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') id: string) {
    return this.researchService.deleteSession(id);
  }

  /** Run a specific PRISMA stage with user-provided criteria */
  @Post('sessions/:id/run-stage')
  @HttpCode(HttpStatus.OK)
  async runStage(
    @Param('id') id: string,
    @Body() body: { stage: 'screening' | 'eligibility' | 'inclusion'; criteria?: string[] },
  ) {
    return this.researchService.runStage(id, body.stage, body.criteria || []);
  }

  /** Called by FastAPI when pipeline finishes — saves results to DB */
  @Post('sessions/:id/complete')
  @HttpCode(HttpStatus.OK)
  async completeSession(@Param('id') id: string, @Body() dto: CompleteSessionDto) {
    return this.researchService.completeSession(id, dto);
  }

  /** Health check */
  @Get('health')
  health() {
    return { status: 'ok', service: 'backend' };
  }
}
