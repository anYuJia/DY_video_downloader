import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { motion } from "framer-motion";
import { Activity, ChevronDown, Loader2, RefreshCw, Users, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getConfig, getFriendOnlineStatus, saveConfig, type FriendOnlineStatusResponse } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface FriendStatusItem {
  secUid: string;
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
const ONLINE_WINDOW_SECONDS = 60;
const DEFAULT_REFRESH_INTERVAL_SECONDS = 5;

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
  const [input, setInput] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [includeAllUsers, setIncludeAllUsers] = useState(false);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(DEFAULT_REFRESH_INTERVAL_SECONDS);
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

  const ids = useMemo(() => extractIds(input), [input]);
  const friends = useMemo(() => (response?.success ? mapResponse(response) : []), [response]);
  const onlineCount = friends.filter((friend) => friend.online).length;
  const offlineCount = friends.filter((friend) => !friend.online).length;
  const isInitialLoading = loading && friends.length === 0;

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    savedIdsRef.current = savedIds;
  }, [savedIds]);

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
      setResponse(result);
      if (result.success) {
        setLastUpdatedAt(Date.now());
      }
      if (result.success && Array.isArray(result.sec_user_ids)) {
        setSavedIds(result.sec_user_ids);
        setSavedCount(result.sec_user_ids.length);
        setInput(result.sec_user_ids.join("\n"));
        localStorage.setItem(STORAGE_KEY, result.sec_user_ids.join("\n"));
      }
      if (!result.success) {
        setError(result.message || "获取好友在线状态失败");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "获取好友在线状态失败");
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h3 className="text-[0.95rem] font-semibold text-text">好友在线状态</h3>
          <span className="text-[0.72rem] text-text-muted">
            {friends.length || ids.length} 个好友{savedCount > 0 ? ` · 已保存 ${savedCount}` : ""}
            {backgroundRefreshing
              ? " · 正在更新"
              : lastUpdatedAt
                ? ` · 上次更新于 ${formatUpdateTime(lastUpdatedAt)}`
                : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" onClick={() => void query()} disabled={loading}>
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

      <section className="min-h-[420px] rounded-[var(--radius-lg)] border border-border bg-surface-solid/70 p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Metric label="总数" value={friends.length || ids.length} icon={Users} />
          <Metric label="在线" value={onlineCount} icon={Wifi} tone="success" />
          <Metric label="未在线" value={offlineCount} icon={WifiOff} tone="muted" />
        </div>

        {isInitialLoading ? (
          <div className="flex min-h-[280px] items-center justify-center text-[0.82rem] text-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在查询
          </div>
        ) : friends.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] border border-border bg-surface">
              <Users className="h-5 w-5 text-text-muted" />
            </div>
            <p className="text-[0.86rem] text-text-secondary">等待查询</p>
            <p className="mt-1 text-[0.75rem] text-text-muted">点刷新自动获取；若没有返回列表，可展开备用输入缓存一次</p>
          </div>
        ) : (
          <motion.div
            className="grid gap-2"
            initial={false}
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
          >
            {friends.map((friend) => (
              <FriendRow key={friend.secUid} friend={friend} />
            ))}
          </motion.div>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-solid/50 shadow-[var(--shadow-sm)]">
        <button
          type="button"
          onClick={() => setShowManualInput((value) => !value)}
          className="flex h-10 w-full items-center justify-between px-4 text-left text-[0.78rem] font-semibold text-text-secondary"
        >
          <span>备用 ID 输入</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showManualInput && "rotate-180")} />
        </button>
        {showManualInput && (
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[0.74rem] text-text-muted">自动采集失败时，可临时粘贴 curl 或 sec_user_id 列表</span>
              <Badge variant="secondary" size="sm">{ids.length}</Badge>
            </div>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="MS4w... 每行一个，或粘贴 curl 参数"
              className="min-h-[140px] resize-none"
              spellCheck={false}
            />
          </div>
        )}
      </section>
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
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[0.7rem] text-text-muted">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "success" && "text-success",
            tone === "muted" && "text-text-muted"
          )}
        />
        {label}
      </div>
      <div className="text-[1.05rem] font-bold tabular-nums text-text">{value}</div>
    </div>
  );
}

function FriendRow({ friend }: { friend: FriendStatusItem }) {
  return (
    <motion.div
      variants={{ show: { opacity: 1, y: 0, transition: { duration: 0.18 } } }}
      initial={{ opacity: 0, y: 4 }}
      className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2"
    >
      <div className="relative h-10 w-10 overflow-hidden rounded-[12px] bg-surface-raised">
        {friend.avatar ? (
          <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[0.75rem] font-bold text-text-muted">
            {(friend.remarkName || friend.nickname).slice(0, 1) || "友"}
          </div>
        )}
        <span
          className={cn(
            "absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface",
            friend.online ? "bg-success" : "bg-text-muted"
          )}
        />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[0.86rem] font-semibold text-text">
            {friend.remarkName || friend.nickname || "未知用户"}
          </span>
          <Badge variant={friend.online ? "success" : "secondary"} size="sm">
            {friend.statusText}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[0.72rem] text-text-muted">
          {friend.remarkName && friend.nickname ? `${friend.nickname} · ` : ""}
          {friend.signature || friend.secUid}
        </div>
      </div>

      <div className="text-right text-[0.7rem] text-text-muted">
        {friend.lastActive}
      </div>
    </motion.div>
  );
}
