// ═══════════════════════════════════════════════
// DY Downloader — Download & Progress Management
// Extracted from app.js
// ═══════════════════════════════════════════════

// ── Global State ──
let downloadTasks = {};
let globalDownloadPanel = {
    taskId: null,
    nickname: null
};
let isPaused = false;

// ── Functions ──

function clampPercent(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.max(0, Math.min(100, numberValue));
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    if (totalSeconds < 3600) {
        const minutes = Math.floor(totalSeconds / 60);
        const restSeconds = totalSeconds % 60;
        return `${minutes}分${restSeconds}s`;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}时${minutes}分`;
}

function formatSpeed(bytesPerSecond) {
    const speed = Number(bytesPerSecond);
    if (!Number.isFinite(speed) || speed <= 0) return '速度: --';
    if (speed < 1024) return `速度: ${speed.toFixed(0)} B/s`;
    if (speed < 1024 * 1024) return `速度: ${(speed / 1024).toFixed(1)} KB/s`;
    return `速度: ${(speed / 1024 / 1024).toFixed(1)} MB/s`;
}

function updateTaskTiming(taskId, overallPct, data) {
    const task = downloadTasks[taskId];
    if (!task || !task.startTime) return;

    const elapsedTime = document.getElementById('elapsed-time');
    const downloadEta = document.getElementById('download-eta');
    const elapsedSeconds = Number.isFinite(Number(data?.elapsed_seconds))
        ? Number(data.elapsed_seconds)
        : (Date.now() - task.startTime.getTime()) / 1000;

    if (elapsedTime) elapsedTime.textContent = `用时: ${formatDuration(elapsedSeconds)}`;

    let etaSeconds = Number(data?.eta_seconds);
    if (!Number.isFinite(etaSeconds)) {
        etaSeconds = overallPct > 0 && overallPct < 100
            ? elapsedSeconds / overallPct * (100 - overallPct)
            : (overallPct >= 100 ? 0 : NaN);
    }

    if (downloadEta) {
        downloadEta.textContent = Number.isFinite(etaSeconds)
            ? `预计: ${formatDuration(etaSeconds)}`
            : '预计: --';
    }
}

function updateCurrentWorkProgress(options) {
    const shouldUpdateProgress = options?.progress !== undefined;
    const progress = clampPercent(options?.progress);
    const currentProgressBar = document.getElementById('current-progress-bar');
    const currentProgressText = document.getElementById('current-progress-text');
    const currentStatus = document.getElementById('current-status');
    const currentSpeedEl = document.getElementById('current-speed');

    if (shouldUpdateProgress && currentProgressBar) {
        currentProgressBar.style.width = `${progress}%`;
        currentProgressBar.setAttribute('aria-valuenow', progress);
        currentProgressBar.className = progress >= 100 ? 'progress-bar bg-success' : 'progress-bar bg-info';
    }
    if (shouldUpdateProgress && currentProgressText) currentProgressText.textContent = `${Math.round(progress)}%`;
    if (currentStatus && options?.statusText) currentStatus.textContent = options.statusText;
    if (currentSpeedEl && options?.speedBps !== undefined) currentSpeedEl.textContent = formatSpeed(options.speedBps);
}

function showProgress(taskId, taskName) {
    taskName = taskName || '下载任务';

    // 优先使用全局面板的 taskId
    let actualTaskId = globalDownloadPanel.taskId || taskId;

    if (!downloadTasks[actualTaskId]) {
        downloadTasks[actualTaskId] = {
            id: actualTaskId,
            name: taskName,
            progress: 0,
            completed: 0,
            total: 0,
            status: 'running',
            startTime: new Date(),
            isBatch: false
        };

        // 使用全局面板而不是单独的任务面板
        createDownloadProgressElement(actualTaskId, taskName);
        updateActiveTasksCount();
    } else {
        // 如果任务已存在，更新全局面板的任务名称
        const panel = document.getElementById('global-download-panel');
        if (panel) {
            document.getElementById('panel-nickname').textContent = taskName;
        }
    }

    const noProgress = document.getElementById('no-progress');
    if (noProgress) noProgress.classList.add('d-none');
}

function createTaskProgressElement(taskId, taskName) {
    const container = document.getElementById('progress-tasks-container');
    if (!container) return;

    const taskElement = document.createElement('div');
    taskElement.id = `task-${taskId}`;
    taskElement.className = 'mb-2 p-2 border rounded';

    // NOTE: innerHTML used with trusted static HTML templates only (no user input interpolated unsafely)
    taskElement.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1">
            <small class="fw-bold text-truncate" style="max-width: 60%;" title="${taskName}">${taskName}</small>
            <div class="d-flex align-items-center">
                <span class="badge bg-primary me-1" id="status-${taskId}">进行中</span>
                <button class="btn btn-sm btn-outline-danger" onclick="cancelTask('${taskId}')" title="取消任务">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        </div>
        <div class="progress mb-1" style="height: 15px;">
            <div id="progress-bar-${taskId}" class="progress-bar" role="progressbar" style="width: 0%">
                <small>0%</small>
            </div>
        </div>
        <div class="d-flex justify-content-between">
            <small class="text-muted" id="progress-text-${taskId}">准备中...</small>
            <small class="text-muted" id="progress-details-${taskId}">0/0</small>
        </div>
        <div class="d-flex justify-content-between">
            <small class="text-muted" id="progress-speed-${taskId}">速度: --</small>
            <small class="text-muted" id="progress-time-${taskId}">用时: 0s</small>
        </div>
    `;

    container.appendChild(taskElement);
}

