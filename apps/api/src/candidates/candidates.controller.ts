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
import { Role } from '@app/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { CandidatesService } from './candidates.service';
import { extractResumeText, MAX_RESUME_BYTES } from './resume-text';

@Controller()
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post('jobs/:jobId/candidates')
  create(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.candidates.create(user, jobId, dto);
  }

  @Post('jobs/:jobId/candidates/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UploadCandidateDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.candidates.assertJobAccess(jobId, user.orgId); // before spending time parsing
    if (!file) throw new BadRequestException('Attach a resume file in the "file" field');
    const resumeText = await extractResumeText(file);
    return this.candidates.create(user, jobId, { ...dto, resumeText });
  }

  @Get('jobs/:jobId/candidates')
  list(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ListCandidatesQuery,
  ) {
    return this.candidates.listForJob(user.orgId, jobId, query.stage);
  }

  @Get('candidates/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.findOne(id, user.orgId);
  }

  @Patch('candidates/:id/stage')
  move(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveStageDto) {
    return this.candidates.moveStage(user, id, dto);
  }

  @Post('candidates/:id/rescore')
  rescore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.rescore(user, id);
  }

  @Delete('candidates/:id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.remove(user.orgId, id);
  }
}
