import { useEffect, useState } from "react";
import "./style.css";

const API_BASE = "https://blitztalk.in/";

interface Room {
  name: string;
  messageCount: number;
  mediaCount: number;
  onlineCount: number;
  createdAt: number | null;
  ttl: number;
}

const Admin = () => {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const headers = { "x-admin-password": password };

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/rooms`, { headers });
      if (res.status === 401) {
        setAuthed(false);
        setAuthError("Wrong password");
        return;
      }
      const data = await res.json();
      setRooms(data.rooms || []);
      setAuthed(true);
      setAuthError("");
    } catch {
      setAuthError("Server error — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchRooms();
  };

  const deleteRoom = async (roomName: string) => {
    if (!confirm(`Delete room "${roomName}" and kick all users?`)) return;
    setDeleting(roomName);
    try {
      await fetch(`${API_BASE}/api/admin/rooms/${encodeURIComponent(roomName)}`, {
        method: "DELETE",
        headers,
      });
      setRooms((prev) => prev.filter((r) => r.name !== roomName));
    } catch {
      alert("Failed to delete room");
    } finally {
      setDeleting(null);
    }
  };

  // Auto-refresh every 10s when authed
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(fetchRooms, 10000);
    return () => clearInterval(id);
  }, [authed, password]);

  const formatTTL = (seconds: number) => {
    if (seconds < 0) return "∞";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!authed) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <div className="admin-login-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1>Admin Access</h1>
          <p>Enter your admin password to continue</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={!password}>
              {loading ? "Checking..." : "Unlock"}
            </button>
          </form>
          {authError && <div className="admin-error">{authError}</div>}
          <a href="/" className="admin-back-link">← Back to Chat</a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <svg className="admin-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <div>
            <h1>BlitzTalk Admin</h1>
            <span className="admin-subtitle">Room Dashboard</span>
          </div>
        </div>
        <div className="admin-header-right">
          <button className="admin-refresh-btn" onClick={fetchRooms} disabled={loading}>
            {loading ? "⟳ Refreshing..." : "⟳ Refresh"}
          </button>
          <a href="/" className="admin-chat-link">← Chat</a>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-stats-bar">
          <div className="admin-stat">
            <span className="admin-stat-num">{rooms.length}</span>
            <span className="admin-stat-label">Active Rooms</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-num">{rooms.reduce((s, r) => s + r.onlineCount, 0)}</span>
            <span className="admin-stat-label">Users Online</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-num">{rooms.reduce((s, r) => s + r.messageCount, 0)}</span>
            <span className="admin-stat-label">Total Messages</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-num">{rooms.reduce((s, r) => s + r.mediaCount, 0)}</span>
            <span className="admin-stat-label">Media Files</span>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="admin-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 11.5a8.8 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <h3>No active rooms</h3>
            <p>Rooms will appear here when users start chatting</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Online</th>
                  <th>Messages</th>
                  <th>Media</th>
                  <th>Created</th>
                  <th>Expires In</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.name}>
                    <td className="admin-room-name">
                      <span className={`admin-dot ${room.onlineCount > 0 ? "online" : "empty"}`} />
                      {room.name}
                    </td>
                    <td>
                      <span className="admin-badge">{room.onlineCount}</span>
                    </td>
                    <td>{room.messageCount}</td>
                    <td>{room.mediaCount}</td>
                    <td className="admin-time">{formatTime(room.createdAt)}</td>
                    <td className="admin-ttl">{formatTTL(room.ttl)}</td>
                    <td>
                      <button
                        className="admin-delete-btn"
                        onClick={() => deleteRoom(room.name)}
                        disabled={deleting === room.name}
                      >
                        {deleting === room.name ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Admin;
