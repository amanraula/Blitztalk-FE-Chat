import { useEffect, useRef, useState, type ChangeEvent } from "react";
import socket from "./socket";
import { ChatMessage, MediaItem } from "./types";
import "./style.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || "blitztalk-media";
const MEDIA_PREFIX = "__MEDIA__|";

const generateRandomName = () => {
    const adj = ["Cool", "Silent", "Swift", "Cosmic", "Bold"];
    const noun = ["Wizard", "Fox", "Wolf", "Ninja", "Dragon"];
    return (
        adj[Math.floor(Math.random() * adj.length)] +
        noun[Math.floor(Math.random() * noun.length)] +
        Math.floor(Math.random() * 1000)
    );
};

const getInitialRoom = () => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    return roomParam && roomParam !== "global" ? roomParam : "";
};

const updateUrlRoom = (roomName: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomName || "global");
    window.history.replaceState({}, "", url.toString());
};

const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const encodeMediaMessage = (item: MediaItem) =>
    `${MEDIA_PREFIX}${encodeURIComponent(JSON.stringify(item))}`;

const decodeMediaMessage = (message: string): MediaItem | null => {
    if (!message.startsWith(MEDIA_PREFIX)) return null;
    try {
        return JSON.parse(decodeURIComponent(message.slice(MEDIA_PREFIX.length)));
    } catch {
        return null;
    }
};

