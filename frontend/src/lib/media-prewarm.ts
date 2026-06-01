import { mediaProxyUrl, type VideoInfo } from "@/lib/tauri";
import { collectVideoMedia, getMediaProxyType, isVideoLikeMedia } from "@/lib/video-media";

const PREWARM_RANGE = "bytes=0-4194303";
const PREWARM_HEADER = "X-Douyin-Prewarm";
const MAX_PREWARMED = 48;
const MAX_CONCURRENT_PREWARMS = 2;

const prewarmedUrls = new Set<string>();
const pendingUrls: string[] = [];
let activePrewarms = 0;

export function prewarmVideoForPlayback(video: VideoInfo | null | undefined) {
  const media = collectVideoMedia(video)[0];
  if (!media || !isVideoLikeMedia(media)) return;

  const url = mediaProxyUrl(media.url, getMediaProxyType(media));
  if (!url || prewarmedUrls.has(url) || pendingUrls.includes(url)) return;

  prewarmedUrls.add(url);
  if (prewarmedUrls.size > MAX_PREWARMED) {
    const first = prewarmedUrls.values().next().value;
    if (first) prewarmedUrls.delete(first);
  }

  pendingUrls.push(url);
  drainPrewarmQueue();
}

function drainPrewarmQueue() {
  while (activePrewarms < MAX_CONCURRENT_PREWARMS && pendingUrls.length > 0) {
    const url = pendingUrls.shift();
    if (!url) continue;
    activePrewarms += 1;
    void fetch(url, {
      headers: { Range: PREWARM_RANGE, [PREWARM_HEADER]: "1" },
      cache: "force-cache",
    })
      .then((response) => response.arrayBuffer())
      .catch(() => {
        prewarmedUrls.delete(url);
      })
      .finally(() => {
        activePrewarms = Math.max(0, activePrewarms - 1);
        drainPrewarmQueue();
      });
  }
}
