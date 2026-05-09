import { useCallback } from "react";
import { useDownloadStore, useLogStore } from "@/stores/app-store";
import type { VideoInfo } from "@/lib/tauri";
import {
  addDownloadTask,
  cancelDownloadTask,
  downloadVideo,
  getDownloadTasks,
  openDownloadDirectory,
  openFileLocation,
  pauseDownload,
  removeDownloadTask,
  resumeDownload,
  startDownload,
} from "@/lib/tauri";
import type { DownloadStatus, DownloadTask } from "@/types";

// ═══════════════════════════════════════════════
// Download Hook
// ═══════════════════════════════════════════════

export function useDownloads() {
  const updateTask = useDownloadStore((s) => s.updateTask);
  const replaceTaskId = useDownloadStore((s) => s.replaceTaskId);
  const removeTask = useDownloadStore((s) => s.removeTask);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);
  const addLog = useLogStore((s) => s.addLog);

  const getTaskLabel = useCallback((taskId: string) => {
    return useDownloadStore.getState().tasks[taskId]?.filename || taskId;
  }, []);

  const startSingleDownload = useCallback(
    async (video: VideoInfo) => {
      const taskId = video.aweme_id;
      const displayName = `${video.author.nickname}_${video.aweme_id}`;
      addLog(`开始下载: ${video.desc?.slice(0, 30) || video.aweme_id}`, "info");

      updateTask({
        id: taskId,
        filename: displayName,
        progress: 0,
        status: "downloading",
        startTime: Date.now(),
      });

      try {
        const result = await downloadVideo(video);
        if (!result.success) {
          throw new Error(result.message || "下载失败");
        }
        if (result.task_id && result.task_id !== taskId) {
          replaceTaskId(taskId, result.task_id, {
            filename: displayName,
            status: "downloading",
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "下载失败";
        updateTask({ id: taskId, status: "error" });
        addLog(msg, "error");
      }
    },
    [updateTask, replaceTaskId, addLog]
  );

  const downloadBatch = useCallback(
    async (videos: VideoInfo[]) => {
      addLog(`批量下载 ${videos.length} 个视频`, "info");

      for (const video of videos) {
        try {
          const taskId = await addDownloadTask(video);
          updateTask({
            id: taskId || video.aweme_id,
            filename: `${video.author.nickname}_${video.aweme_id}`,
            progress: 0,
            status: "pending",
            startTime: Date.now(),
          });
          if (taskId) {
            await startDownload(taskId);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "添加下载任务失败";
          addLog(msg, "error");
        }
      }

      addLog("批量下载已提交", "success");
    },
    [updateTask, addLog]
  );

  const cancelDownload = useCallback(
    async (taskId: string) => {
      updateTask({ id: taskId, status: "cancelled", speed: 0, etaSeconds: 0 });
      try {
        const result = await cancelDownloadTask(taskId);
        if (!result.success) {
          throw new Error(result.message || "取消下载失败");
        }
        addLog(`已取消下载: ${getTaskLabel(taskId)}`, "warning");
      } catch (error) {
        addLog(error instanceof Error ? error.message : "取消下载失败", "error");
      }
    },
    [updateTask, addLog, getTaskLabel]
  );

  const pauseTask = useCallback(
    async (taskId: string) => {
      const previousStatus = useDownloadStore.getState().tasks[taskId]?.status || "downloading";
      updateTask({ id: taskId, status: "paused", speed: 0 });
      try {
        const result = await pauseDownload(taskId);
        if (!result.success) {
          throw new Error(result.message || "暂停下载失败");
        }
        addLog(`已暂停下载: ${getTaskLabel(taskId)}`, "info");
      } catch (error) {
        updateTask({ id: taskId, status: previousStatus });
        addLog(error instanceof Error ? error.message : "暂停下载失败", "error");
      }
    },
    [updateTask, addLog, getTaskLabel]
  );

  const resumeTask = useCallback(
    async (taskId: string) => {
      const previousStatus = useDownloadStore.getState().tasks[taskId]?.status || "paused";
      updateTask({ id: taskId, status: "downloading" });
      try {
        const result = await resumeDownload(taskId);
        if (!result.success) {
          throw new Error(result.message || "继续下载失败");
        }
        addLog(`继续下载: ${getTaskLabel(taskId)}`, "info");
      } catch (error) {
        updateTask({ id: taskId, status: previousStatus });
        addLog(error instanceof Error ? error.message : "继续下载失败", "error");
      }
    },
    [updateTask, addLog, getTaskLabel]
  );

  const removeDownload = useCallback(
    async (taskId: string) => {
      try {
        await removeDownloadTask(taskId);
      } catch {
        // The backend may already have removed/cancelled the task; keep the UI responsive.
      }
      removeTask(taskId);
    },
    [removeTask]
  );

  const openDownloadsDirectory = useCallback(async () => {
    try {
      await openDownloadDirectory();
    } catch (error) {
      addLog(error instanceof Error ? error.message : "打开下载目录失败", "error");
    }
  }, [addLog]);

  const openTaskLocation = useCallback(
    async (task: DownloadTask) => {
      try {
        const target = task.filePath || task.savePath;
        if (target) {
          await openFileLocation(target);
        } else {
          await openDownloadDirectory();
        }
      } catch (error) {
        addLog(error instanceof Error ? error.message : "打开文件位置失败", "error");
      }
    },
    [addLog]
  );

  const syncTasks = useCallback(async () => {
    try {
      const tasks = await getDownloadTasks();
      tasks.map(normalizeBackendTask).filter(Boolean).forEach((task) => {
        updateTask(task as DownloadTask);
      });
    } catch {
      // Downloader is not initialized during early boot; event updates still keep active tasks fresh.
    }
  }, [updateTask]);

  return {
    downloadVideo: startSingleDownload,
    downloadBatch,
    cancelDownload,
    pauseTask,
    resumeTask,
    removeTask: removeDownload,
    clearCompleted,
    openDownloadsDirectory,
    openTaskLocation,
    syncTasks,
  };
}

function normalizeStatus(status: unknown): DownloadStatus {
  const value = String(status || "").trim().toLowerCase();
  if (value === "downloading") return "downloading";
  if (value === "completed") return "completed";
  if (value === "failed" || value === "error") return "error";
  if (value === "paused") return "paused";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  return "pending";
}

function normalizeBackendTask(value: unknown): (Partial<DownloadTask> & { id: string }) | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Record<string, unknown>;
  const id = String(task.id || "").trim();
  if (!id) return null;

  const title = String(task.title || task.filename || id).trim();
  const downloadedBytes = Number(task.downloaded_size ?? task.downloadedBytes ?? 0) || 0;
  const totalBytes = Number(task.total_size ?? task.totalBytes ?? 0) || 0;

  return {
    id,
    awemeId: String(task.aweme_id || task.awemeId || "").trim(),
    filename: title,
    progress: Number(task.progress ?? 0) || 0,
    speed: 0,
    status: normalizeStatus(task.status),
    savePath: String(task.save_path || task.savePath || "").trim(),
    mediaType: String(task.media_type || task.mediaType || "").trim(),
    mediaCount: Number(task.total_files ?? task.mediaCount ?? 0) || undefined,
    fileTotal: Number(task.total_files ?? 0) || undefined,
    fileIndex: Number(task.completed_files ?? 0) || undefined,
    downloadedBytes: downloadedBytes || undefined,
    totalBytes: totalBytes || undefined,
    startTime: Number(task.create_time ?? 0) ? Number(task.create_time) * 1000 : undefined,
    finishedTime: Number(task.complete_time ?? 0) ? Number(task.complete_time) * 1000 : undefined,
    errorMessage: String(task.error_msg || "").trim() || undefined,
  };
}
