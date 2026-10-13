import { Stage } from '@app/common';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsString()
  @MinLength(30, { message: 'resumeText looks too short to be a resume' })
  @MaxLength(60000)
  resumeText: string;
}

/** Multipart form fields that accompany an uploaded resume file. */
export class UploadCandidateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}

export class MoveStageDto {
  @IsEnum(Stage)
  stage: Stage;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListCandidatesQuery {
  @IsOptional()
  @IsEnum(Stage)
  stage?: Stage;
}
