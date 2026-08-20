import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { LogStepsDto } from './dto/log-steps.dto';

@Injectable()
export class StepsService {
  constructor(@Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>) {}

  async create(userId: string, data: LogStepsDto) {
    const [stepLog] = await this.db.insert(schema.stepLogs).values({
      userId,
      steps: data.count,
      date: data.date.slice(0, 10),
    }).returning();
    return stepLog;
  }

  async getByDate(userId: string, dateString: string) {
    const logs = await this.db.query.stepLogs.findMany({
      where: and(
        eq(schema.stepLogs.userId, userId),
        eq(schema.stepLogs.date, dateString)
      ),
    });

    return logs.reduce((acc, log) => acc + log.steps, 0);
  }
}
