import { IsString, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PaperDto {
  @IsString()
  title: string;

  @IsArray()
  @IsOptional()
  authors?: string[];

  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @IsString()
  @IsOptional()
  venue?: string;

  @IsString()
  @IsOptional()
  prisma_stage?: string;

  @IsString()
  @IsOptional()
  decision?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsObject()
  @IsOptional()
  extracted_data?: Record<string, any>;
}

export class CompleteSessionDto {
  @IsObject()
  @IsOptional()
  prisma_stats?: Record<string, number>;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaperDto)
  included_papers?: PaperDto[];

  @IsString()
  @IsOptional()
  review_report?: string;
}
