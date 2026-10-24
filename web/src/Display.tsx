import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { socket } from "../services/socket";

export default function Display() {
  const [code, setCode] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const [speakerOnline, setSpeakerOnline] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");

  useEffect(() => {
    const createRoom = () => {
      const saved = sessionStorage.getItem("roomCode") ?? undefined;
      socket.emit("room:create", { code: saved }, (res: { code: string }) => {
        sessionStorage.setItem("roomCode", res.code);
        setCode(res.code);
      });
    };
    const onSpeakerOn = () => {
      setSpeakerOnline(true);
      setPaired(true);
    };
    const onSpeakerOff = () => setSpeakerOnline(false);
    const onCaption = (c: { text: string; isFinal: boolean }) => {
      // Captions only come from a connected teacher, so this also covers a
      // display reload in the middle of a lesson
      setPaired(true);
      setSpeakerOnline(true);
      if (c.isFinal) {
        setLines((l) => [...l.slice(-11), c.text]);
        setInterim("");
      } else {
        setInterim(c.text);
      }
    };

    socket.on("connect", createRoom);
    socket.on("speaker:connected", onSpeakerOn);
    socket.on("speaker:disconnected", onSpeakerOff);
    socket.on("caption", onCaption);
    socket.connect();

    return () => {
      socket.off("connect", createRoom);
      socket.off("speaker:connected", onSpeakerOn);
      socket.off("speaker:disconnected", onSpeakerOff);
      socket.off("caption", onCaption);
      socket.disconnect();
    };
  }, []);

  if (!code) {
    return (
      <div className="fixed inset-0 box-border overflow-hidden bg-black px-[5vw] py-[5vh] text-white">
        <div className="flex h-full flex-col items-center justify-center text-center" key="connecting">
          <p className="mt-[3vh] text-[2.6vh] text-white/60">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!paired) {
    return (
      <div className="fixed inset-0 box-border overflow-hidden bg-black px-[5vw] py-[5vh] text-white">
        <div className="absolute left-[5vw] top-[5vh] text-[3.2vh] font-semibold tracking-[-0.02em] text-white/90">Vcribe</div>
        <div className="flex h-full flex-col items-center justify-center text-center" key="pair">
          <h1 className="mb-[4vh] text-[5vh] font-semibold leading-[1.1] tracking-tight">Scan to start captioning</h1>
          <div
            className="box-border size-[34vh] rounded-[3vh] bg-white p-[2.4vh] [&_svg]:block [&_svg]:size-full"
            role="img"
            aria-label="QR code to join this room"
          >
            <QRCodeSVG
              value={`${window.location.origin}/speak?room=${code}`}
              size={256}
            />
          </div>
          <div
            className="mt-[4.5vh] pl-[0.14em] text-[9vh] font-semibold leading-none tracking-[0.14em] tabular-nums"
            aria-label={`Room code ${code.split("").join(" ")}`}
          >
            {code}
          </div>
          <p className="mt-[3vh] text-[2.6vh] text-white/60">
            Or open {window.location.host}/speak on your phone and enter the
            code.
          </p>
        </div>
      </div>
    );
  }

  const hasText = lines.length > 0 || interim !== "";

  return (
    <div className="fixed inset-0 box-border overflow-hidden bg-black px-[5vw] py-[5vh] text-white [--caption-size:5.6vh] [--wait:#ff9f0a]">
      <div
        className={`pointer-events-none fixed right-[3vw] top-[3vh] flex items-center rounded-full bg-[rgba(60,60,67,0.6)] px-[2.2vh] py-[1.2vh] text-[2.4vh] font-medium text-white opacity-0 translate-y-[-1vh] scale-[0.96] backdrop-blur-[20px] backdrop-saturate-180 [transition:opacity_250ms_ease,transform_450ms_cubic-bezier(0.2,0.8,0.2,1)] before:mr-[1.2vh] before:size-[1.2vh] before:shrink-0 before:rounded-full before:bg-(--wait) before:content-[''] motion-reduce:transform-none motion-reduce:[transition:opacity_200ms_ease] [@media(prefers-reduced-transparency:reduce)]:bg-[#2c2c2e] [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:backdrop-saturate-100 ${!speakerOnline ? "translate-y-0 scale-100 opacity-100" : ""}`}
        role="status"
      >
        Teacher disconnected
      </div>

      {hasText ? (
        <div className="flex h-full flex-col justify-end overflow-hidden [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_22%)] mask-[linear-gradient(to_bottom,transparent_0%,black_22%)]" key="captions">
          {lines.map((line, i) => (
            <p
              key={i}
              className={
                `mb-[2.2vh] text-(length:--caption-size) font-semibold leading-[1.22] tracking-[-0.015em] text-white/55 ${!interim && i === lines.length - 1 ? "text-white" : ""}`
              }
            >
              {line}
            </p>
          ))}
          {interim && (
            <p className="mb-[2.2vh] text-(length:--caption-size) font-semibold leading-[1.22] tracking-[-0.015em] text-white">
              {interim}
            </p>
          )}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-[4vh] font-medium tracking-[-0.02em] text-white/50" key="empty">
          <p>Waiting for the teacher to speak</p>
        </div>
      )}
    </div>
  );
}
