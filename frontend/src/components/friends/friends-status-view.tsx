import { useCallback, useEffect, useMemo, useRef, useState, type ElementType, type KeyboardEvent } from "react";
import { Activity, Loader2, MessageCircle, RefreshCw, Send, UserRound, Users, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getConfig, getFriendChatState, getFriendMessageHistory, getFriendOnlineStatus, listenEvent, saveConfig, saveFriendChatState, sendFriendMessage, verifyCookie, type FriendOnlineStatusResponse } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useSearchStore } from "@/stores/search-store";
import type { FriendMessageHistoryItem, UserInfo } from "@/lib/contracts";

interface FriendStatusItem {
  secUid: string;
  uid: string;
  nickname: string;
  remarkName: string;
  avatar: string;
  signature: string;
  online: boolean;
  statusText: string;
  lastActive: string;
  lastActiveTime: number;
}

type JsonRecord = Record<string, unknown>;

const STORAGE_KEY = "douyin.friendStatus.secUserIds";
const CHAT_DRAFTS_KEY = "douyin.friendStatus.chatDrafts";
const CHAT_MESSAGES_KEY = "douyin.friendStatus.chatMessages";
const CHAT_UNREAD_KEY = "douyin.friendStatus.unreadCounts";
const CHAT_SUMMARIES_KEY = "douyin.friendStatus.chatSummaries";
const ONLINE_WINDOW_SECONDS = 60;
const DEFAULT_REFRESH_INTERVAL_SECONDS = 5;

type ChatDrafts = Record<string, string>;
type HistoryPageState = Record<string, {
  loaded: boolean;
  loading: boolean;
  nextCursor: number;
  hasMore: boolean;
  error: string;
}>;
interface LocalChatMessage {
  id: string;
  text: string;
  createdAt: number;
  status: "pending" | "sent" | "error";
  direction?: "in" | "out";
  senderUid?: string;
  error?: string;
}
type ChatMessages = Record<string, LocalChatMessage[]>;
type UnreadCounts = Record<string, number>;
type ChatSummaries = Record<string, {
  latestMessage?: LocalChatMessage;
  latestMessageAt: number;
  unreadCount: number;
}>;

interface FriendListItem extends FriendStatusItem {
  latestMessage?: LocalChatMessage;
  latestMessageAt: number;
  previewText: string;
  unreadCount: number;
}

function readChatDrafts(): ChatDrafts {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_DRAFTS_KEY) || "{}");
    return isRecord(parsed) ? Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string"),
    ) as ChatDrafts : {};
  } catch {
    return {};
  }
}

function readChatMessages(): ChatMessages {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_MESSAGES_KEY) || "{}");
    if (!isRecord(parsed)) return {};
    const result: ChatMessages = {};
    for (const [secUid, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const messages: LocalChatMessage[] = value
        .filter(isRecord)
        .map((message) => ({
          id: stringField(message, ["id"]) || `${secUid}-${numberField(message, ["createdAt"])}-${Math.random()}`,
          text: stringField(message, ["text"]),
          createdAt: numberField(message, ["createdAt"]),
          status: normalizeMessageStatus(stringField(message, ["status"])),
          direction: normalizeMessageDirection(stringField(message, ["direction"])),
          senderUid: stringField(message, ["senderUid", "sender_uid"]),
          error: stringField(message, ["error"]) || undefined,
        }))
        .filter((message) => message.text && message.createdAt > 0);
      if (messages.length > 0) {
        result[secUid] = messages;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readUnreadCounts(): UnreadCounts {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_UNREAD_KEY) || "{}");
    if (!isRecord(parsed)) return {};
    const result: UnreadCounts = {};
    for (const [key, value] of Object.entries(parsed)) {
      const count = Math.max(0, Number(value) || 0);
      if (count > 0) result[key] = count;
    }
    return result;
  } catch {
    return {};
  }
}

