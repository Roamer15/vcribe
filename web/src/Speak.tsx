import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { socket } from '../services/socket';

export default function Speak() {
  const [params] = useSearchParams();
  const roomRef = useRef<string | null>(
    params.get('room')?.toUpperCase() ?? sessionStorage.getItem('speakRoom'),
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wantRecordingRef = useRef(false); // the teacher's intent: should we be recording?

  // Mic level meter (drives the ring around the button, no React re-renders)
  const ringRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef(0);

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'joined' | 'error'>('idle');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');

  const stopMeter = () => {
    cancelAnimationFrame(meterFrameRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    ringRef.current?.style.setProperty('--level', '0');
  };

  const startMeter = (stream: MediaStream) => {
    stopMeter();
    try {
      const AudioCtx: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let level = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        level += (Math.min(rms * 4, 1) - level) * 0.2; // ease toward the new value
        ringRef.current?.style.setProperty('--level', level.toFixed(3));
        meterFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
      audioCtxRef.current = ctx;
    } catch {
      /* the meter is a nicety; captioning works without it */
    }
  };

  const releaseMic = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setRecording(false);
  };

  // Stops the local recorder WITHOUT telling the server (used when the connection drops)
  const haltLocally = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stop();
    }
    recorderRef.current = null;
    releaseMic();
  };

  const beginRecording = async () => {
    if (recorderRef.current?.state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      startMeter(stream);

      socket.emit('speech:start');

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) socket.emit('audio', e.data);
      };
      recorder.onstop = () => socket.emit('speech:stop');
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setError('');

      wakeLockRef.current =
        (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
    } catch {
      setError('Microphone unavailable or permission denied.');
    }
  };

  const join = (code: string) => {
    socket.emit('room:join', { code }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        sessionStorage.setItem('speakRoom', code);
        setStatus('joined');
        setError('');
        // Resume automatically if the teacher had been captioning before the drop
        if (wantRecordingRef.current) beginRecording();
      } else {
        setStatus('error');
        setError(res.error ?? 'Could not join this room.');
      }
    });
  };

  useEffect(() => {
    const onConnect = () => {
      if (roomRef.current) join(roomRef.current);
    };
    const onDisconnect = () => {
      setStatus('idle');
      haltLocally(); // wantRecordingRef stays true so we resume after reconnecting
    };
    const onCaption = (c: { text: string }) => setPreview(c.text);

    // The wake lock and mic are lost when the page is hidden; restore them on return
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        wantRecordingRef.current &&
        socket.connected &&
        recorderRef.current?.state !== 'recording'
      ) {
        beginRecording();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('caption', onCaption);
    document.addEventListener('visibilitychange', onVisible);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('caption', onCaption);
      document.removeEventListener('visibilitychange', onVisible);
      haltLocally();
      socket.disconnect();
    };
  }, []);

  const startCaptioning = () => {
    wantRecordingRef.current = true;
    beginRecording();
  };

  const stopCaptioning = () => {
    wantRecordingRef.current = false;
    recorderRef.current?.stop(); // onstop tells the server
    recorderRef.current = null;
    releaseMic();
  };

  const manualJoin = () => {
    roomRef.current = input.trim().toUpperCase();
    join(roomRef.current);
  };

  const joined = status === 'joined';
  const reconnecting = status === 'idle' && wantRecordingRef.current;

  return (
    <main className="flex min-h-dvh flex-col bg-(--canvas) px-6 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-(--text)">
      <header className="flex min-h-11 items-center justify-between">
        <span className="text-[1.0625rem] font-bold tracking-[-0.02em]"><Link to={'/'}>Vcribe</Link></span>
        {joined && (
          <span className="inline-flex items-center rounded-full border border-(--hairline) bg-(--material) px-3 py-1.5 text-[0.8125rem] font-medium text-(--text-2) [backdrop-filter:var(--blur)] [-webkit-backdrop-filter:var(--blur)]">
            <span aria-hidden="true" className="mr-2 h-2 w-2 rounded-full bg-(--ok)" />
            Connected
          </span>
        )}
        {reconnecting && (
          <span className="inline-flex items-center rounded-full border border-(--hairline) bg-(--material) px-3 py-1.5 text-[0.8125rem] font-medium text-(--text-2) [backdrop-filter:var(--blur)] [-webkit-backdrop-filter:var(--blur)]">
            <span aria-hidden="true" className="mr-2 h-2 w-2 rounded-full bg-(--wait)" />
            Reconnecting
          </span>
        )}
      </header>

      {joined ? (
        <section className="mx-auto flex w-full max-w-105 flex-1 flex-col" key="live">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative h-32 w-32">
              <div
                className={`[--level:0] pointer-events-none absolute inset-0 rounded-full bg-(--live) opacity-0 will-change-transform ${recording ? 'scale-[calc(1+var(--level)*0.45)] opacity-[calc(0.15+var(--level)*0.5)]' : ''} motion-reduce:transform-none`}
                ref={ringRef}
                aria-hidden="true"
              />
              <button
                type="button"
                className={`relative z-10 grid h-full w-full touch-manipulation place-items-center rounded-full bg-(--accent) p-0 text-white transition-[transform,background-color] duration-[120ms,400ms] ease-(--ease-spring) active:scale-[0.94] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--accent)_40%,transparent)] ${recording ? 'bg-(--live)' : ''}`}
                onClick={recording ? stopCaptioning : startCaptioning}
                aria-label={recording ? 'Stop captioning' : 'Start captioning'}
              >
                {recording ? (
                  <span className="h-8.5 w-8.5 rounded-[9px] bg-white" />
                ) : (
                  <Mic size={44} strokeWidth={1.75} />
                )}
              </button>
            </div>

            <h1 className="mt-7 text-[1.375rem] font-semibold leading-[1.2] tracking-[-0.02em]">
              {recording ? 'Captioning live' : 'Ready to caption'}
            </h1>
            <p className="mt-1 max-w-[30ch] text-(--text-2)">
              {recording ? 'Tap to stop' : 'Tap the microphone to start'}
            </p>
            {error && (
              <p className="mt-3 min-h-[1.4em] text-[0.9375rem] text-(--live)" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="min-h-22 rounded-[20px] border border-(--hairline) bg-(--surface) px-4.5 py-4">
            <p className={`line-clamp-3 text-lg leading-[1.4] tracking-[-0.01em] ${preview ? '' : 'text-(--text-2)'}`}>
              {preview || 'Captions appear here as you speak.'}
            </p>
          </div>
        </section>
      ) : reconnecting ? (
        <section className="mx-auto flex w-full max-w-105 flex-1 flex-col" key="reconnecting">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-(--hairline) border-t-(--text-2) motion-reduce:hidden" aria-hidden="true" />
            <h1 className="mt-7 text-[1.375rem] font-semibold leading-[1.2] tracking-[-0.02em]">Reconnecting…</h1>
            <p className="mt-1 max-w-[30ch] text-(--text-2)">
              Keep this page open. Captioning resumes automatically.
            </p>
          </div>
        </section>
      ) : (
        <section className="mx-auto flex w-full max-w-105 flex-1 flex-col justify-center pb-[8vh]" key="join">
          <h1 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em]">Join a room</h1>
          <p className="mt-2 text-[1.0625rem] text-(--text-2)">Enter the code shown on the screen.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              manualJoin();
            }}
          >
            <input
              className="mt-8 block h-18 w-full rounded-[18px] border border-(--hairline) bg-(--surface) px-0 text-center text-[2rem] font-semibold uppercase tracking-[0.3em] text-(--text) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-2)/45 focus:border-(--accent) focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="ABC123"
              aria-label="Room code"
              aria-invalid={status === 'error'}
            />
            <p className="my-3 min-h-[1.4em] text-[0.9375rem] text-(--live)" role="alert">
              {status === 'error' ? error : ''}
            </p>
            <button className="min-h-12 w-full rounded-xl bg-(--accent) px-5 py-3 text-base font-semibold text-white transition-opacity active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--accent)_40%,transparent)] disabled:cursor-not-allowed disabled:opacity-35" type="submit" disabled={input.trim().length < 6}>
              Join
            </button>
          </form>
        </section>
      )}
    </main>
  );
}