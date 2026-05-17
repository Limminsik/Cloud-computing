import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateResearchDto {
  @IsString()
  query: string;

  @IsArray()
  @IsOptional()
  keywords: string[] = [];

  @IsString()
  @IsOptional()
  booleanQuery?: string;

  @IsArray()
  @IsOptional()
  searchTerms: string[] = [];

  @IsArray()
  @IsOptional()
  inclusionCriteria: string[] = [];

  @IsArray()
  @IsOptional()
  exclusionCriteria: string[] = [];

  @IsString()
  @IsOptional()
  researchSummary?: string;

  @IsOptional()
  generatedTerms?: Record<string, unknown>;
}
