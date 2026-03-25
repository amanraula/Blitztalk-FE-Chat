export interface MediaItem {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: number;
  room: string;
  uploader: string;
}

export interface ChatMessage {
  name: string;
  message: string;
  self: boolean;
  kind?: "text" | "media";
  media?: MediaItem;
}
