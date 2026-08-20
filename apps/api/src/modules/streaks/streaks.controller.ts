import { Controller, Get, Req } from '@nestjs/common';
import { StreaksService } from './streaks.service';

@Controller('streaks')
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  async getStreak(@Req() req: any) {
    return this.streaksService.getUserStreak(req.user.id);
  }
}
