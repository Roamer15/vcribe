import { RoomService } from './room.service';

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(() => {
    service = new RoomService();
  });

  it('create a six-charactered code', () => {
    const code = service.create();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(service.exists(code)).toBe(true);
  });

  it('creates a different code for a new room', () => {
    const first = service.create();
    const second = service.create();

    expect(second).not.toBe(first);
    expect(service.exists(second)).toBe(true);
  });

  it('returns an existing room when its code is passed to create', () => {
    const code = service.create();

    expect(service.create(code)).toBe(code);
  });

  it('returns false for a code that has not been created', () => {
    expect(service.exists('ABC234')).toBe(false);
  });
});
