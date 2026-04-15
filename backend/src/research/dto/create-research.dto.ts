import { IsString, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateResearchDto {
  @IsString()
  query: string;

  @IsArray()
  @ArrayNotEmpty()
  searchTerms: string[];

  @IsArray()
  inclusionCriteria: string[];

  @IsArray()
  exclusionCriteria: string[];
}