function readChatSummaries(): ChatSummaries {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SUMMARIES_KEY) || "{}");
    if (!isRecord(parsed)) return {};
    const result: ChatSummaries = {};
    for (const [secUid, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue;
      const latestRaw = isRecord(value.latestMessage) ? value.latestMessage : undefined;
      const latestMessage = latestRaw ? {
        id: stringField(latestRaw, ["id"]) || `${secUid}-${numberField(latestRaw, ["createdAt"])}`,
        text: stringField(latestRaw, ["text"]),
        createdAt: numberField(latestRaw, ["createdAt"]),
        status: normalizeMessageStatus(stringField(latestRaw, ["status"])),
        direction: normalizeMessageDirection(stringField(latestRaw, ["direction"])),
        senderUid: stringField(latestRaw, ["senderUid", "sender_uid"]),
        error: stringField(latestRaw, ["error"]) || undefined,
      } : undefined;
      const latestMessageAt = Math.max(
        numberField(value, ["latestMessageAt"]),
        latestMessage?.createdAt || 0,
      );
      const unreadCount = Math.max(0, numberField(value, ["unreadCount"]));
      if (latestMessageAt > 0 || unreadCount > 0) {
        result[secUid] = {
          latestMessage: latestMessage?.text ? latestMessage : undefined,
          latestMessageAt,
          unreadCount,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function friendDisplayName(friend: FriendStatusItem | null | undefined) {
  return friend?.remarkName || friend?.nickname || "未知用户";
}

function latestChatMessage(messages: LocalChatMessage[] | undefined) {
  if (!messages || messages.length === 0) return undefined;
  return messages.reduce<LocalChatMessage | undefined>((latest, message) => {
    if (!latest || message.createdAt > latest.createdAt) return message;
    return latest;
  }, undefined);
}

function normalizeMessageStatus(value: string): LocalChatMessage["status"] {
  return value === "pending" || value === "sent" || value === "error" ? value : "sent";
}

function normalizeMessageDirection(value: string): LocalChatMessage["direction"] {
  return value === "in" ? "in" : "out";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function walkRecords(value: unknown, visit: (record: JsonRecord) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkRecords(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  Object.values(value).forEach((item) => walkRecords(item, visit));
}

function arrayField(value: unknown) {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function stringField(record: JsonRecord | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberField(record: JsonRecord | undefined, keys: string[]) {
  if (!record) return 0;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function extractSecUid(record: JsonRecord) {
  return stringField(record, ["sec_uid", "sec_user_id", "sec_user_id_str", "secUserId", "secUid"]);
}

function extractAvatar(record: JsonRecord | undefined) {
  const direct = stringField(record, ["avatar_thumb", "avatar_small", "avatar_medium", "avatar", "avatar_url"]);
  if (direct) return direct;
  if (!record) return "";
  for (const key of ["avatar_thumb", "avatar_small", "avatar_medium", "avatar_larger"]) {
    const value = record[key];
    if (isRecord(value) && Array.isArray(value.url_list)) {
      const first = value.url_list.find((item) => typeof item === "string" && item.trim());
      if (typeof first === "string") return first;
    }
  }
  return "";
}

function extractIds(text: string) {
  const matches = text.match(/MS4w\.?LjAB[A-Za-z0-9_-]+/g) || [];
  const lines = text
    .split(/[\n,\s]+/)
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item.startsWith("MS4wLjAB") || item.startsWith("MS4w.LjAB"));
  return Array.from(new Set([...matches, ...lines]));
}

function responseNowSeconds(response: FriendOnlineStatusResponse) {
  const active = response.active_status;
  if (isRecord(active) && isRecord(active.extra)) {
    const now = numberField(active.extra, ["now"]);
    if (now > 1_000_000_000_000) return Math.floor(now / 1000);
    if (now > 0) return Math.floor(now);
  }
  return Math.floor(Date.now() / 1000);
}

function formatLastActive(value: number) {
  if (!value) return "未显示";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUpdateTime(value: number) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMessageTime(value: number) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function collectRecordsBySecUid(value: unknown) {
  const map = new Map<string, JsonRecord>();
  const direct = arrayField(value);
  if (direct.length > 0) {
    direct.forEach((record) => {
      const secUid = extractSecUid(record);
      if (secUid) map.set(secUid, record);
    });
    return map;
  }

  walkRecords(value, (record) => {
    const secUid = extractSecUid(record);
    if (secUid) map.set(secUid, record);
  });
  return map;
}

function mapResponse(response: FriendOnlineStatusResponse): FriendStatusItem[] {
  const nowSeconds = responseNowSeconds(response);
  const users = collectRecordsBySecUid(response.user_info);
  const statuses = collectRecordsBySecUid(response.active_status);
  const ids = Array.from(new Set([...statuses.keys(), ...users.keys(), ...(response.sec_user_ids || [])]));

  return ids
    .map((secUid) => {
      const user = users.get(secUid);
      const status = statuses.get(secUid);
      const lastActiveTime = numberField(status, ["last_active_time", "active_time", "last_seen"]);
      const online =
        lastActiveTime > 0 &&
        nowSeconds - lastActiveTime >= 0 &&
        nowSeconds - lastActiveTime <= ONLINE_WINDOW_SECONDS;

      return {
        secUid,
        uid: stringField(user, ["uid", "user_id", "id", "uid_str", "short_id"]),
        nickname: stringField(user, ["nickname", "nick_name", "display_name", "unique_id"]),
        remarkName: stringField(user, ["remark_name"]),
        avatar: extractAvatar(user),
        signature: stringField(user, ["signature", "desc"]),
        online,
        statusText: online ? "在线" : lastActiveTime > 0 ? "最近活跃" : "未显示",
        lastActive: formatLastActive(lastActiveTime),
        lastActiveTime,
      };
    })
    .sort((a, b) => {
      if (!a.lastActiveTime && !b.lastActiveTime) return 0;
      if (!a.lastActiveTime) return 1;
      if (!b.lastActiveTime) return -1;
      return b.lastActiveTime - a.lastActiveTime;
    });
}

export function FriendsStatusView() {
  const setView = useAppStore((state) => state.setView);
  const setFriendUnreadCount = useAppStore((state) => state.setFriendUnreadCount);
  const openUser = useSearchStore((state) => state.openUser);
  const [input, setInput] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [chatDrafts, setChatDrafts] = useState<ChatDrafts>(() => readChatDrafts());
  const [chatMessages, setChatMessages] = useState<ChatMessages>(() => readChatMessages());
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>(() => readUnreadCounts());
  const [chatSummaries, setChatSummaries] = useState<ChatSummaries>(() => readChatSummaries());
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [historyState, setHistoryState] = useState<HistoryPageState>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [includeAllUsers, setIncludeAllUsers] = useState(false);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(DEFAULT_REFRESH_INTERVAL_SECONDS);
  const [currentUserAvatar, setCurrentUserAvatar] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<FriendOnlineStatusResponse | null>(null);
  const savedIdsRef = useRef<string[]>([]);
  const idsRef = useRef<string[]>([]);
  const queryInFlightRef = useRef(false);
  const initialInputRef = useRef(input);
  const chatStateLoadedRef = useRef(false);

  const ids = useMemo(() => extractIds(input), [input]);
  const friends = useMemo(() => (response?.success ? mapResponse(response) : []), [response]);
  const friendItems = useMemo<FriendListItem[]>(() => friends
    .map((friend) => {
      const latestMessage = latestChatMessage(chatMessages[friend.secUid]);
      const persistedSummary = chatSummaries[friend.secUid];
      const displayMessage = latestMessage && latestMessage.createdAt >= (persistedSummary?.latestMessageAt || 0)
        ? latestMessage
        : persistedSummary?.latestMessage;
      const previewText = latestMessage
        ? `${displayMessage?.direction === "out" ? "我：" : ""}${displayMessage?.text || latestMessage.text}`
        : displayMessage
          ? `${displayMessage.direction === "out" ? "我：" : ""}${displayMessage.text}`
        : friend.signature || friend.secUid;
      return {
        ...friend,
        latestMessage: displayMessage,
        latestMessageAt: Math.max(latestMessage?.createdAt || 0, persistedSummary?.latestMessageAt || 0),
        previewText,
        unreadCount: Math.max(unreadCounts[friend.secUid] || 0, persistedSummary?.unreadCount || 0),
      };
    })
    .sort((a, b) => {
      if (a.latestMessageAt || b.latestMessageAt) {
        return b.latestMessageAt - a.latestMessageAt;
      }
      if (a.lastActiveTime || b.lastActiveTime) {
        return b.lastActiveTime - a.lastActiveTime;
      }
      return 0;
    }), [chatMessages, chatSummaries, friends, unreadCounts]);
  const selectedFriend = useMemo(
    () => friendItems.find((friend) => friend.secUid === selectedFriendId) || friendItems[0] || null,
    [friendItems, selectedFriendId],
  );
  const selectedMessages = selectedFriend ? chatMessages[selectedFriend.secUid] || [] : [];
  const selectedHistory = selectedFriend ? historyState[selectedFriend.secUid] : undefined;
  const onlineCount = friends.filter((friend) => friend.online).length;
  const offlineCount = friends.filter((friend) => !friend.online).length;
  const isInitialLoading = loading && friends.length === 0;

  const openFriendProfile = useCallback(
    async (friend: FriendStatusItem) => {
      const user: UserInfo = {
        uid: friend.uid,
        nickname: friend.remarkName || friend.nickname || "未知用户",
        avatar_thumb: friend.avatar,
        avatar_medium: friend.avatar,
        avatar_larger: friend.avatar,
        signature: friend.signature,
        follower_count: 0,
        following_count: 0,
        total_favorited: 0,
        aweme_count: 0,
        favoriting_count: 0,
        is_follow: false,
        sec_uid: friend.secUid,
        unique_id: "",
        verify_status: 0,
      };
      setView("user");
      await openUser(user, { loadVideos: true });
    },
    [openUser, setView],
  );

  useEffect(() => {
    let cancelled = false;
    void getFriendChatState()
      .then((result) => {
        if (cancelled) return;
        chatStateLoadedRef.current = true;
        const summaries = isRecord(result.summaries) ? result.summaries : {};
        const unread = isRecord(result.unreadCounts) ? result.unreadCounts : {};
        const nextSummaries = readChatSummaries();
        for (const [secUid, value] of Object.entries(summaries)) {
          if (!isRecord(value)) continue;
          const latestRaw = isRecord(value.latestMessage) ? value.latestMessage : undefined;
          const latestMessage = latestRaw ? {
            id: stringField(latestRaw, ["id"]) || `${secUid}-${numberField(latestRaw, ["createdAt"])}`,
            text: stringField(latestRaw, ["text"]),
            createdAt: numberField(latestRaw, ["createdAt"]),
            status: normalizeMessageStatus(stringField(latestRaw, ["status"])),
            direction: normalizeMessageDirection(stringField(latestRaw, ["direction"])),
            senderUid: stringField(latestRaw, ["senderUid", "sender_uid"]),
            error: stringField(latestRaw, ["error"]) || undefined,
          } : undefined;
          const latestMessageAt = Math.max(numberField(value, ["latestMessageAt"]), latestMessage?.createdAt || 0);
          const unreadCount = Math.max(0, numberField(value, ["unreadCount"]));
          const current = nextSummaries[secUid];
          if (latestMessageAt >= (current?.latestMessageAt || 0)) {
            nextSummaries[secUid] = {
              latestMessage: latestMessage?.text ? latestMessage : current?.latestMessage,
              latestMessageAt,
              unreadCount: Math.max(unreadCount, current?.unreadCount || 0),
            };
          }
        }
        for (const [secUid, value] of Object.entries(unread)) {
          const count = Math.max(0, Number(value) || 0);
          if (!count) continue;
          nextSummaries[secUid] = {
            latestMessage: nextSummaries[secUid]?.latestMessage,
            latestMessageAt: nextSummaries[secUid]?.latestMessageAt || 0,
            unreadCount: Math.max(count, nextSummaries[secUid]?.unreadCount || 0),
          };
        }
        localStorage.setItem(CHAT_SUMMARIES_KEY, JSON.stringify(nextSummaries));
        setChatSummaries(nextSummaries);
        setUnreadCounts((current) => {
          const next = { ...current };
          for (const [secUid, summary] of Object.entries(nextSummaries)) {
            if (summary.unreadCount > 0) next[secUid] = Math.max(next[secUid] || 0, summary.unreadCount);
          }
          localStorage.setItem(CHAT_UNREAD_KEY, JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {
        chatStateLoadedRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setChatSummaries((current) => {
      let changed = false;
      const next: ChatSummaries = { ...current };
      for (const [secUid, messages] of Object.entries(chatMessages)) {
        const latestMessage = latestChatMessage(messages);
        if (!latestMessage) continue;
        const unreadCount = unreadCounts[secUid] || 0;
        const currentSummary = next[secUid];
        if (
          latestMessage.createdAt >= (currentSummary?.latestMessageAt || 0) ||
          unreadCount !== (currentSummary?.unreadCount || 0)
        ) {
          next[secUid] = {
            latestMessage,
            latestMessageAt: Math.max(latestMessage.createdAt, currentSummary?.latestMessageAt || 0),
            unreadCount,
          };
          changed = true;
        }
      }
      for (const [secUid, count] of Object.entries(unreadCounts)) {
        if ((next[secUid]?.unreadCount || 0) === count) continue;
        next[secUid] = {
          latestMessage: next[secUid]?.latestMessage,
          latestMessageAt: next[secUid]?.latestMessageAt || 0,
          unreadCount: count,
        };
        changed = true;
      }
      if (!changed) return current;
      localStorage.setItem(CHAT_SUMMARIES_KEY, JSON.stringify(next));
      return next;
    });
  }, [chatMessages, unreadCounts]);

  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    setFriendUnreadCount(total);
  }, [setFriendUnreadCount, unreadCounts]);

  useEffect(() => {
    if (!chatStateLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveFriendChatState({
        summaries: chatSummaries,
        unreadCounts,
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [chatSummaries, unreadCounts]);

  const updateDraft = useCallback((secUid: string, value: string) => {
    setChatDrafts((current) => {
      const next = { ...current };
      if (value) {
        next[secUid] = value;
      } else {
        delete next[secUid];
      }
      localStorage.setItem(CHAT_DRAFTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const patchMessage = useCallback((secUid: string, messageId: string, patch: Partial<LocalChatMessage>) => {
    setChatMessages((current) => {
      const next = {
        ...current,
        [secUid]: (current[secUid] || []).map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      };
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearUnread = useCallback((secUid: string) => {
    setUnreadCounts((current) => {
      if (!current[secUid]) return current;
      const next = { ...current };
      delete next[secUid];
      localStorage.setItem(CHAT_UNREAD_KEY, JSON.stringify(next));
      return next;
    });
    setChatSummaries((current) => {
      const summary = current[secUid];
      if (!summary || summary.unreadCount === 0) return current;
      const next = {
        ...current,
        [secUid]: {
          ...summary,
          unreadCount: 0,
        },
      };
      localStorage.setItem(CHAT_SUMMARIES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sendLocalMessage = useCallback(async (friend: FriendStatusItem, value: string) => {
    const text = value.trim();
    if (!text) return;
    const message: LocalChatMessage = {
      id: `${friend.secUid}-${Date.now()}`,
      text,
      createdAt: Date.now(),
      status: "pending",
      direction: "out",
    };
    setChatMessages((current) => {
      const next = {
        ...current,
        [friend.secUid]: [...(current[friend.secUid] || []), message],
      };
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(next));
      return next;
    });
    updateDraft(friend.secUid, "");

    if (!friend.uid) {
      patchMessage(friend.secUid, message.id, {
        status: "error",
        error: "缺少好友数字 uid，无法发送",
      });
      return;
    }

    try {
      const result = await sendFriendMessage({ toUserId: friend.uid, content: text });
      if (!result.success) {
        throw new Error(result.message || "发送失败");
      }
      patchMessage(friend.secUid, message.id, { status: "sent", error: "" });
    } catch (caught) {
      patchMessage(friend.secUid, message.id, {
        status: "error",
        error: caught instanceof Error ? caught.message : "发送失败",
      });
    }
  }, [patchMessage, updateDraft]);

  const selectFriend = useCallback((friend: FriendStatusItem) => {
    setSelectedFriendId(friend.secUid);
    clearUnread(friend.secUid);
  }, [clearUnread]);

  const mergeHistoryMessages = useCallback((items: FriendMessageHistoryItem[], fallbackFriend?: FriendStatusItem | null) => {
    if (!items.length) return 0;
    let mergedCount = 0;
    setChatMessages((current) => {
      const next: ChatMessages = { ...current };
      for (const item of items) {
        const conversationId = stringField(item as JsonRecord, ["conversation_id", "conversationId"]);
        const senderUid = stringField(item as JsonRecord, ["sender_uid", "senderUid"]);
        const text = stringField(item as JsonRecord, ["content", "text"]);
        const messageId = stringField(item as JsonRecord, ["server_message_id", "message_id", "id"]);
        if (!text) continue;
        const friend = fallbackFriend || friends.find((candidate) =>
          (senderUid && candidate.uid === senderUid) ||
          (candidate.uid && conversationId.includes(candidate.uid))
        );
        if (!friend) continue;
        const rawCreatedAt = numberField(item as JsonRecord, ["created_at", "createdAt", "create_time", "createTime"]);
        const createdAt = rawCreatedAt > 0 && rawCreatedAt < 10_000_000_000
          ? rawCreatedAt * 1000
          : rawCreatedAt || Date.now();
        const message: LocalChatMessage = {
          id: messageId || `${friend.secUid}-${createdAt}`,
          text,
          createdAt,
          status: "sent",
          direction: senderUid && senderUid === friend.uid ? "in" : "out",
          senderUid,
        };
        const currentMessages = next[friend.secUid] || [];
        if (currentMessages.some((existing) => existing.id === message.id)) continue;
        next[friend.secUid] = [...currentMessages, message].sort((a, b) => a.createdAt - b.createdAt);
        mergedCount += 1;
      }
      if (mergedCount > 0) {
        localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(next));
        return next;
      }
      return current;
    });
    return mergedCount;
  }, [friends]);

  const loadHistoryMessages = useCallback(async (friend: FriendStatusItem, cursor = 0) => {
    const current = historyState[friend.secUid];
    if (current?.loading) return;
    if (cursor > 0 && current?.hasMore === false) return;
    setHistoryState((state) => ({
      ...state,
      [friend.secUid]: {
        loaded: Boolean(state[friend.secUid]?.loaded),
        loading: true,
        nextCursor: state[friend.secUid]?.nextCursor || 0,
        hasMore: state[friend.secUid]?.hasMore ?? true,
        error: "",
      },
    }));
    try {
      const result = await getFriendMessageHistory({ cursor, toUserId: friend.uid });
      if (!result.success) {
        throw new Error(result.message || "获取历史消息失败");
      }
      const messages = Array.isArray(result.messages) ? result.messages : [];
      mergeHistoryMessages(messages, friend);
      const nextCursor = Number(result.next_cursor || 0) || 0;
      setHistoryState((state) => ({
        ...state,
        [friend.secUid]: {
          loaded: true,
          loading: false,
          nextCursor,
          hasMore: Boolean(nextCursor && messages.length > 0),
          error: "",
        },
      }));
    } catch (caught) {
      setHistoryState((state) => ({
        ...state,
        [friend.secUid]: {
          loaded: Boolean(state[friend.secUid]?.loaded),
          loading: false,
          nextCursor: state[friend.secUid]?.nextCursor || 0,
          hasMore: state[friend.secUid]?.hasMore ?? true,
          error: caught instanceof Error ? caught.message : "获取历史消息失败",
        },
      }));
    }
  }, [historyState, mergeHistoryMessages]);

  useEffect(() => {
    if (!selectedFriend || !selectedFriend.uid) return;
    const current = historyState[selectedFriend.secUid];
    if (current?.loaded || current?.loading) return;
    void loadHistoryMessages(selectedFriend, 0);
  }, [historyState, loadHistoryMessages, selectedFriend]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenEvent<Record<string, unknown>>("im-message", (payload) => {
      if (disposed || !payload || typeof payload !== "object") return;
      const senderUid = stringField(payload, ["sender_uid", "senderUid"]);
      const text = stringField(payload, ["content", "text"]);
      const serverMessageId = stringField(payload, ["server_message_id", "message_id", "id"]);
      if (!senderUid || !text) return;
      const friend = friends.find((item) => item.uid === senderUid);
      if (!friend) return;
      const message: LocalChatMessage = {
        id: serverMessageId || `${friend.secUid}-${Date.now()}`,
        text,
        createdAt: numberField(payload, ["created_at", "createdAt"]) || Date.now(),
        status: "sent",
        direction: "in",
        senderUid,
      };
      setChatMessages((current) => {
        const currentMessages = current[friend.secUid] || [];
        if (currentMessages.some((item) => item.id === message.id)) return current;
        const next = {
          ...current,
          [friend.secUid]: [...currentMessages, message],
        };
        localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(next));
        return next;
      });
      if (friend.secUid !== selectedFriendId) {
        setUnreadCounts((current) => {
          const next = {
            ...current,
            [friend.secUid]: (current[friend.secUid] || 0) + 1,
          };
          localStorage.setItem(CHAT_UNREAD_KEY, JSON.stringify(next));
          return next;
        });
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [friends, selectedFriendId]);

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    savedIdsRef.current = savedIds;
  }, [savedIds]);

  useEffect(() => {
    if (friends.length === 0) {
      setSelectedFriendId("");
      return;
    }
    if (!selectedFriendId || !friends.some((friend) => friend.secUid === selectedFriendId)) {
      setSelectedFriendId(friendItems[0]?.secUid || friends[0].secUid);
    }
  }, [friendItems, friends, selectedFriendId]);

  useEffect(() => {
    if (selectedFriend) {
      clearUnread(selectedFriend.secUid);
    }
  }, [clearUnread, selectedFriend]);

  const query = useCallback(async (overrideIds?: string[], options?: { background?: boolean }) => {
    if (queryInFlightRef.current) return;
    const background = Boolean(options?.background);
    const baseIds = overrideIds ?? savedIdsRef.current;
    const queryIds = Array.from(new Set([...baseIds, ...idsRef.current]));
    queryInFlightRef.current = true;
    if (!background) {
      setError("");
      setLoading(true);
    } else {
      setBackgroundRefreshing(true);
    }
    try {
      localStorage.setItem(STORAGE_KEY, queryIds.join("\n"));
      const result = await getFriendOnlineStatus(queryIds);
      const hasUsableData = Boolean(
        result.success ||
        (Array.isArray(result.sec_user_ids) && result.sec_user_ids.length > 0) ||
        mapResponse(result).length > 0,
      );
      if (hasUsableData) {
        setResponse(result);
        setLastUpdatedAt(Date.now());
        setError("");
      }
      if (hasUsableData && Array.isArray(result.sec_user_ids)) {
        setSavedIds(result.sec_user_ids);
        setSavedCount(result.sec_user_ids.length);
        setInput(result.sec_user_ids.join("\n"));
        localStorage.setItem(STORAGE_KEY, result.sec_user_ids.join("\n"));
      }
      if (!hasUsableData && !background) {
        setError(result.message || "获取好友在线状态失败");
      }
    } catch (caught) {
      if (!background) {
        setError(caught instanceof Error ? caught.message : "获取好友在线状态失败");
      }
    } finally {
      queryInFlightRef.current = false;
      if (background) {
        setBackgroundRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void getConfig()
      .then((config) => {
        if (disposed) return;
        const savedIds = Array.isArray(config.im_friend_sec_user_ids)
          ? config.im_friend_sec_user_ids.filter(Boolean)
          : [];
        setSavedIds(savedIds);
        setSavedCount(savedIds.length);
        const nextInterval = Number(config.im_friend_refresh_interval_seconds) || DEFAULT_REFRESH_INTERVAL_SECONDS;
        setIncludeAllUsers(Boolean(config.im_friend_include_all_users));
        setRefreshIntervalSeconds(Math.max(0, nextInterval));
        if (!initialInputRef.current.trim() && savedIds.length > 0) {
          setInput(savedIds.join("\n"));
        }
        void query(savedIds);
      })
      .catch(() => {
        if (!disposed) void query([]);
      });
    return () => {
      disposed = true;
    };
  }, [query]);

  useEffect(() => {
    let disposed = false;
    void verifyCookie()
      .then((status) => {
        if (disposed || !status.valid) return;
        setCurrentUserAvatar(status.avatar_thumb || status.avatar_medium || status.avatar_larger || "");
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  const toggleIncludeAllUsers = async () => {
    const nextValue = !includeAllUsers;
    const previousValue = includeAllUsers;
    setIncludeAllUsers(nextValue);
    setError("");
    try {
      const result = await saveConfig({ im_friend_include_all_users: nextValue });
      if (!result.success) {
        throw new Error(result.message || "保存好友范围设置失败");
      }
      void query([], { background: friends.length > 0 });
    } catch (caught) {
      setIncludeAllUsers(previousValue);
      setError(caught instanceof Error ? caught.message : "保存好友范围设置失败");
    }
  };

  useEffect(() => {
    if (refreshIntervalSeconds <= 0) return;
    const timer = window.setInterval(() => {
      void query(undefined, { background: true });
    }, Math.max(1, refreshIntervalSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [query, refreshIntervalSeconds]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1320px] flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h3 className="text-[0.95rem] font-semibold text-text">好友</h3>
          <span className="truncate text-[0.72rem] text-text-muted">
            {savedCount > 0 ? `已保存 ${savedCount}` : `${friends.length || ids.length} 个好友`}
            {backgroundRefreshing
              ? " · 正在更新"
              : lastUpdatedAt
                ? ` · 上次更新于 ${formatUpdateTime(lastUpdatedAt)}`
                : ""}
          </span>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualInput((value) => !value)}
            className="h-9"
          >
            备用 ID
            <Badge variant="secondary" size="sm">{ids.length}</Badge>
          </Button>
          {showManualInput && (
            <div className="absolute right-0 top-11 z-30 w-[min(420px,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-border bg-background p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[0.76rem] font-semibold text-text-secondary">备用 ID 输入</span>
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="text-[0.72rem] text-text-muted hover:text-text"
                >
                  收起
                </button>
              </div>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="MS4w... 每行一个，或粘贴 curl 参数"
                className="min-h-[136px] resize-none bg-surface-solid"
                spellCheck={false}
              />
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={includeAllUsers}
            onClick={() => void toggleIncludeAllUsers()}
            disabled={loading}
            className={cn(
              "flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-[0.76rem] transition",
              includeAllUsers
                ? "border-accent/35 bg-accent-soft text-accent"
                : "border-border bg-surface-solid text-text-muted hover:text-text",
              loading && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              className={cn(
                "relative h-4 w-7 rounded-full transition",
                includeAllUsers ? "bg-accent" : "bg-border-strong",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition",
                  includeAllUsers ? "left-3.5" : "left-0.5",
                )}
              />
            </span>
            {includeAllUsers ? "全部用户" : "仅互关"}
          </button>
          <Button size="sm" onClick={() => void query()} disabled={loading} className="h-9">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新状态
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger-soft px-3 py-2 text-[0.78rem] text-danger">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface-solid/70 p-3 shadow-[var(--shadow-sm)]">
        <div className="mb-3 grid shrink-0 grid-cols-3 gap-1.5">
          <Metric label="总数" value={friends.length || ids.length} icon={Users} />
          <Metric label="在线" value={onlineCount} icon={Wifi} tone="success" />
          <Metric label="未在线" value={offlineCount} icon={WifiOff} tone="muted" />
        </div>

        {isInitialLoading ? (
          <div className="flex min-h-[280px] items-center justify-center text-[0.82rem] text-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在查询
          </div>
        ) : friendItems.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] border border-border bg-surface">
              <Users className="h-5 w-5 text-text-muted" />
            </div>
            <p className="text-[0.86rem] text-text-secondary">等待查询</p>
            <p className="mt-1 text-[0.75rem] text-text-muted">点刷新自动获取；若没有返回列表，可展开备用输入缓存一次</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pr-1">
            {friendItems.map((friend) => (
              <FriendRow
                key={friend.secUid}
                friend={friend}
                selected={friend.secUid === selectedFriend?.secUid}
                onSelect={selectFriend}
                onOpenProfile={openFriendProfile}
              />
            ))}
          </div>
        )}
      </section>

      <ChatWorkspace
        friend={selectedFriend}
        draft={selectedFriend ? chatDrafts[selectedFriend.secUid] || "" : ""}
        messages={selectedMessages}
        historyError={selectedHistory?.error || ""}
        historyLoading={Boolean(selectedHistory?.loading)}
        canLoadOlder={Boolean(selectedFriend && selectedHistory?.nextCursor && selectedHistory.hasMore !== false)}
        currentUserAvatar={currentUserAvatar}
        onDraftChange={updateDraft}
        onSendMessage={sendLocalMessage}
        onLoadOlder={() => selectedFriend && selectedHistory?.nextCursor ? loadHistoryMessages(selectedFriend, selectedHistory.nextCursor) : Promise.resolve()}
        onOpenProfile={openFriendProfile}
      />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: ElementType;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[0.68rem] text-text-muted">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "success" && "text-success",
            tone === "muted" && "text-text-muted"
          )}
        />
        {label}
      </div>
      <div className="mt-0.5 text-[1rem] font-bold tabular-nums text-text">{value}</div>
    </div>
  );
}

function FriendRow({
  friend,
  selected,
  onSelect,
  onOpenProfile,
}: {
  friend: FriendListItem;
  selected: boolean;
  onSelect: (friend: FriendListItem) => void;
  onOpenProfile: (friend: FriendListItem) => Promise<void>;
}) {
  const rightLabel = friend.latestMessageAt ? formatMessageTime(friend.latestMessageAt) : friend.lastActive;
  return (
    <button
      type="button"
      onClick={() => onSelect(friend)}
      className={cn(
        "grid grid-cols-[34px_1fr_auto] items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow,transform]",
        selected
          ? "border-accent/35 bg-accent-soft shadow-[inset_0_0_0_1px_rgba(254,44,85,0.04)]"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-raised",
      )}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label="打开主页"
        onClick={(event) => {
          event.stopPropagation();
          void onOpenProfile(friend);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          void onOpenProfile(friend);
        }}
        className="relative h-8 w-8 overflow-hidden rounded-full bg-surface-raised outline-none ring-accent/35 transition hover:ring-2 focus-visible:ring-2"
      >
        {friend.avatar ? (
          <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[0.75rem] font-bold text-text-muted">
            {(friend.remarkName || friend.nickname).slice(0, 1) || "友"}
          </div>
        )}
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
            friend.online ? "bg-success" : "bg-text-muted"
          )}
        />
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[0.8rem] font-semibold text-text">
            {friend.remarkName || friend.nickname || "未知用户"}
          </span>
          <Badge variant={friend.online ? "success" : "secondary"} size="sm">
            {friend.statusText}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[0.68rem] text-text-muted">
          {friend.previewText}
        </div>
      </div>

      <div className="flex min-w-[44px] flex-col items-end gap-1 text-right">
        <span className="text-[0.68rem] text-text-muted">{rightLabel}</span>
        {friend.unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-bold leading-none text-white">
            {friend.unreadCount > 99 ? "99+" : friend.unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}

function ChatWorkspace({
  friend,
  draft,
  messages,
  historyError,
  historyLoading,
  canLoadOlder,
  currentUserAvatar,
  onDraftChange,
  onSendMessage,
  onLoadOlder,
  onOpenProfile,
}: {
  friend: FriendStatusItem | null;
  draft: string;
  messages: LocalChatMessage[];
  historyError: string;
  historyLoading: boolean;
  canLoadOlder: boolean;
  currentUserAvatar: string;
  onDraftChange: (secUid: string, value: string) => void;
  onSendMessage: (friend: FriendStatusItem, value: string) => Promise<void>;
  onLoadOlder: () => Promise<void>;
  onOpenProfile: (friend: FriendStatusItem) => Promise<void>;
}) {
  const displayName = friendDisplayName(friend);
  const hasDraft = Boolean(draft.trim());
  const sending = messages.some((message) => message.status === "pending");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollOffsetRef = useRef<number | null>(null);
  const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : "";
  const oldestMessageId = messages.length > 0 ? messages[0].id : "";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [friend?.secUid, latestMessageId]);

  useEffect(() => {
    if (preserveScrollOffsetRef.current === null) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const offset = preserveScrollOffsetRef.current;
      if (scroller && offset !== null) {
        scroller.scrollTop = Math.max(0, scroller.scrollHeight - offset);
      }
      preserveScrollOffsetRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [oldestMessageId]);

  const handleSendMessage = () => {
    if (!friend || !hasDraft) return;
    void onSendMessage(friend, draft);
  };
  const handleMessageScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller || !friend || historyLoading || !canLoadOlder) return;
    if (scroller.scrollTop > 72) return;
    preserveScrollOffsetRef.current = scroller.scrollHeight - scroller.scrollTop;
    void onLoadOlder();
  };
  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    handleSendMessage();
  };

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-solid/70 shadow-[var(--shadow-sm)]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            disabled={!friend}
            onClick={() => friend && void onOpenProfile(friend)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised outline-none ring-accent/35 transition hover:ring-2 focus-visible:ring-2 disabled:pointer-events-none disabled:hover:ring-0"
          >
            {friend?.avatar ? (
              <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-4 w-4 text-text-muted" />
            )}
            {friend && (
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                  friend.online ? "bg-success" : "bg-text-muted",
                )}
              />
            )}
          </button>
          <div className="min-w-0">
            <p className="truncate text-[0.86rem] font-semibold text-text">
              {friend ? displayName : "选择好友"}
            </p>
            <p className="truncate text-[0.7rem] text-text-muted">
              {friend ? `${friend.statusText} · ${friend.lastActive}` : "左侧列表会同步好友在线状态"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={friend?.online ? "success" : "secondary"} size="sm">
            {friend?.online ? "在线" : "离线"}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {historyError && (
          <div className="border-b border-danger/15 bg-danger-soft px-4 py-2 text-[0.72rem] text-danger">
            {historyError}
          </div>
        )}
        <div ref={scrollRef} onScroll={handleMessageScroll} className="flex-1 overflow-y-auto px-4 py-4">
          {friend ? (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              {historyLoading && messages.length > 0 && (
                <div className="mx-auto flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.68rem] text-text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  加载中
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex max-w-[88%] items-start gap-2",
                    message.direction === "in" ? "mr-auto flex-row" : "ml-auto flex-row-reverse",
                  )}
                >
                  <MessageAvatar
                    friend={friend}
                    direction={message.direction || "out"}
                    currentUserAvatar={currentUserAvatar}
                    onOpenProfile={onOpenProfile}
                  />
                  <div className={cn("flex min-w-0 flex-col", message.direction === "in" ? "items-start" : "items-end")}>
                    <div
                      className={cn(
                        "peer/bubble min-w-0 rounded-[16px] px-3 py-2 shadow-[0_10px_20px_rgba(15,23,42,0.08)]",
                        message.direction === "in"
                          ? "rounded-tl-[6px] border border-border bg-surface text-text"
                          : "rounded-tr-[6px] bg-accent text-white shadow-[0_10px_20px_rgba(254,44,85,0.16)]",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-[0.76rem] leading-relaxed">{message.text}</p>
                    </div>
                    <div className="invisible mt-1 min-h-4 text-[0.62rem] text-text-muted opacity-0 transition-opacity peer-hover/bubble:visible peer-hover/bubble:opacity-100">
                      {formatMessageTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              {hasDraft && (
                <div className="ml-auto max-w-[82%] rounded-[16px] rounded-tr-[6px] border border-accent/25 bg-accent-soft px-3 py-2 text-accent">
                  <p className="whitespace-pre-wrap break-words text-[0.76rem] leading-relaxed">{draft}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] border border-border bg-surface">
                <MessageCircle className="h-5 w-5 text-text-muted" />
              </div>
              <p className="text-[0.88rem] font-semibold text-text">暂无会话</p>
              <p className="mt-1 max-w-sm text-[0.74rem] leading-relaxed text-text-muted">
                刷新好友状态后，选择一个好友开始聊天。
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface/40 p-3">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <Textarea
              value={draft}
              onChange={(event) => friend && onDraftChange(friend.secUid, event.target.value)}
              onKeyDown={handleDraftKeyDown}
              disabled={!friend}
              placeholder={friend ? `给 ${displayName} 写点内容...` : "选择好友后输入"}
              className="h-10 min-h-10 resize-none bg-surface-solid py-2 leading-5"
            />
            <Button disabled={!friend || !hasDraft || sending} onClick={handleSendMessage} className="h-10 px-4">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              发送
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageAvatar({
  friend,
  direction,
  currentUserAvatar,
  onOpenProfile,
}: {
  friend: FriendStatusItem;
  direction: "in" | "out";
  currentUserAvatar: string;
  onOpenProfile: (friend: FriendStatusItem) => Promise<void>;
}) {
  const isIncoming = direction === "in";
  const avatar = isIncoming ? friend.avatar : currentUserAvatar;
  const className = cn(
    "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border outline-none ring-accent/35 transition",
    isIncoming
      ? "border-border bg-surface-raised hover:ring-2 focus-visible:ring-2"
      : "border-accent/20 bg-accent-soft text-accent",
  );
  const content = avatar ? (
    <img src={avatar} alt="" className="h-full w-full object-cover" />
  ) : (
    <UserRound className="h-3.5 w-3.5" />
  );
  if (isIncoming) {
    return (
      <button type="button" aria-label="打开主页" onClick={() => void onOpenProfile(friend)} className={className}>
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}
