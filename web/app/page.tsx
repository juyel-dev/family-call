"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DeviceId = "ma" | "juyel" | "mim";
type IncomingCall = { callId: string; fromDeviceId: DeviceId; callType: "audio" | "video" };
type Device = { id: DeviceId; name: string; deviceLabel: string; initial: string; className: string };

const DEVICES: Device[] = [
  { id: "ma", name: "Ma", deviceLabel: "OPPO phone", initial: "Ma", className: "avatar-ma" },
  { id: "juyel", name: "Juyel", deviceLabel: "Laptop", initial: "J", className: "avatar-juyel" },
  { id: "mim", name: "Mim", deviceLabel: "Family phone", initial: "M", className: "avatar-mim" },
];

const LABELS: Record<DeviceId, string> = { ma: "Ma", juyel: "Juyel", mim: "Mim" };

export default function HomePage() {
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);
  const [deviceId, setDeviceId] = useState<DeviceId | null>(null);
  const [deviceToken, setDeviceToken] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupDevice, setSetupDevice] = useState<DeviceId>("juyel");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [connection, setConnection] = useState("Connecting…");
  const [currentPage, setCurrentPage] = useState<"call" | "missed" | "settings">("call");
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<{ callId: string; to: DeviceId; type: "audio" | "video" } | null>(null);
  const [onlineDevices, setOnlineDevices] = useState<DeviceId[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("family-call:device-token") || "";
    const savedDevice = localStorage.getItem("family-call:device-id") as DeviceId | null;
    if (token && savedDevice && DEVICES.some((d) => d.id === savedDevice)) {
      setDeviceToken(token);
      setDeviceId(savedDevice);
    } else {
      setConnection("Device setup needed");
    }
  }, []);

  const navigateToCall = useCallback((callId: string, role: "caller" | "callee") => {
    router.push("/call?callId=" + encodeURIComponent(callId) + "&role=" + role);
  }, [router]);

  useEffect(() => {
    if (!deviceToken || !deviceId) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(scheme + "//" + window.location.host + "/api/ws");
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectDelayRef.current = 1000;
        setConnection("Securing connection…");
        socket.send(JSON.stringify({ type: "authenticate", token: deviceToken }));
      });

      socket.addEventListener("message", (message) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(String(message.data)); } catch { return; }
        switch (event.type) {
          case "authenticated":
            setConnection("Connected");
            break;
          case "error":
            setConnection(String(event.message || "Connection error"));
            break;
          case "presence":
            setOnlineDevices(Array.isArray(event.online) ? event.online as DeviceId[] : []);
            break;
          case "call:incoming":
            setIncoming({
              callId: String(event.callId),
              fromDeviceId: event.fromDeviceId as DeviceId,
              callType: event.callType === "video" ? "video" : "audio",
            });
            break;
          case "call:outgoing":
            setOutgoing({ callId: String(event.callId), to: event.toDeviceId as DeviceId, type: event.callType === "video" ? "video" : "audio" });
            setConnection("Calling " + LABELS[event.toDeviceId as DeviceId] + "…");
            break;
          case "call:accepted":
            setIncoming(null);
            navigateToCall(String(event.callId), "caller");
            break;
          case "call:rejected":
            setOutgoing(null);
            setConnection("Call declined");
            break;
          case "call:ended":
            setIncoming(null);
            setOutgoing(null);
            setConnection("Connected");
            break;
          case "call:missed":
            setOutgoing(null);
            setConnection("No answer");
            break;
        }
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        setConnection("Reconnecting…");
        const delay = reconnectDelayRef.current;
        reconnectRef.current = window.setTimeout(connect, delay);
        reconnectDelayRef.current = Math.min(delay * 2, 30000);
      });

      socket.addEventListener("error", () => setConnection("Connection interrupted"));
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [deviceId, deviceToken, navigateToCall]);

  async function pairDevice(event: FormEvent) {
    event.preventDefault();
    setSetupBusy(true);
    setSetupError("");
    try {
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: setupDevice, pin: setupPin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not set up this device.");
      localStorage.setItem("family-call:device-token", result.deviceToken);
      localStorage.setItem("family-call:device-id", setupDevice);
      setDeviceToken(result.deviceToken);
      setDeviceId(setupDevice);
      setSetupPin("");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Setup failed.");
    } finally {
      setSetupBusy(false);
    }
  }

  function startCall(target: DeviceId, callType: "audio" | "video") {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setConnection("Connection is not ready. Keep this page open and try again.");
      return;
    }
    socket.send(JSON.stringify({ type: "call:start", toDeviceId: target, callType }));
  }

  function acceptIncoming() {
    if (!incoming) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setConnection("Reconnecting before accepting…");
      return;
    }
    socket.send(JSON.stringify({ type: "call:accept", callId: incoming.callId }));
    const callId = incoming.callId;
    setIncoming(null);
    navigateToCall(callId, "callee");
  }

  function rejectIncoming() {
    if (incoming && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "call:reject", callId: incoming.callId }));
    }
    setIncoming(null);
  }

  function hangUpOutgoing() {
    if (outgoing && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "call:cancel", callId: outgoing.callId }));
    }
    setOutgoing(null);
    setConnection("Connected");
  }

  if (!deviceToken || !deviceId) {
    return (
      <main className="modal-backdrop">
        <form className="modal" onSubmit={pairDevice}>
          <div className="modal-icon" aria-hidden="true">☎</div>
          <p className="eyebrow">ONE-TIME DEVICE SETUP</p>
          <h2>Welcome to Family Call</h2>
          <p className="modal-copy">Set up this device once. No account, password, or QR scan is needed. Choose the name for this device and enter the private family setup PIN.</p>
          <label className="field-label" htmlFor="device">This device belongs to</label>
          <select className="field-input" id="device" value={setupDevice} onChange={(e) => setSetupDevice(e.target.value as DeviceId)}>
            <option value="juyel">Juyel — Laptop</option>
            <option value="ma">Ma — OPPO phone</option>
            <option value="mim">Mim — Phone</option>
          </select>
          <label className="field-label" htmlFor="setup-pin">Private setup PIN</label>
          <input className="field-input" id="setup-pin" autoComplete="one-time-code" value={setupPin} onChange={(e) => setSetupPin(e.target.value)} placeholder="Enter setup PIN" required />
          {setupError && <p className="error-text" role="alert">{setupError}</p>}
          <button className="primary-button" type="submit" disabled={setupBusy || setupPin.trim().length < 6}>{setupBusy ? "Setting up…" : "Set up this device"}</button>
          <p className="bottom-note">Private family space · 3 devices only</p>
        </form>
      </main>
    );
  }

  const contacts = DEVICES.filter((d) => d.id !== deviceId);
  const activeDevice = DEVICES.find((d) => d.id === deviceId)!;

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Main navigation">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">☎</span>
            <span className="brand-copy"><strong>Family Call</strong><small>Private family space</small></span>
          </a>
          <div className="nav-section-label">WORKSPACE</div>
          <nav className="side-nav">
            <button className={"nav-item " + (currentPage === "call" ? "is-active" : "")} onClick={() => setCurrentPage("call")}><span className="nav-icon">☎</span><span>Call</span></button>
            <button className={"nav-item " + (currentPage === "missed" ? "is-active" : "")} onClick={() => setCurrentPage("missed")}><span className="nav-icon">◷</span><span>Missed calls</span><span className="nav-count">0</span></button>
            <button className={"nav-item " + (currentPage === "settings" ? "is-active" : "")} onClick={() => setCurrentPage("settings")}><span className="nav-icon">⚙</span><span>Settings</span></button>
          </nav>
          <div className="sidebar-spacer" />
          <div className="sidebar-foot"><span className="secure-dot" /><span>Made for three people</span></div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="mobile-brand"><span className="brand-mark small">☎</span><strong>Family Call</strong></div>
            <div className="topbar-spacer" />
            <div className="device-chip"><span className="device-avatar">{activeDevice.initial}</span><span className="device-name">{activeDevice.name + (deviceId === "juyel" ? "’s laptop" : "’s phone")}</span></div>
          </header>

          {currentPage === "call" && (
            <section className="page-view">
              <div className="page-heading">
                <div><p className="eyebrow">YOUR PRIVATE SPACE</p><h1>Call your family</h1><p className="page-subtitle">Choose someone and start an audio or video call.</p></div>
                <span className={"connection-pill " + (connection === "Connected" ? "connected" : "")}><span className="status-dot" />{connection}</span>
              </div>
              <div className={"setup-notice " + (connection === "Connected" ? "good" : "")} role="status">
                <span className="notice-icon">{connection === "Connected" ? "✓" : "i"}</span>
                <div><strong>{connection === "Connected" ? "This device is connected" : "Call connection is being prepared"}</strong><p>{connection === "Connected" ? "Your laptop is ready to receive calls while this page stays open." : "Keep this page open to receive incoming calls. Phone devices use push delivery while idle to save battery."}</p></div>
              </div>
              <div className="section-heading"><div><h2>Family contacts</h2><p>Only your family contacts appear here.</p></div><span className="contact-total">{contacts.length} contacts</span></div>
              <div className="contact-grid">
                {contacts.map((contact) => {
                  const online = onlineDevices.includes(contact.id);
                  return (
                    <article className="contact-card" key={contact.id}>
                      <div className="contact-card-top">
                        <div className={"person-avatar " + contact.className}>{contact.initial}</div>
                        <span className={"presence " + (online ? "presence-online" : "presence-pending")}><span />{online ? "Online" : "Available by call"}</span>
                      </div>
                      <div className="contact-info"><h3>{contact.name}</h3><p>{contact.deviceLabel}</p></div>
                      <div className="contact-actions">
                        <button className="action-button action-audio" onClick={() => startCall(contact.id, "audio")}><span>☎</span> Audio call</button>
                        <button className="action-button action-video" onClick={() => startCall(contact.id, "video")}><span>▣</span> Video call</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="bottom-note"><span className="lock-icon">▣</span>No login · No signup · No QR scan</div>
            </section>
          )}

          {currentPage === "missed" && (
            <section className="page-view">
              <div className="page-heading"><div><p className="eyebrow">CALL HISTORY</p><h1>Missed calls</h1><p className="page-subtitle">Calls you did not answer will appear here.</p></div></div>
              <div className="empty-state"><div className="empty-icon">◷</div><h2>No missed calls yet</h2><p>Missed calls will be listed here after call history is enabled.</p><button className="text-button" onClick={() => setCurrentPage("call")}>Back to contacts →</button></div>
            </section>
          )}

          {currentPage === "settings" && (
            <section className="page-view">
              <div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="page-subtitle">A few details about this device.</p></div></div>
              <div className="settings-layout">
                <article className="settings-card"><p className="settings-label">THIS DEVICE</p>
                  <div className="settings-row"><span className="settings-icon">⌨</span><span className="settings-copy"><strong>{activeDevice.name}</strong><small>{activeDevice.deviceLabel}</small></span><span className="settings-value">Connected</span></div>
                  <div className="settings-divider" />
                  <div className="settings-row"><span className="settings-icon">◉</span><span className="settings-copy"><strong>Family members</strong><small>Ma, Juyel, and Mim</small></span><span className="settings-value">3 people</span></div>
                </article>
                <article className="settings-card"><p className="settings-label">BATTERY & CALLING</p>
                  <div className="settings-row"><span className="settings-icon">◌</span><span className="settings-copy"><strong>Phone background service</strong><small>Phones sleep while idle; push wakes them for incoming calls.</small></span><span className="settings-value">Battery saving</span></div>
                  <div className="settings-divider" />
                  <div className="settings-row"><span className="settings-icon">⌁</span><span className="settings-copy"><strong>Call connection</strong><small>Vercel signaling + WebRTC media</small></span><span className="settings-value">{connection}</span></div>
                </article>
                <div className="settings-footnote"><strong>Private by design</strong><p>No public signup or account system. Only the three enrolled family devices can connect. Keep this laptop page open to receive calls.</p></div>
                <button className="secondary-button" onClick={() => { localStorage.removeItem("family-call:device-token"); localStorage.removeItem("family-call:device-id"); window.location.reload(); }}>Remove this device from this browser</button>
              </div>
            </section>
          )}

          <nav className="mobile-nav" aria-label="Mobile navigation">
            <button className={"mobile-nav-item " + (currentPage === "missed" ? "is-active" : "")} onClick={() => setCurrentPage("missed")}><span>◷</span><small>Missed</small></button>
            <button className={"mobile-nav-item " + (currentPage === "call" ? "is-active" : "")} onClick={() => setCurrentPage("call")}><span>☎</span><small>Call</small></button>
            <button className={"mobile-nav-item " + (currentPage === "settings" ? "is-active" : "")} onClick={() => setCurrentPage("settings")}><span>⚙</span><small>Setting</small></button>
          </nav>
        </main>
      </div>

      {incoming && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="incoming-title">
            <div className="modal-icon">☎</div>
            <p className="eyebrow">INCOMING {incoming.callType.toUpperCase()} CALL</p>
            <h2 id="incoming-title">{LABELS[incoming.fromDeviceId]} is calling</h2>
            <p className="modal-copy">Your family member is trying to reach you.</p>
            <div className="incoming-actions">
              <button className="reject-button" onClick={rejectIncoming}>Reject</button>
              <button className="accept-button" onClick={acceptIncoming}>Accept</button>
            </div>
          </section>
        </div>
      )}

      {outgoing && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true">
            <div className="modal-icon">☎</div>
            <p className="eyebrow">OUTGOING {outgoing.type.toUpperCase()} CALL</p>
            <h2>Calling {LABELS[outgoing.to]}…</h2>
            <p className="modal-copy">Waiting for your family member to answer.</p>
            <button className="reject-button" style={{ width: "100%" }} onClick={hangUpOutgoing}>Cancel call</button>
          </section>
        </div>
      )}
    </>
  );
}
