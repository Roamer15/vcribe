import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { SpeechResultSchema } from './speech-result.schema';

type CaptionHandler = (caption: { text: string; isFinal: boolean }) => void;

interface Session {
  ws: WebSocket;
  queue: Buffer[]; // audio that arrives before Deepgram's socket is open
  keepAlive?: NodeJS.Timeout;
}

interface SpeechResultMessage {
  type: string;
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private sessions = new Map<string, Session>(); // one Deepgram connection per room

  constructor(private readonly config: ConfigService) {}

  start(roomCode: string, onCaption: CaptionHandler) {
    this.stop(roomCode);

    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      interim_results: 'true',
      smart_format: 'true',
      endpointing: '300', // ms of silence before a phrase is finalized
    });

    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
      headers: {
        Authorization: `Token ${this.config.getOrThrow('DEEPGRAM_API_KEY')}`,
      },
    });
    const session: Session = { ws, queue: [] };
    this.sessions.set(roomCode, session);

    ws.on('open', () => {
      // The first chunk holds the container header, so it must not be dropped
      for (const chunk of session.queue) ws.send(chunk);
      session.queue = [];
      session.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }, 5000);
    });

    ws.on('message', (raw) => {
      const textData = Buffer.from(raw as any).toString('utf8');
      const rawJson = JSON.parse(textData) as SpeechResultMessage;

      const result = SpeechResultSchema.safeParse(rawJson);
      if (!result.success) {
        console.warn(`Actual result is as follows: `, result);
        return;
      }

      const msg = result.data;
      if (msg.type !== 'Results') return;

      const text: string | undefined =
        msg.channel?.alternatives?.[0]?.transcript;
      if (!text) return;

      // Note: Ensure msg.is_final is safely coerced to a boolean if your schema allows undefined
      if (msg.is_final) {
        onCaption({ text, isFinal: Boolean(msg.is_final) });
      }
    });

    ws.on('error', (err) =>
      this.logger.error(`Deepgram error: ${err.message}`),
    );

    ws.on('close', (code, reason) => {
      this.logger.log(`Deepgram closed (${code}) ${reason.toString()}`);
      clearInterval(session.keepAlive);
      if (this.sessions.get(roomCode) === session)
        this.sessions.delete(roomCode);
    });
  }

  send(roomCode: string, chunk: Buffer) {
    const session = this.sessions.get(roomCode);
    if (!session) return;
    if (session.ws.readyState === WebSocket.OPEN) session.ws.send(chunk);
    else if (session.ws.readyState === WebSocket.CONNECTING)
      session.queue.push(chunk);
  }

  stop(roomCode: string) {
    const session = this.sessions.get(roomCode);
    if (!session) return;
    clearInterval(session.keepAlive);
    this.sessions.delete(roomCode);
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'CloseStream' })); // flushes the last words
    } else {
      session.ws.close();
    }
  }
}
