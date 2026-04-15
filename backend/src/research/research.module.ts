import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [HttpModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
