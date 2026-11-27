"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DeviceId = "ma" | "juyel" | "mim";
type CallRole = "caller" | "callee" | "outgoing";
type IncomingSignal = {
  kind: "offer" | "answer" | "candidate";
  value: RTCSessionDescriptionInit | RTCIceCandidateInit;
};
type ServerEvent = {
  type: string;
  callId?: string;
  callType?: "audio" | "video";
  message?: string;
  signal?: IncomingSignal;
};

declare global {
  interface Window {
    __FAMILY_CALL_DEVICE?: { deviceToken: string; deviceId: DeviceId };
  }
}

const DEVICE_NAMES: Record<DeviceId, string> = { ma: "Ma", juyel: "Juyel", mim: "Mim" };

export default function CallPage() {
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef("");
  const roleRef = useRef<CallRole>("caller");
  const [callId, setCallId] = useState("");
  const [role, setRole] = useState<CallRole>("caller");
  const [deviceId, setDeviceId] = useState<DeviceId>("juyel");
  const [targetDevice, setTargetDevice] = useState<DeviceId | null>(null);
  const [token, setToken] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [status, setStatus] = useState("Connecting call…");
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialCallId = params.get("callId") || "";
    const initialRole = params.get("role") === "callee"
      ? "callee"
      : params.get("role") === "outgoing" ? "outgoing" : "caller";
    const target = params.get("to");
    const injected = window.__FAMILY_CALL_DEVICE;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const savedToken = injected?.deviceToken || fragment.get("deviceToken") || localStorage.getItem("family-call:device-token") || "";
    const savedDevice = injected?.deviceId || (fragment.get("deviceId") as DeviceId | null) || (localStorage.getItem("family-call:device-id") as DeviceId | null) || "juyel";
    if (fragment.has("deviceToken")) history.replaceState({}, "", window.location.pathname + window.location.search);

    callIdRef.current = initialCallId;
    roleRef.current = initialRole as CallRole;
    setCallId(initialCallId);
    setRole(initialRole as CallRole);
    setTargetDevice(target && ["ma", "juyel", "mim"].includes(target) ? target as DeviceId : null);
    setToken(savedToken);
    setDeviceId(savedDevice);
    setCallType(params.get("type") === "video" ? "video" : "audio");
  }, []);

  useEffect(() => {
    const initialCallId = callIdRef.current;
    if (!token || (!initialCallId && !targetDevice)) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let peer: RTCPeerConnection | null = null;
    let activeCallId = initialCallId;
    let activeRole: CallRole = roleRef.current;
    let pendingCandidates: RTCIceCandidateInit[] = [];

    const send = (event: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
    };

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

    async function handleSignal(event: ServerEvent) {
      if (!peer || !event.signal) return;
      const signal = event.signal;
      if (signal.kind === "offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.value as RTCSessionDescriptionInit));
        for (const candidate of pendingCandidates) {
          try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (iceError) { console.warn("ICE candidate rejected", iceError); }
        }
        pendingCandidates = [];
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send({ type: "call:signal", callId: activeCallId, signal: { kind: "answer", value: answer } });
        setStatus("Connecting audio…");
      } else if (signal.kind === "answer") {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.value as RTCSessionDescriptionInit));
        for (const candidate of pendingCandidates) {
          try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (iceError) { console.warn("ICE candidate rejected", iceError); }
        }
        pendingCandidates = [];
      } else if (signal.kind === "candidate") {
        const candidate = signal.value as RTCIceCandidateInit;
        if (peer.remoteDescription) {
          try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (iceError) { console.warn("ICE candidate rejected", iceError); }
        } else {
          pendingCandidates.push(candidate);
        }
      }
    }

    async function startSession() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone and camera access are not available in this browser.");
        }
        setStatus("Requesting microphone permission…");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: callType === "video"
            ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current && callType === "video") localVideoRef.current.srcObject = stream;

        peer = new RTCPeerConnection({
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
          ],
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
          if (peer.connectionState === "failed") {
            setError("The devices could not establish a media path. This network may require a TURN relay.");
          }
          if (peer.connectionState === "disconnected") setStatus("Reconnecting media…");
        };
        peer.onicecandidate = (event) => {
          if (event.candidate && activeCallId) {
            send({
              type: "call:signal",
              callId: activeCallId,
              signal: { kind: "candidate", value: event.candidate.toJSON() },
            });
          }
        };

        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(scheme + "//" + window.location.host + "/api/ws");
        socketRef.current = socket;
        socket.onopen = () => send({ type: "authenticate", token });

        socket.onmessage = async (message) => {
          let event: ServerEvent;
          try { event = JSON.parse(String(message.data)) as ServerEvent; } catch { return; }

          if (event.type === "authenticated") {
            if (activeCallId) {
              send({ type: "call:join", callId: activeCallId });
              setStatus("Waiting for family device…");
            } else if (targetDevice) {
              send({ type: "call:start", toDeviceId: targetDevice, callType });
              setStatus("Calling " + DEVICE_NAMES[targetDevice] + "…");
            }
            const heartbeatId = window.setInterval(() => send({ type: "heartbeat" }), 20000);
            socket?.addEventListener("close", () => window.clearInterval(heartbeatId), { once: true });
            return;
          }

          if (event.type === "call:outgoing" && event.callId) {
            activeCallId = event.callId;
            callIdRef.current = event.callId;
            setCallId(event.callId);
            setStatus("Ringing " + (targetDevice ? DEVICE_NAMES[targetDevice] : "family member") + "…");
            return;
          }

          if (event.type === "call:accepted" && event.callId) {
            activeCallId = event.callId;
            callIdRef.current = event.callId;
            activeRole = "caller";
            roleRef.current = "caller";
            setCallId(event.callId);
            setRole("caller");
            send({ type: "call:join", callId: event.callId });
            setStatus("Connecting…");
            return;
          }

          if (event.type === "call:peer-ready") {
            if (activeRole === "caller" && peer && !peer.localDescription) {
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              send({ type: "call:signal", callId: activeCallId, signal: { kind: "offer", value: offer } });
              setStatus("Calling…");
            }
            return;
          }

          if (event.type === "call:signal") {
            await handleSignal(event);
            return;
          }

          if (event.type === "call:ended" || event.type === "call:rejected" || event.type === "call:missed") {
            setStatus(event.type === "call:rejected" ? "Call declined" : "Call ended");
            stopSession();
            router.replace("/");
            return;
          }

          if (event.type === "error") setError(event.message || "A call signaling error occurred.");
        };

        socket.onclose = () => {
          if (!disposed) setStatus("Call connection closed");
        };
        socket.onerror = () => setError("The call signaling connection was interrupted.");
      } catch (sessionError) {
        setError(sessionError instanceof Error ? sessionError.message : "Could not start the call.");
      }
    }

    void startSession();
    return () => {
      disposed = true;
      stopSession();
    };
  }, [token, targetDevice, callType, router]);

  function hangUp() {
    const activeCallId = callIdRef.current;
    if (activeCallId && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "call:end", callId: activeCallId }));
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

  if (!token || (!callId && !targetDevice)) {
    return <main className="call-shell"><div className="call-placeholder"><div className="call-avatar">!</div><h1>Device setup needed</h1><p>Return to Family Call and pair this device first.</p><button className="primary-button" onClick={() => router.replace("/")}>Back to Family Call</button></div></main>;
  }

  return (
    <main className="call-shell">
      <header className="call-top"><strong>FAMILY CALL</strong><span>{callType.toUpperCase()} · {status}</span></header>
      <section className="call-stage">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline hidden={callType !== "video"} />
        {callType === "audio" && <div className="call-placeholder"><div className="call-avatar">{role === "callee" ? "☎" : "?"}</div><h1>{status === "Connected" ? "Connected" : "Calling your family"}</h1><p>{status}</p></div>}
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
