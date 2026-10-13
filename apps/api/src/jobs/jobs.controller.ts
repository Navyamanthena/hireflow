import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@app/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { CreateJobDto, UpdateJobDto } from './jobs.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.jobs.create(user.orgId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.jobs.findAll(user.orgId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.findOne(id, user.orgId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(id, user.orgId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.remove(id, user.orgId);
  }

  @Get(':id/metrics')
  metrics(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.metrics(id, user.orgId);
  }
}
