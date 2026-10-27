import { AppService } from './app.service';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_10_MINUTES: '0 */10 * * * *' },
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    getOrThrow: jest
      .fn()
      .mockReturnValue('https://captionify-fw55.onrender.com/health'),
    get: jest
      .fn()
      .mockReturnValue('https://captionify-fw55.onrender.com/health'),
  })),
}));

import { ConfigService } from '@nestjs/config';

describe('AppService', () => {
  const originalHealthCheckUrl = process.env.HEALTH_CHECK_URL;

  afterEach(() => {
    if (originalHealthCheckUrl === undefined) {
      delete process.env.HEALTH_CHECK_URL;
    } else {
      process.env.HEALTH_CHECK_URL = originalHealthCheckUrl;
    }
    jest.restoreAllMocks();
  });

  it('uses the configured health check URL', async () => {
    process.env.HEALTH_CHECK_URL =
      'https://captionify-fw55.onrender.com/health';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const config = new ConfigService();
    await new AppService(config).handleCron();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://captionify-fw55.onrender.com/health',
    );
  });
});
