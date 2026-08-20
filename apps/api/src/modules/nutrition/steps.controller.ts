import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { StepsService } from './steps.service';
import { LogStepsDto, logStepsSchema } from './dto/log-steps.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ParseDateParamPipe } from '../../common/pipes/parse-date-param.pipe';

@Controller('steps')
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Post()
  async logSteps(@Req() req: any, @Body(new ZodValidationPipe(logStepsSchema)) body: LogStepsDto) {
    return this.stepsService.create(req.user.id, body);
  }

  /** `date` is a `YYYY-MM-DD` key compared against a Postgres `date` column. */
  @Get(':date')
  async getStepsByDate(@Req() req: any, @Param('date', ParseDateParamPipe) date: string) {
    return { count: await this.stepsService.getByDate(req.user.id, date) };
  }
}