function createDownloadProgressElement(taskId, nickname) {
    // 检查是否已经存在全局下载面板，如果存在则只更新任务信息
    const existingPanel = document.getElementById('global-download-panel');
    if (existingPanel) {
        // 更新现有面板的任务信息
        globalDownloadPanel.taskId = taskId;
        globalDownloadPanel.nickname = nickname;
        const nicknameEl = document.getElementById('panel-nickname');
        if (nicknameEl) nicknameEl.textContent = nickname;
        return;
    }

    const noProgress = document.getElementById('no-progress');
    if (noProgress) noProgress.style.display = 'none';

    const progressContainer = document.getElementById('progress-tasks-container');
    if (!progressContainer) return;

    // 设置全局面板状态 - 只设置一次，避免被覆盖
    if (!globalDownloadPanel.taskId) {
        globalDownloadPanel.taskId = taskId;
    }
    globalDownloadPanel.nickname = nickname;

    const progressElement = document.createElement('div');
    progressElement.id = 'global-download-panel';
    progressElement.className = 'progress-task-item border rounded p-3 mb-2';
    // NOTE: innerHTML used with trusted static HTML templates only (no user input interpolated unsafely)
    progressElement.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="mb-0" id="panel-nickname">${nickname}</h6>
            <button class="btn btn-sm btn-outline-secondary" onclick="closeDownloadPanel()" title="结束并关闭">
                <i class="bi bi-x-lg"></i>
            </button>
        </div>

        <!-- 总进度 -->
        <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <small class="text-muted">总进度</small>
                <small class="text-muted" id="overall-progress-text">0%</small>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-primary" id="overall-progress-bar" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <div class="d-flex justify-content-between mt-1">
                <small class="text-muted" id="overall-downloaded">0/0</small>
                <small class="text-muted" id="overall-status">准备中...</small>
            </div>
        </div>

        <!-- 当前作品进度 -->
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <small class="text-muted">当前作品</small>
                <small class="text-muted" id="current-progress-text">0%</small>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-info" id="current-progress-bar" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <div class="d-flex justify-content-between mt-1">
                <small class="text-muted" id="current-status">等待中...</small>
                <small class="text-muted" id="current-speed">速度: --</small>
            </div>
        </div>

        <!-- 控制按钮 -->
        <div class="d-flex justify-content-between align-items-center">
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-warning" id="pause-btn" onclick="togglePause()">
                    <i class="bi bi-pause-fill"></i> 暂停
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="closeDownloadPanel()">
                    <i class="bi bi-stop-fill"></i> 结束
                </button>
            </div>
            <div>
                <small class="text-muted" id="elapsed-time">用时: 0s</small>
                <small class="text-muted ms-2" id="download-eta">预计: --</small>
            </div>
        </div>
    `;

    // 清空之前的进度任务，只保留新的全局面板
    progressContainer.innerHTML = '';
    progressContainer.appendChild(progressElement);

    updateActiveTasksCount();
}

function togglePause() {
    if (!globalDownloadPanel.taskId) return;

    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pause-btn');

    if (isPaused) {
        // 调用暂停 API
        fetch('/api/pause_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: globalDownloadPanel.taskId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                pauseBtn.innerHTML = '<i class="bi bi-play-fill"></i> 继续';
                pauseBtn.classList.remove('btn-outline-warning');
                pauseBtn.classList.add('btn-outline-success');
                addLog('下载已暂停', 'warning');
            } else {
                isPaused = false;
                showToast(data.message || '暂停失败', 'error');
            }
        })
        .catch(err => {
            isPaused = false;
            console.error('暂停失败:', err);
            showToast('暂停失败', 'error');
        });
    } else {
        // 调用恢复 API
        fetch('/api/resume_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: globalDownloadPanel.taskId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> 暂停';
                pauseBtn.classList.remove('btn-outline-success');
                pauseBtn.classList.add('btn-outline-warning');
                addLog('下载已恢复', 'info');
            } else {
                isPaused = true;
                showToast(data.message || '恢复失败', 'error');
            }
        })
        .catch(err => {
            isPaused = true;
            console.error('恢复失败:', err);
            showToast('恢复失败', 'error');
        });
    }
}

function closeDownloadPanel() {
    if (globalDownloadPanel.taskId) {
        cancelDownloadTask(globalDownloadPanel.taskId);
    }
    // 移除全局面板
    const panel = document.getElementById('global-download-panel');
    if (panel) {
        panel.remove();
    }
    // 显示空状态
    const noProgress = document.getElementById('no-progress');
    if (noProgress) noProgress.style.display = 'block';
    // 重置全局状态
    globalDownloadPanel = { taskId: null, nickname: null };
    isPaused = false;
    updateActiveTasksCount();
}

function removeProgressElement(taskId) {
    // 检查是否是全局面板的任务
    if (globalDownloadPanel.taskId === taskId) {
        const globalElement = document.getElementById('global-download-panel');
        if (globalElement) {
            globalElement.style.opacity = '0';
            globalElement.style.transform = 'translateX(20px)';
            globalElement.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                globalElement.remove();
                globalDownloadPanel = { taskId: null, nickname: null };
                // 从 downloadTasks 中删除任务
                delete downloadTasks[taskId];
                checkEmptyTasks();
            }, 300);
        } else {
            // 元素不存在也要清理
            delete downloadTasks[taskId];
            globalDownloadPanel = { taskId: null, nickname: null };
        }
        return;
    }

    const element = document.getElementById(`progress-${taskId}`);
    if (element) {
        element.style.opacity = '0';
        element.style.transform = 'translateX(20px)';
        element.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            element.remove();
            // 从 downloadTasks 中删除任务
            delete downloadTasks[taskId];
            checkEmptyTasks();
        }, 300);
    } else {
        // 元素不存在也要清理
        delete downloadTasks[taskId];
    }
}

function updateDownloadProgress(dataOrProgress, processedOrCompleted, totalOrUndefined, batchTaskIdOrUndefined) {
    // Handle both calling conventions:
    // 1. updateDownloadProgress(data) — from socket event (data is an object)
    // 2. updateDownloadProgress(progress, processed, total, batchTaskId) — from batch download

    // 更新全局面板的元素（如果存在）
    const overallProgressBar = document.getElementById('overall-progress-bar');
    const overallProgressText = document.getElementById('overall-progress-text');
    const overallDownloaded = document.getElementById('overall-downloaded');
    const overallStatus = document.getElementById('overall-status');

    if (typeof dataOrProgress === 'object' && dataOrProgress !== null) {
        const data = dataOrProgress;
        const taskId = data.task_id;
        if (taskId && !downloadTasks[taskId]) {
            showProgress(taskId, globalDownloadPanel.nickname || '下载任务');
        }
        if (taskId && downloadTasks[taskId]) {
            downloadTasks[taskId].isBatch = true;
        }

        const totalElement = document.getElementById(`total-${taskId}`);
        const downloadedElement = document.getElementById(`downloaded-${taskId}`);
        const remainingElement = document.getElementById(`remaining-${taskId}`);
        const statusElement = document.getElementById(`status-${taskId}`);
        const progressBar = document.getElementById(`progress-bar-${taskId}`);

        if (totalElement && data.total_videos !== undefined) totalElement.textContent = data.total_videos;
        if (downloadedElement && data.current_downloaded !== undefined) downloadedElement.textContent = data.current_downloaded;
        if (remainingElement && data.remaining !== undefined) remainingElement.textContent = data.remaining;
        if (statusElement && data.message) statusElement.textContent = data.message;

        // 计算总进度 - 如果后端没有发送 overall_progress，则根据 current_downloaded 和 total_videos 计算
        let overallPct = data.overall_progress;
        if (overallPct === undefined && data.total_videos !== undefined && data.total_videos > 0 && data.current_downloaded !== undefined) {
            overallPct = Math.round((data.current_downloaded / data.total_videos) * 100);
        }
        overallPct = clampPercent(overallPct);

        if (taskId && downloadTasks[taskId]) {
            downloadTasks[taskId].overallProgress = overallPct;
        }

        // 更新全局面板
        if (data.total_videos !== undefined && overallDownloaded) {
            overallDownloaded.textContent = `${data.current_downloaded || 0}/${data.total_videos}`;
        }
        if (data.message && overallStatus) {
            overallStatus.textContent = data.message;
        }
        if (progressBar) {
            progressBar.style.width = `${overallPct}%`;
            progressBar.setAttribute('aria-valuenow', overallPct);
            progressBar.className = overallPct === 100 ? 'progress-bar bg-success' : 'progress-bar bg-primary';
        }
        // 更新总进度条
        if (overallProgressBar) {
            overallProgressBar.style.width = `${overallPct}%`;
            overallProgressBar.setAttribute('aria-valuenow', overallPct);
            overallProgressBar.className = overallPct === 100 ? 'progress-bar bg-success' : 'progress-bar bg-primary';
        }
        if (overallProgressText) {
            overallProgressText.textContent = `${overallPct}%`;
        }

        const currentVideo = data.current_video || {};
        let currentStatusText = data.message || currentVideo.desc || '等待中...';
        if (Number.isFinite(Number(currentVideo.file_total)) && Number(currentVideo.file_total) > 1) {
            const fileIndex = Number(currentVideo.file_index) || 1;
            currentStatusText = `${currentStatusText} (${fileIndex}/${currentVideo.file_total})`;
        }
        if (data.type === 'info' && data.message) {
            currentStatusText = data.message;
        }

        updateCurrentWorkProgress({
            progress: currentVideo.progress !== undefined ? currentVideo.progress : data.current_progress,
            statusText: currentStatusText,
            speedBps: currentVideo.speed_bps
        });
        updateTaskTiming(taskId, overallPct, data);
    } else {
        // Numeric signature
        const progress = dataOrProgress;
        const processed = processedOrCompleted;
        const total = totalOrUndefined;
        const batchTaskId = batchTaskIdOrUndefined;

        if (batchTaskId) {
            const progressBar = document.getElementById(`progress-bar-${batchTaskId}`);
            const totalEl = document.getElementById(`total-${batchTaskId}`);
            const downloadedEl = document.getElementById(`downloaded-${batchTaskId}`);
            const remainingEl = document.getElementById(`remaining-${batchTaskId}`);

            if (progressBar) {
                progressBar.style.width = `${progress}%`;
                progressBar.setAttribute('aria-valuenow', progress);
                progressBar.className = progress === 100 ? 'progress-bar bg-success' : 'progress-bar bg-primary';
            }
            if (totalEl) totalEl.textContent = total;
            if (downloadedEl) downloadedEl.textContent = processed;
            if (remainingEl) remainingEl.textContent = total - processed;
        }
    }
}

function updateProgress(progress, completed, total, taskId, detail) {
    if (!taskId) {
        taskId = Object.keys(downloadTasks)[0];
        if (!taskId) return;
    }

    const task = downloadTasks[taskId];
    if (!task) return;

    task.progress = Math.max(0, Math.min(100, progress || 0));
    task.completed = Math.max(0, completed || 0);
    task.total = Math.max(1, total || 1);

    const progressBar = document.getElementById(`progress-bar-${taskId}`);
    const progressText = document.getElementById(`progress-text-${taskId}`);
    const progressDetails = document.getElementById(`progress-details-${taskId}`);
    const progressSpeed = document.getElementById(`progress-speed-${taskId}`);
    const progressTime = document.getElementById(`progress-time-${taskId}`);

    if (progressBar) {
        progressBar.style.width = `${task.progress}%`;
        progressBar.innerHTML = `<small>${Math.round(task.progress)}%</small>`;

        if (task.progress >= 100) progressBar.className = 'progress-bar bg-success';
        else if (task.progress >= 50) progressBar.className = 'progress-bar bg-info';
        else progressBar.className = 'progress-bar bg-primary';
    }

    if (progressText) progressText.textContent = `进度: ${Math.round(task.progress)}%`;
    if (progressDetails) progressDetails.textContent = `${task.completed}/${task.total}`;

    if (progressTime) {
        const elapsed = Math.floor((new Date() - task.startTime) / 1000);
        progressTime.textContent = `用时: ${formatDuration(elapsed)}`;
    }

    if (progressSpeed) {
        if (detail && detail.speed_bps !== undefined) {
            progressSpeed.textContent = formatSpeed(detail.speed_bps);
        } else if (task.completed > 0) {
            const elapsed = Math.max((new Date() - task.startTime) / 1000, 0.001);
            const speed = task.completed / elapsed;
            progressSpeed.textContent = `速度: ${speed.toFixed(1)}/s`;
        }
    }

    // 更新全局面板的当前作品进度
    const statusText = task.isBatch
        ? undefined
        : (detail && detail.file_total > 1 ? `${detail.file_index || 1}/${detail.file_total}` : `${task.completed}/${task.total}`);
    updateCurrentWorkProgress({
        progress: task.progress,
        statusText,
        speedBps: detail ? detail.speed_bps : undefined
    });

    if (!task.isBatch && task.startTime) {
        updateTaskTiming(taskId, task.progress, detail || {});
    }
}

function updateTaskStatus(taskId, status, message) {
    const task = downloadTasks[taskId];
    if (!task) return;

    task.status = status;
    const statusElement = document.getElementById(`status-${taskId}`);
    const progressText = document.getElementById(`progress-text-${taskId}`);

    if (statusElement) {
        switch (status) {
            case 'completed':
                statusElement.className = 'badge bg-success me-1';
                statusElement.textContent = '已完成';
                break;
            case 'failed':
                statusElement.className = 'badge bg-danger me-1';
                statusElement.textContent = '失败';
                break;
            case 'cancelled':
                statusElement.className = 'badge bg-secondary me-1';
                statusElement.textContent = '已取消';
                break;
            default:
                statusElement.className = 'badge bg-primary me-1';
                statusElement.textContent = '进行中';
        }
    }

    if (progressText && message) progressText.textContent = message;
}

function cancelTask(taskId) {
    if (confirm('确定要取消这个下载任务吗？')) {
        // 通知后端取消
        fetch('/api/cancel_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        }).then(res => res.json()).then(data => {
            console.log('Cancellation result:', data);
        }).catch(err => console.error('Cancel error:', err));

        updateTaskStatus(taskId, 'cancelled', '已取消');
        addLog(`任务已取消: ${downloadTasks[taskId]?.name || taskId}`, 'warning');
        setTimeout(() => removeTask(taskId), 500);
    }
}

async function cancelDownloadTask(taskId) {
    // 渐进式下载任务的取消
    // 先找到任务元素，更新状态为"正在取消..."
    const progressElement = document.getElementById(`progress-${taskId}`);
    if (progressElement) {
        const statusElement = progressElement.querySelector('.task-status');
        const actionButtons = progressElement.querySelector('.task-actions');
        if (statusElement) statusElement.textContent = '正在取消...';
        if (actionButtons) actionButtons.innerHTML = '<span class="text-muted small">等待停止...</span>';
    }

    try {
        const response = await fetch('/api/cancel_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        const result = await response.json();
        console.log('Download cancellation requested:', result);

        // 等待一小段时间让后端处理取消
        await new Promise(resolve => setTimeout(resolve, 500));

        // 移除UI元素
        removeProgressElement(taskId);
        addLog(`下载任务已取消: ${taskId}`, 'warning');
    } catch (e) {
        console.error('Failed to request cancellation:', e);
        // 即使出错也移除UI
        removeProgressElement(taskId);
    }
}

function checkEmptyTasks() {
    const container = document.getElementById('progress-tasks-container');
    const noProgress = document.getElementById('no-progress');
    if (container && container.children.length === 0 && noProgress) {
        noProgress.style.display = 'block';
    }
}

function removeTask(taskId) {
    const taskElement = document.getElementById(`task-${taskId}`);
    if (taskElement) taskElement.remove();

    // 如果是全局下载任务，也移除全局面板
    if (globalDownloadPanel.taskId === taskId) {
        const globalPanel = document.getElementById('global-download-panel');
        if (globalPanel) {
            globalPanel.remove();
        }
        const noProgress = document.getElementById('no-progress');
        if (noProgress) noProgress.style.display = 'block';
        globalDownloadPanel = { taskId: null, nickname: null };
        isPaused = false;  // 重置暂停状态
    }

    delete downloadTasks[taskId];
    updateActiveTasksCount();

    if (Object.keys(downloadTasks).length === 0) {
        const noProgress = document.getElementById('no-progress');
        if (noProgress) noProgress.classList.remove('d-none');
    }
}

function updateActiveTasksCount() {
    const count = Object.keys(downloadTasks).length;
    const countElement = document.getElementById('active-tasks-count');
    if (countElement) {
        countElement.textContent = count;
        countElement.className = count > 0 ? 'badge bg-primary ms-1' : 'badge bg-secondary ms-1';
    }
}

// ── Retry Support ──

function retryDownloadTask(taskId) {
    const task = downloadTasks[taskId];
    if (!task || !task.retryParams) {
        showToast('无法重试：缺少任务参数', 'error');
        return;
    }

    const params = task.retryParams;

    // Reset task state
    task.progress = 0;
    task.completed = 0;
    task.status = 'running';
    task.startTime = new Date();

    // Update UI to show retrying
    updateTaskStatus(taskId, 'running', '重试中...');
    const progressBar = document.getElementById(`progress-bar-${taskId}`);
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.className = 'progress-bar bg-primary';
    }
    const currentProgressBar = document.getElementById('current-progress-bar');
    if (currentProgressBar) {
        currentProgressBar.style.width = '0%';
        currentProgressBar.className = 'progress-bar bg-info';
    }
    const currentProgressText = document.getElementById('current-progress-text');
    if (currentProgressText) currentProgressText.textContent = '0%';
    const overallStatus = document.getElementById('overall-status');
    if (overallStatus) overallStatus.textContent = '重试中...';
    const downloadEta = document.getElementById('download-eta');
    if (downloadEta) downloadEta.textContent = '预计: --';

    // Re-emit the download request via socket
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('start_download', params);
        addLog(`正在重试下载任务: ${task.name || taskId}`, 'info');
    } else {
        showToast('Socket 未连接，无法重试', 'error');
    }
}