const App = () => {
    const [connected, setConnected] = useState(false);
    const [room, setRoom] = useState(getInitialRoom());
    const [activeRoom, setActiveRoom] = useState(getInitialRoom() || "Global");
    const [name, setName] = useState(generateRandomName());
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [joined, setJoined] = useState(false);
    const [copied, setCopied] = useState<number | null>(null);
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [showMedia, setShowMedia] = useState(false);
    const [mediaFilter, setMediaFilter] = useState<"room" | "all">("room");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeUploadName, setActiveUploadName] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [isDarkMode, setIsDarkMode] = useState(() => {


        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return false; // Always start in light mode (false = light, true = dark)
    });
    const [showScrollButton, setShowScrollButton] = useState(false);

    const chatLogRef = useRef<HTMLDivElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!connected) return;

        const r = getInitialRoom(); // from URL
        socket.emit("join-room", r);
        setJoined(true);
        setActiveRoom(r || "Global");
    }, [connected]);

    // Theme handling
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    useEffect(() => {
        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));

        socket.on("receive-message", (data) => {
            if (data.name === name) return; // 👈 prevent self-echo
            const media = decodeMediaMessage(data.message);
            if (media) {
                setMediaItems(prev => [media, ...prev]);
                setMessages(prev => [...prev, { name: data.name, message: `File uploaded by ${data.name}`, self: false, kind: "media", media }]);
                return;
            }
            setMessages(prev => [...prev, { ...data, self: false, kind: "text" }]);
        });


        return () => {
            socket.off("connect");
            socket.off("disconnect");
            socket.off("receive-message");
        };
    }, []);

    useEffect(() => {
        const chat = chatLogRef.current;
        if (!chat) return;

        const { scrollTop, scrollHeight, clientHeight } = chat;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

        if (isNearBottom) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);


    // Scroll handler for "new messages" button
    const handleScroll = () => {
        const el = chatLogRef.current;
        if (!el) return;

        const { scrollTop, scrollHeight, clientHeight } = el;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;

        shouldAutoScrollRef.current = isAtBottom;
        setShowScrollButton(!isAtBottom);
    };


    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const joinRoom = () => {
        const r = room.trim();

        setMessages([]);       // clear ONLY on manual room switch
        socket.emit("join-room", r);

        setActiveRoom(r || "Global");
        updateUrlRoom(r);
        setJoined(true);
    };



    const sendMessage = () => {
        if (message.replace(/\s/g, "") === "") return;
        if (!joined) joinRoom();

        socket.emit("chat-message", room.trim(), name, message);
        setMessages(prev => [...prev, { name, message, self: true, kind: "text" }]);
        setMessage("");
    };

    const copyMessage = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopied(index);
        setTimeout(() => setCopied(null), 2000);
    };

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const buildPublicUrl = (path: string) =>
        `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;

    const getRoomName = () => (room.trim() ? room.trim() : "global");

    const handleFileButtonClick = () => {
        fileInputRef.current?.click();
    };

    const uploadFileWithProgress = (file: File, path: string) =>
        new Promise<void>((resolve, reject) => {
            const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`;
            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable) return;
                const percent = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(percent);
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    const detail = xhr.responseText ? `: ${xhr.responseText}` : "";
                    reject(new Error(`Upload failed (${xhr.status})${detail}`));
                }
            };

            xhr.onerror = () => reject(new Error("Upload failed"));
            xhr.open("POST", url, true);
            xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_KEY}`);
            xhr.setRequestHeader("apikey", SUPABASE_KEY);
            xhr.setRequestHeader("x-upsert", "true");
            xhr.setRequestHeader("cache-control", "3600");
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
        });

    const addMediaMessage = (item: MediaItem, self: boolean) => {
        setMediaItems(prev => [item, ...prev]);
        setMessages(prev => [
            ...prev,
            { name: item.uploader, message: `File uploaded by ${item.uploader}`, self, kind: "media", media: item }
        ]);
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!SUPABASE_URL || !SUPABASE_KEY || !SUPABASE_BUCKET) {
            setUploadError("Supabase env vars missing. Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_BUCKET.");
            return;
        }

        if (!joined) joinRoom();

        setUploading(true);
        setUploadProgress(0);
        setUploadError(null);
        setActiveUploadName(file.name);

        const roomName = getRoomName();
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const path = `${roomName}/${id}-${safeName}`;

        try {
            await uploadFileWithProgress(file, path);
            const now = Date.now();
            const mediaItem: MediaItem = {
                id,
                name: file.name,
                url: buildPublicUrl(path),
                type: file.type || "application/octet-stream",
                size: file.size,
                uploadedAt: now,
                room: roomName,
                uploader: name
            };

            addMediaMessage(mediaItem, true);
            socket.emit("chat-message", room.trim(), name, encodeMediaMessage(mediaItem));
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : "Upload failed");
        } finally {
            setUploading(false);
            setTimeout(() => setUploadProgress(0), 500);
            if (event.target) event.target.value = "";
        }
    };

    const handleDownload = (item: MediaItem) => {
        setDownloadProgress(prev => ({ ...prev, [item.id]: 0 }));
        const xhr = new XMLHttpRequest();
        xhr.responseType = "blob";
        xhr.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            setDownloadProgress(prev => ({ ...prev, [item.id]: percent }));
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const blobUrl = URL.createObjectURL(xhr.response);
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = item.name;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(blobUrl);
            }

            setTimeout(() => {
                setDownloadProgress(prev => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                });
            }, 800);
        };

        xhr.onerror = () => {
            setDownloadProgress(prev => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
        };

        xhr.open("GET", item.url, true);
        xhr.send();
    };

    const activeRoomKey = activeRoom === "Global" ? "global" : activeRoom;
    const filteredMedia =
        mediaFilter === "all"
            ? mediaItems
            : mediaItems.filter(item => item.room === activeRoomKey);
    const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_BUCKET);

    return (
        <div className="app-container">
            {/* Header */}
            <header className="navbar" style={{ flexShrink: 0, zIndex: 1 }}>
                <div className="nav-brand">
                    <div className="logo-container">
                        <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                    </div>
                    <div className="brand-info">
                        <h1 className="brand-name">BlitzTalk</h1>
                        <span className="brand-tagline">Real-time Chat</span>
                    </div>
                </div>

                <div className="nav-controls">
                    <button
                        className={`media-toggle ${showMedia ? "active" : ""}`}
                        onClick={() => setShowMedia(prev => !prev)}
                        aria-label="Open media library"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                            <path d="M10 14H3v7h7z"></path>
                        </svg>
                        <span className="media-label">Media</span>
                        <span className="media-count">{filteredMedia.length}</span>
                    </button>
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {isDarkMode ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="5" />
                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>

                    <div className="nav-status">
                        <div className={`status-badge ${connected ? "online" : "offline"}`}>
                            <span className="status-dot"></span>
                            <span className="status-text">{connected ? "Connected" : "Offline"}</span>
                        </div>
                        <div className="room-indicator">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="room-icon">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            <span className="room-name">{activeRoom}</span>
                        </div>
                    </div>
                    <a className="nav-claim" href="https://blitztalk.in" target="_blank" rel="noreferrer">
                        🎉Blitztalk.in gives you NO expiry Media ✨💓
                    </a>
                </div>
            </header>

            {/* Chat Area */}
            <main className="chat-container" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div
                    id="chat-log"
                    ref={chatLogRef}
                    onScroll={handleScroll}
                    style={{ flex: 1, overflowY: "auto" }}
                >
                    {messages.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-illustration">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                            </div>
                            <h3 className="empty-title">Start the conversation</h3>
                            <p className="empty-subtitle">Send a message to begin chatting in {activeRoom}</p>
                        </div>
                    ) : (
                        <div className="messages-list">
                            {messages.map((m, i) => {
                                const isMedia = m.kind === "media" && m.media;
                                const copyValue = isMedia && m.media ? m.media.url : (m.self ? m.message : `${m.name}: ${m.message}`);

                                return (
                                    <div
                                        key={i}
                                        className={`message-group ${m.self ? "sent" : "received"} ${copied === i ? "highlighted" : ""}`}
                                    >
                                        {!m.self && (
                                            <div className="avatar">
                                                <span>{m.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                        )}
                                        <div className="message-content">
                                            {!m.self && <span className="message-author">{m.name}</span>}
                                            <div className="message-bubble">
                                                {isMedia && m.media ? (
                                                    <div className="media-card">
                                                        <div className="media-preview">
                                                            {m.media.type.startsWith("image/") ? (
                                                                <img src={m.media.url} alt={m.media.name} loading="lazy" />
                                                            ) : m.media.type.startsWith("video/") ? (
                                                                <video src={m.media.url} controls preload="metadata" />
                                                            ) : m.media.type.startsWith("audio/") ? (
                                                                <audio src={m.media.url} controls preload="metadata" />
                                                            ) : (
                                                                <div className="media-file-icon">
                                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                                        <polyline points="14 2 14 8 20 8"></polyline>
                                                                    </svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="media-meta">
                                                            <div className="media-title">{m.media.name}</div>
                                                            <div className="media-note">File uploaded by {m.media.uploader}</div>
                                                            <div className="media-sub">
                                                                <span>{formatBytes(m.media.size)}</span>
                                                                <span>�</span>
                                                                <span>{new Date(m.media.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="media-actions">
                                                            <button
                                                                className="media-download"
                                                                onClick={() => handleDownload(m.media)}
                                                                disabled={downloadProgress[m.media.id] !== undefined}
                                                            >
                                                                {downloadProgress[m.media.id] !== undefined
                                                                    ? `${downloadProgress[m.media.id]}%`
                                                                    : "Download"}
                                                            </button>
                                                            {downloadProgress[m.media.id] !== undefined && (
                                                                <div className="media-progress">
                                                                    <div
                                                                        className="media-progress-fill"
                                                                        style={{ width: `${downloadProgress[m.media.id]}%` }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="message-text">{m.message}</div>
                                                )}
                                                <button
                                                    className={`copy-btn ${copied === i ? "copied" : ""}`}
                                                    onClick={() => copyMessage(copyValue, i)}
                                                    title="Copy message"
                                                    aria-label="Copy message"
                                                >
                                                    {copied === i ? (
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    ) : (
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                            <span className="message-time">
                                                {isMedia && m.media
                                                    ? new Date(m.media.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <button
                                                className={`copy-btn-bottom ${copied === i ? "copied" : ""}`}
                                                onClick={() => copyMessage(copyValue, i)}
                                                title="Copy message"
                                                aria-label="Copy message"
                                            >
                                                {copied === i ? (
                                                    <>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                        <span className="copy-label">Copied</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                        </svg>
                                                        <span className="copy-label">Copy</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* Scroll to bottom button */}
                {showScrollButton && (
                    <button className="scroll-bottom-btn" onClick={scrollToBottom}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        New messages
                    </button>
                )}
            </main>

            <div className={`media-backdrop ${showMedia ? "show" : ""}`} onClick={() => setShowMedia(false)} />
            <aside className={`media-drawer ${showMedia ? "open" : ""}`}>
                <div className="media-header">
                    <div>
                        <h3>Media Library</h3>
                        <p>{mediaFilter === "all" ? "All rooms" : `Room: ${activeRoom}`}</p>
                    </div>
                    <button className="media-close" onClick={() => setShowMedia(false)} aria-label="Close media">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="media-filters">
                    <button
                        className={`media-filter ${mediaFilter === "room" ? "active" : ""}`}
                        onClick={() => setMediaFilter("room")}
                    >
                        This room
                    </button>
                    <button
                        className={`media-filter ${mediaFilter === "all" ? "active" : ""}`}
                        onClick={() => setMediaFilter("all")}
                    >
                        All rooms
                    </button>
                </div>

                {!supabaseReady && (
                    <div className="media-warning">
                        Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_BUCKET` to enable uploads.
                    </div>
                )}

                <div className="media-list">
                    {filteredMedia.length === 0 ? (
                        <div className="media-empty">No media yet for this view.</div>
                    ) : (
                        filteredMedia.map((item) => {
                            const progress = downloadProgress[item.id];
                            return (
                                <div key={item.id} className="media-item">
                                    <div className="media-thumb">
                                        {item.type.startsWith("image/") ? (
                                            <img src={item.url} alt={item.name} loading="lazy" />
                                        ) : (
                                            <div className="media-file-icon">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                    <polyline points="14 2 14 8 20 8"></polyline>
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="media-details">
                                        <div className="media-title">{item.name}</div>
                                        <div className="media-sub">
                                            <span>{item.room}</span>
                                            <span>?</span>
                                            <span>{formatBytes(item.size)}</span>
                                        </div>
                                        <div className="media-sub">
                                            <span>By {item.uploader}</span>
                                            <span>?</span>
                                            <span>{new Date(item.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                    <div className="media-cta">
                                        <button
                                            className="media-download"
                                            onClick={() => handleDownload(item)}
                                            disabled={progress !== undefined}
                                        >
                                            {progress !== undefined ? `${progress}%` : "Download"}
                                        </button>
                                        {progress !== undefined && (
                                            <div className="media-progress">
                                                <div className="media-progress-fill" style={{ width: `${progress}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="media-footer">
                    Media stays available here with no expiring links.
                </div>
            </aside>

            {/* Input Area */}
            <footer className="input-section" style={{ flexShrink: 0 }}>
                <div className="controls-bar">
                    <div className="input-group room-group">
                        <label htmlFor="room-input">Room</label>
                        <input
                            id="room-input"
                            type="text"
                            placeholder="Global"
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    joinRoom();
                                }
                            }}

                            className="input-field"
                        />
                    </div>

                    <div className="input-group name-group">
                        <label htmlFor="name-input">Name</label>
                        <input
                            id="name-input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input-field"
                        />
                    </div>

                    <button
                        onClick={joinRoom}
                        className={`action-btn join-btn ${joined ? "active" : ""}`}
                    >
                        {joined ? "Joined" : "Join"}
                    </button>
                </div>

                <div className="message-bar">
                    <div className="message-input-wrapper">
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="file-input"
                            onChange={handleFileChange}
                        />
                        <button
                            type="button"
                            className={`upload-btn ${uploading ? "loading" : ""}`}
                            onClick={handleFileButtonClick}
                            disabled={uploading}
                            aria-label="Upload file"
                            title="Upload file"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </button>
                        <textarea
                            placeholder={`Message ${activeRoom}...`}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            className="message-input message-textarea"
                        />
                        <button
                            onClick={sendMessage}
                            className="send-btn"
                            disabled={message.replace(/\s/g, "") === ""}
                            aria-label="Send message"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>

                {(uploading || uploadProgress > 0 || uploadError) && (
                    <div className="upload-status">
                        <div className="upload-info">
                            <span className="upload-name">{activeUploadName || "File upload"}</span>
                            <span className={`upload-state ${uploadError ? "error" : ""}`}>
                                {uploadError ? uploadError : uploading ? "Uploading..." : "Upload complete"}
                            </span>
                            <span className="upload-percent">{uploadProgress}%</span>
                        </div>
                        <div className="upload-progress">
                            <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                        </div>
                    </div>
                )}
            </footer>


        </div>
    );
};

export default App;
