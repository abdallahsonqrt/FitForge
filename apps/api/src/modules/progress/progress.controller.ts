import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { LogWeightDto, LogWeightDtoSchema } from './dto/log-weight.dto';
import { LogMeasurementDto, LogMeasurementDtoSchema } from './dto/log-measurement.dto';
import { LogWorkoutDto, logWorkoutSchema } from './dto/log-workout.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('weight')
  async getWeightLogs(@Req() req: any) {
    return this.progressService.getWeightLogs(req.user.id);
  }

  @Post('weight')
  async logWeight(
    @Req() req: any,
    @Body(new ZodValidationPipe(LogWeightDtoSchema)) body: LogWeightDto,
  ) {
    return this.progressService.logWeight(req.user.id, body);
  }

  @Get('measurements')
  async getMeasurements(@Req() req: any) {
    return this.progressService.getMeasurements(req.user.id);
  }

  @Post('measurements')
  async logMeasurement(
    @Req() req: any,
    @Body(new ZodValidationPipe(LogMeasurementDtoSchema)) body: LogMeasurementDto,
  ) {
    return this.progressService.logMeasurement(req.user.id, body);
  }

  @Get('workouts')
  async getWorkouts(@Req() req: any) {
    return this.progressService.getWorkouts(req.user.id);
  }

  @Post('workouts')
  async logWorkout(
    @Req() req: any,
    @Body(new ZodValidationPipe(logWorkoutSchema)) body: LogWorkoutDto,
  ) {
    return this.progressService.logWorkout(req.user.id, body);
  }

  @Get('badges')
  async getBadges(@Req() req: any) {
    return this.progressService.getBadges(req.user.id);
  }
}