import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { WaterService } from './water.service';
import { LogWaterDto, logWaterSchema } from './dto/log-water.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ParseDateParamPipe } from '../../common/pipes/parse-date-param.pipe';

@Controller('water')
export class WaterController {
  constructor(private readonly waterService: WaterService) {}

  @Post()
  async logWater(@Req() req: any, @Body(new ZodValidationPipe(logWaterSchema)) body: LogWaterDto) {
    return this.waterService.create(req.user.id, body);
  }

  /** `date` is a `YYYY-MM-DD` key compared against a Postgres `date` column. */
  @Get(':date')
  async getWaterByDate(@Req() req: any, @Param('date', ParseDateParamPipe) date: string) {
    return { amountMl: await this.waterService.getByDate(req.user.id, date) };
  }
}
