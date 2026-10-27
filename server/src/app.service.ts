import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly config: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron(): Promise<void> {
    const port = process.env.PORT ?? 3000;
    const healthCheckUrl =
      (this.config.get('HEALTH_CHECK_URL') as string) ??
      `http://localhost:${port}/health`;

    try {
      const response = await fetch(healthCheckUrl);
      if (!response.ok) {
        throw new Error(`Health check returned HTTP ${response.status}`);
      }
      this.logger.log('Health check succeeded');
    } catch (error) {
      this.logger.error(
        'Health check failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
