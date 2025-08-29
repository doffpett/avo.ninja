'use client';
import { useEffect, useRef, useState } from 'react';

function BouncyText({ text, level = 0 }: { text: string; level?: number }) {
  const letters = text.split("");
  const amp = Math.max(0, Math.min(1, level)) * 28; // px
  return (
    <div aria-label={text}>
      <span style={{ display: 'inline-block' }}>
        {letters.map((ch, i) => {
          const hue = Math.round(((i / Math.max(letters.length, 1)) * 360 + 200) % 360);
          const delay = (i % 12) * 35; // ms
          const localAmp = amp * (0.6 + 0.4 * Math.sin((i * Math.PI) / 6));
          return (
            <span
              key={i}
              className="inline-block"
              style={{
                animation: 'bounce 900ms ease-in-out infinite',
                animationDelay: `${delay}ms`,
                color: `hsl(${hue} 85% 60%)`,
                // @ts-ignore CSS var used in keyframes below
                '--amp': `${localAmp}px`,
                textShadow: '0 1px 0 rgba(0,0,0,0.06)'
              } as React.CSSProperties}
            >
              {ch}
            </span>
          );
        })}
      </span>
      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(-1 * var(--amp, 0px))); }
        }
      `}</style>
    </div>
  );
}

export default function Home() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [useTools, setUseTools] = useState(false);
  const [connections, setConnections] = useState('');
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);

  async function connect() {
    if (pcRef.current) return;

    // 1) Hent ephemeral session fra vårt API
    const body: Record<string, any> = {};
    if (useTools) {
      body.tools = [{ type: 'mcp', name: 'example' }];
    }
    if (connections) {
      try {
        body.connections = JSON.parse(connections);
      } catch (e) {
        console.error('Invalid connections JSON', e);
      }
    }

    const session = await fetch('/api/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

    // 2) Opprett peer connection
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // 3) Spill av remote audio (modellens tale)
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    audioRef.current.onplaying = () => setSpeaking(true);
    audioRef.current.onpause = () => setSpeaking(false);
    audioRef.current.onended = () => setSpeaking(false);
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      (audioRef.current as HTMLAudioElement).srcObject = stream;
      setRemoteStream(stream);
    };

    // 4) Legg til mic input
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    ms.getTracks().forEach(track => pc.addTrack(track, ms));
    setMicStream(ms);

    // 5) Datakanal for events/logging
    const dc = pc.createDataChannel('oai-events');
    dc.onopen = () => setLog(v => ['datachannel open', ...v]);
    dc.onmessage = (m) => setLog(v => [m.data, ...v]);

    // 6) Opprett offer og send til OpenAI
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const sdpResp = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.client_secret.value}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      }
    );

    const answer = { type: 'answer', sdp: await sdpResp.text() } as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(answer);
    setConnected(true);
  }

  function disconnect() {
    pcRef.current?.getSenders().forEach(s => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    setMicStream(null);
    setRemoteStream(null);
    setConnected(false);
    setSpeaking(false);
  }

  // Audio level analyser (mic + remote)
  useEffect(() => {
    if (!micStream && !remoteStream) return;
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    const merger = ac.createChannelMerger(2);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const sources: MediaStreamAudioSourceNode[] = [];
    if (micStream) {
      const src = ac.createMediaStreamSource(micStream);
      src.connect(merger, 0, 0);
      sources.push(src);
    }
    if (remoteStream) {
      const src = ac.createMediaStreamSource(remoteStream);
      src.connect(merger, 0, 1);
      sources.push(src);
    }
    merger.connect(analyser);

    let raf = 0 as number;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const smoothed = Math.min(1, Math.max(0, rms * 3));
      setLevel(prev => prev * 0.6 + smoothed * 0.4);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try { analyser.disconnect(); } catch {}
      try { merger.disconnect(); } catch {}
      sources.forEach(s => { try { s.disconnect(); } catch {} });
      try { ac.close(); } catch {}
    };
  }, [micStream, remoteStream]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-xl w-full space-y-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          <BouncyText text="avo.ninja – Realtime Voice" level={level} />
        </h1>
        <div className="flex gap-3">
          <button
            onClick={connect}
            disabled={connected}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
          >
            Start
          </button>
          <button
            onClick={disconnect}
            disabled={!connected}
            className="px-4 py-2 rounded border"
          >
            Stopp
          </button>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useTools}
              onChange={(e) => setUseTools(e.target.checked)}
            />
            Aktiver tools
          </label>
          <textarea
            className="w-full border rounded p-2 text-sm"
            placeholder="Connections JSON"
            value={connections}
            onChange={(e) => setConnections(e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-700">
          Trykk <b>Start</b>, gi mic-tilgang og snakk. Modellen svarer med stemme i sanntid.
        </p>
        <div className="text-xs text-gray-700/80">Lydnivå: {(level * 100).toFixed(0)}%</div>
        <audio ref={audioRef} />
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`w-3 h-3 rounded-full ${speaking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
          />
          <span className="text-gray-600">{speaking ? 'Modellen snakker' : 'Stille'}</span>
        </div>
        <div className="bg-white/70 backdrop-blur border rounded p-3 h-40 overflow-auto text-xs space-y-1">
          {log.map((l, i) => (
            <div key={i} className="px-2 py-1 rounded bg-white border">
              {l}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
