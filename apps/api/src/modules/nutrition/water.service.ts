import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { LogWaterDto } from './dto/log-water.dto';

@Injectable()
export class WaterService {
  constructor(@Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>) {}

  async create(userId: string, data: LogWaterDto) {
    const [waterLog] = await this.db.insert(schema.waterLogs).values({
      ...data,
      userId,
      date: data.date.slice(0, 10),
    }).returning();
    return waterLog;
  }

  async getByDate(userId: string, dateString: string) {
    const logs = await this.db.query.waterLogs.findMany({
      where: and(
        eq(schema.waterLogs.userId, userId),
        eq(schema.waterLogs.date, dateString)
      ),
    });

    return logs.reduce((acc, log) => acc + log.amountMl, 0);
  }
}
