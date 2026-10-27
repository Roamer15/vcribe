jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1,
  })),
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    getOrThrow: jest.fn().mockReturnValue('mock-api-key'),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TranscriptionService } from './transcription.service';
import { SpeechResultSchema } from './speech-result.schema';

describe('TranscriptionService & Zod Validation', () => {
  let service: TranscriptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranscriptionService, ConfigService],
    }).compile();

    service = module.get<TranscriptionService>(TranscriptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Zod Safe Parsing', () => {
    it('should successfully parse a valid Deepgram transcript result', () => {
      const validPayload = {
        type: 'Results',
        is_final: true,
        channel: {
          alternatives: [{ transcript: 'testing real-time transcription' }],
        },
      };

      const result = SpeechResultSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should safely catch and reject unexpected control frames without throwing', () => {
      const controlPayload = { type: 'Metadata', request_id: 'abc-123' };
      const result = SpeechResultSchema.safeParse(controlPayload);
      expect(result.success).toBe(false);
    });
  });
});
