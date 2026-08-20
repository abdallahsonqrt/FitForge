import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  async getUserNotifications(userId: string) {
    return this.db.query.notifications.findMany({
      where: eq(schema.notifications.userId, userId),
      orderBy: [desc(schema.notifications.createdAt)],
    });
  }

  async markAsRead(userId: string, id: string) {
    const [updated] = await this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }
    return updated;
  }

  /**
   * Fire-and-forget notify, for callers whose real job is something else.
   *
   * A notification is a side effect of an enrollment being accepted or a message
   * being sent — never the reason either happened. Letting an insert failure
   * here roll back the operation that triggered it would trade a missing bell
   * icon for a lost message, so failures are logged and swallowed.
   */
  async notify(data: CreateNotificationDto): Promise<void> {
    try {
      await this.createNotification(data);
    } catch (error) {
      this.logger.error(
        `Could not write a '${data.type}' notification for user ${data.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async createNotification(data: CreateNotificationDto) {
    const [notification] = await this.db.insert(schema.notifications).values({
      userId: data.userId,
      title: data.title,
      body: data.message,
      type: data.type,
      isRead: false,
    }).returning();
    return notification;
  }
}
