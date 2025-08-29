'use client';
import { useRef, useState } from 'react';

export default function Home() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function connect() {
    if (pcRef.current) return;

    // 1) Hent ephemeral session fra vårt API
    const session = await fetch('/api/realtime-token').then(r => r.json());

    // 2) Opprett peer connection
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // 3) Spill av remote audio (modellens tale)
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    pc.ontrack = (e) => {
      (audioRef.current as HTMLAudioElement).srcObject = e.streams[0];
    };

    // 4) Legg til mic input
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    ms.getTracks().forEach(track => pc.addTrack(track, ms));

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
    setConnected(false);
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-xl w-full space-y-4">
        <h1 className="text-2xl font-semibold">avo.ninja – Realtime Voice</h1>
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
        <p className="text-sm text-gray-600">
          Trykk <b>Start</b>, gi mic-tilgang og snakk. Modellen svarer med stemme i sanntid.
        </p>
        <audio ref={audioRef} />
        <div className="bg-gray-50 border rounded p-3 h-40 overflow-auto text-xs">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </main>
  );
}
