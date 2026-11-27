"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DeviceId = "ma" | "juyel" | "mim";
type SignalEvent =
  | { type: "call:peer-ready"; callId: string }
  | { type: "call:signal"; callId: string; fromDeviceId: DeviceId; signal: { kind: "offer" | "answer" | "candidate"; value: RTCSessionDescriptionInit | RTCIceCandidateInit } }
  | { type: "call:ended"; callId: string; reason?: string }
  | { type: "error"; message: string };

declare global {
  interface Window {
    __FAMILY_CALL_DEVICE?: { deviceToken: string; deviceId: DeviceId };
  }
}

export default function CallPage() {
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [callId, setCallId] = useState("");
  const [role, setRole] = useState<"caller" | "callee">("caller");
  const [deviceId, setDeviceId] = useState<DeviceId>("juyel");
  const [token, setToken] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [status, setStatus] = useState("Connecting call…");
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallId(params.get("callId") || "");
    setRole(params.get("role") === "callee" ? "callee" : "caller");
    const injected = window.__FAMILY_CALL_DEVICE;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const savedToken = injected?.deviceToken || fragment.get("deviceToken") || localStorage.getItem("family-call:device-token") || "";
    const savedDevice = injected?.deviceId || (fragment.get("deviceId") as DeviceId | null) || (localStorage.getItem("family-call:device-id") as DeviceId | null) || "juyel";
    if (fragment.has("deviceToken")) history.replaceState({}, "", window.location.pathname + window.location.search);
    setToken(savedToken);
    setDeviceId(savedDevice);
    setCallType(params.get("type") === "video" ? "video" : "audio");
  }, []);

  useEffect(() => {
    if (!callId || !token) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let peer: RTCPeerConnection | null = null;

    async function startSession() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone and camera access are not available in this browser.");
        setStatus("Requesting microphone permission…");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: callType === "video" ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current && callType === "video") localVideoRef.current.srcObject = stream;

        peer = new RTCPeerConnection({
          iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
        });
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer!.addTrack(track, stream));

        peer.ontrack = (event) => {
          const remote = event.streams[0];
          if (callType === "video" && remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
          if (callType === "audio" && remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
          setStatus("Connected");
        };
        peer.onconnectionstatechange = () => {
          if (!peer) return;
          if (peer.connectionState === "connected") setStatus("Connected");
          if (peer.connectionState === "failed") setError("The devices could not establish a media path. A TURN relay may be required on this network.");
          if (peer.connectionState === "disconnected") setStatus("Reconnecting media…");
        };

        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(scheme + "//" + window.location.host + "/api/ws");
        socketRef.current = socket;

        socket.onopen = () => {
          socket?.send(JSON.stringify({ type: "authenticate", token }));
        };

        socket.onmessage = async (message) => {
          let event: SignalEvent | { type: "authenticated" };
          try { event = JSON.parse(String(message.data)); } catch { return; }
          if (event.type === "authenticated") {
            socket?.send(JSON.stringify({ type: "call:join", callId }));
            const heartbeatId = window.setInterval(() => {
              if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
            }, 20000);
            socket?.addEventListener("close", () => window.clearInterval(heartbeatId), { once: true });
            setStatus("Waiting for family device…");
            return;
          }
          if (event.type === "call:peer-ready") {
            if (role === "caller" && peer && !peer.localDescription) {
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              socket?.send(JSON.stringify({ type: "call:signal", callId, signal: { kind: "offer", value: offer } }));
              setStatus("Calling…");
            }
            return;
          }
          if (event.type === "call:signal" && peer) {
            if (event.signal.kind === "offer") {
              await peer.setRemoteDescription(new RTCSessionDescription(event.signal.value as RTCSessionDescriptionInit));
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              socket?.send(JSON.stringify({ type: "call:signal", callId, signal: { kind: "answer", value: answer } }));
            } else if (event.signal.kind === "answer") {
              await peer.setRemoteDescription(new RTCSessionDescription(event.signal.value as RTCSessionDescriptionInit));
            } else if (event.signal.kind === "candidate") {
              try { await peer.addIceCandidate(new RTCIceCandidate(event.signal.value as RTCIceCandidateInit)); } catch (iceError) { console.warn("ICE candidate rejected", iceError); }
            }
            return;
          }
          if (event.type === "call:ended") {
            setStatus("Call ended");
            stopSession();
            router.replace("/");
          }
          if (event.type === "error") setError(event.message);
        };

        peer.onicecandidate = (event) => {
          if (event.candidate && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "call:signal", callId, signal: { kind: "candidate", value: event.candidate.toJSON() } }));
          }
        };
      } catch (sessionError) {
        setError(sessionError instanceof Error ? sessionError.message : "Could not start the call.");
      }
    }

    function stopSession() {
      peer?.close();
      peer = null;
      peerRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      socket?.close();
      socket = null;
      socketRef.current = null;
    }

    void startSession();
    return () => {
      disposed = true;
      stopSession();
    };
  }, [callId, token, role, callType, router]);

  function hangUp() {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "call:end", callId }));
    }
    peerRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    router.replace("/");
  }

  function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraEnabled(next);
  }

  if (!callId || !token) {
    return <main className="call-shell"><div className="call-placeholder"><div className="call-avatar">!</div><h1>Device setup needed</h1><p>Return to Family Call and pair this device first.</p><button className="primary-button" onClick={() => router.replace("/")}>Back to Family Call</button></div></main>;
  }

  return (
    <main className="call-shell">
      <header className="call-top"><strong>FAMILY CALL</strong><span>{callType.toUpperCase()} · {status}</span></header>
      <section className="call-stage">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline hidden={callType !== "video"} />
        {callType === "audio" && <div className="call-placeholder"><div className="call-avatar">{role === "caller" ? "?" : "☎"}</div><h1>{status === "Connected" ? "Connected" : "Calling your family"}</h1><p>Private family call</p></div>}
        <video ref={localVideoRef} className="local-video" autoPlay muted playsInline hidden={callType !== "video"} />
        <audio ref={remoteAudioRef} autoPlay playsInline />
      </section>
      {error && <p className="error-text" role="alert">{error}</p>}
      <footer className="call-controls">
        <button className="call-control" onClick={toggleMute}><strong>{muted ? "🔇" : "🎙"}</strong>{muted ? "Unmute" : "Mute"}</button>
        {callType === "video" && <button className="call-control" onClick={toggleCamera}><strong>{cameraEnabled ? "▣" : "◻"}</strong>{cameraEnabled ? "Camera on" : "Camera off"}</button>}
        <button className="call-control end" onClick={hangUp}><strong>✕</strong>End call</button>
      </footer>
    </main>
  );
}
