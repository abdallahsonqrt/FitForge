import { Controller, Get, Patch, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@Req() req: any) {
    return this.notificationsService.getUserNotifications(req.user.id);
  }

  /** `id` is a notification uuid; a malformed one is a 400, not a driver error. */
  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markAsRead(req.user.id, id);
  }
}
