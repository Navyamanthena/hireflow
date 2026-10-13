import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(20)
  @MaxLength(20000)
  description: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  advanceThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  reviewThreshold?: number;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  advanceThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  reviewThreshold?: number;
}
