import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from '../room/room.service';
import { TranscriptionService } from './transcription.service';

interface CustomSocketData {
  code?: string;
  role?: 'speaker' | 'display';
}

@WebSocketGateway({ cors: { origin: true } })
export class CaptionsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly rooms: RoomService,
    private readonly transcription: TranscriptionService,
  ) {}

  @SubscribeMessage('room:create')
  async handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code?: string },
  ) {
    try {
      const code = this.rooms.create(body?.code);
      const data = client.data as CustomSocketData;
      data.role = 'display';
      data.code = code;
      await client.join(code);
      return { code };
    } catch (error) {
      if (error instanceof Error) {
        console.log(`Error creating room for client: ${client.id}`, error);
      }
      return {
        message: 'Failed to create room. Please try again later',
      };
    }
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code?: string },
  ) {
    try {
      const code = body?.code?.trim().toUpperCase();
      if (!code || !this.rooms.exists(code)) {
        return { ok: false, error: 'Room not found' };
      }
      const data = client.data as CustomSocketData;
      data.role = 'speaker';
      data.code = code;
      await client.join(code);
      client.to(code).emit('speaker:connected');
      return { ok: true };
    } catch (error) {
      if (error instanceof Error) {
        console.log(`Client: ${client.id} failed to join room`, error.message);
      }
      return { ok: false };
    }
  }

  @SubscribeMessage('speech:start')
  handleStart(@ConnectedSocket() client: Socket) {
    const data = client.data as CustomSocketData;
    if (data.role !== 'speaker') return;
    if (data.code) {
      const code: string = data.code;
      this.transcription.start(code, (caption) => {
        this.server.to(code).emit('caption', caption); // goes to the TV and the phone
      });
    }
  }

  @SubscribeMessage('audio')
  handleAudio(@ConnectedSocket() client: Socket, @MessageBody() chunk: Buffer) {
    const data = client.data as CustomSocketData;

    if (data.role !== 'speaker') return;
    if (data.code) {
      this.transcription.send(data.code, chunk);
    }
  }

  @SubscribeMessage('speech:stop')
  handleStop(@ConnectedSocket() client: Socket) {
    const data = client.data as CustomSocketData;
    if (data.role !== 'speaker') return;
    if (data.code) {
      this.transcription.stop(data.code);
    }
  }

  @SubscribeMessage('caption:test')
  handleTest(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text: string },
  ) {
    const data = client.data as CustomSocketData;
    if (data.role !== 'speaker') return;
    if (data.code) {
      client.to(data.code).emit('caption', { text: body.text, isFinal: true });
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as CustomSocketData;
    if (data.role === 'speaker') {
      if (data.code) {
        this.transcription.stop(data.code);
        client.to(data.code).emit('speaker:disconnected');
      }
    }
  }
}
