import { Test, TestingModule } from '@nestjs/testing';
import { TranscriptionService } from './transcription.service';
import { SpeechResultSchema } from './speech-result.schema';

// Mock the 'ws' module so tests run instantly and offline without real network calls
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1,
  })),
}));

describe('TranscriptionService & Zod Validation', () => {
  let service: TranscriptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptionService,
        {
          provide: 'ConfigService',
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('mock-api-key'),
          },
        },
      ],
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
      if (result.success) {
        expect(result.data.channel?.alternatives?.[0]?.transcript).toEqual(
          'testing real-time transcription',
        );
      }
    });

    it('should safely catch and reject unexpected control frames without throwing', () => {
      const controlPayload = { type: 'Metadata', request_id: 'abc-123' };

      const result = SpeechResultSchema.safeParse(controlPayload);

      // safeParse returns success: false instead of crashing your app with an exception
      expect(result.success).toBe(false);
    });
  });
});
