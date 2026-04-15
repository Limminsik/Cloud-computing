import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
