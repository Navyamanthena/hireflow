import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateCandidateDto,
  ListCandidatesQuery,
  MoveStageDto,
  UploadCandidateDto,
} from './candidates.dto';
import { CandidatesService } from './candidates.service';
import { extractResumeText, MAX_RESUME_BYTES } from './resume-text';

@Controller()
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post('jobs/:jobId/candidates')
  create(@Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: CreateCandidateDto) {
    return this.candidates.create(jobId, dto);
  }

  @Post('jobs/:jobId/candidates/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES, files: 1 } }))
  async upload(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UploadCandidateDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Attach a resume file in the "file" field');
    const resumeText = await extractResumeText(file);
    return this.candidates.create(jobId, { ...dto, resumeText });
  }

  @Get('jobs/:jobId/candidates')
  list(@Param('jobId', ParseUUIDPipe) jobId: string, @Query() query: ListCandidatesQuery) {
    return this.candidates.listForJob(jobId, query.stage);
  }

  @Get('candidates/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.findOne(id);
  }

  @Patch('candidates/:id/stage')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveStageDto) {
    return this.candidates.moveStage(id, dto);
  }

  @Post('candidates/:id/rescore')
  rescore(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.rescore(id);
  }

  @Delete('candidates/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.remove(id);
  }
}
