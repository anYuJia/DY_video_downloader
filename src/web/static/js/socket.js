// ═══════════════════════════════════════════════
// WebSocket 连接与事件处理
// ═══════════════════════════════════════════════

function testWebSocketConnection() {
    if (socket && socket.connected) {
        _log('WebSocket连接测试：发送心跳消息');
        socket.emit('test_connection', { message: 'Hello from client', timestamp: new Date().toISOString() });
    }
}

function setupSocketIO() {
    _log('开始设置WebSocket连接...');

    socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', function () {
        _log('WebSocket连接成功，socket.id:', socket.id);
        updateStatus('ready', '已连接');
        addLog('WebSocket连接成功');
        testWebSocketConnection();
    });

    socket.on('connect_error', function (error) {
        console.error('WebSocket连接错误:', error);
        updateStatus('error', '连接错误');
        addLog('WebSocket连接错误: ' + error.message);
    });

    socket.on('disconnect', function (reason) {
        _log('WebSocket连接断开，原因:', reason);
        updateStatus('error', '连接断开');
        addLog('WebSocket连接断开: ' + reason);
    });

    socket.on('heartbeat', function(data) {
        _log('收到WebSocket心跳:', data);
    });

    socket.on('download_started', function (data) {
        _log('收到下载开始事件:', data);
        const taskId = data.task_id || 'default';
        let taskName = data.display_name || data.desc || data.user || data.type || '下载任务';

        if (data.type === 'single_video') {
            addLog(`开始下载: ${data.desc || data.aweme_id}`, 'info');
            showProgress(taskId, taskName);
            showToast(`开始下载: ${taskName}`, 'info');
        } else {
            addLog(`开始批量下载: ${data.user || '未知用户'}`, 'info');
            showProgress(taskId, data.user || taskName);
            showToast(`开始批量下载 ${data.user || ''} 的作品`, 'info');
        }
        updateStatus('running', '下载中');
    });

    socket.on('broadcast_message', function (data) {
        _log('收到广播消息:', data);
        addLog(`收到服务器广播: ${data.message} (${data.time})`);
    });

    socket.on('download_progress', function (data) {
        _log('收到下载进度事件:', data);

        const taskId = data.task_id || data.aweme_id || 'default';
        let taskName = data.display_name || data.desc || data.task_name || data.title || '下载任务';
        if (taskName && taskName !== '下载任务' && taskName.length > 8) {
            taskName = taskName.substring(0, 8) + '...';
        }

        showProgress(taskId, taskName);
        updateProgress(data.progress, data.completed, data.total, taskId);

        if (data.status === 'starting') {
            addLog(`下载: ${taskName} (${data.total} 个文件)`, 'info');
        } else if (data.status === 'completed') {
            addLog(`下载完成: ${taskName} (${data.completed}/${data.total} 个文件)`, 'success');
            updateTaskStatus(taskId, 'completed', '下载完成');
        } else if (data.progress > 0) {
            const progress = Math.round(data.progress);
            if (progress % 25 === 0 || progress >= 100 || data.completed === data.total) {
                addLog(`${taskName}: ${data.completed}/${data.total} 个文件 (${progress}%)`, 'info');
            }
        }
        scrollToBottom();
    });

    socket.on('download_log', function (data) {
        _log('收到下载日志事件:', data);

        const message = data.message || '';
        const shouldSkipLog = (
            message.includes('开始并行下载') ||
            message.includes('个文件 (') && message.includes('%)') ||
            message.includes('正在下载第') && message.includes('个文件') ||
            /\u{1F4E5}.*:\s*\d+\/\d+\s*个文件\s*\(\d+%\)/u.test(message)
        );

        if (!shouldSkipLog) {
            const taskName = data.display_name || data.desc || '下载任务';
            const logMessage = data.display_name ? `[${taskName}] ${data.message}` : data.message;
            addLog(logMessage);
        }
        scrollToBottom();
    });

    socket.on('download_completed', function (data) {
        _log('收到下载完成事件:', data);

        const taskId = data.task_id || data.aweme_id || 'default';
        let successMessage = '';
        let toastMessage = '';

        if (data.aweme_id) {
            successMessage = `作品下载成功: ${data.message || ''}`;
            toastMessage = `下载完成: ${(data.message || '').substring(0, 20)}`;
            if (data.file_count) successMessage += ` (${data.file_count} 个文件)`;
        } else if (data.total_videos !== undefined) {
            const downloaded = data.current_downloaded || 0;
            const total = data.total_videos || 0;
            successMessage = data.message || `批量下载完成: ${downloaded}/${total} 个作品`;
            toastMessage = `批量下载完成！共 ${downloaded} 个作品`;
        } else {
            successMessage = data.message || '下载完成';
            toastMessage = '下载完成';
        }

        addLog(`${successMessage}`, 'success');

        if (downloadTasks[taskId]) {
            updateTaskStatus(taskId, 'completed', '下载完成');
            setTimeout(() => removeTask(taskId), 5000);
        }

        updateStatus('ready', '就绪');
        showToast(toastMessage, 'success');
        scrollToBottom();
    });

    socket.on('download_failed', function (data) {
        _log('收到下载失败事件:', data);

        const taskId = data.task_id || data.aweme_id || 'default';
        const errorMsg = data.error || data.message || '未知错误';
        addLog(`下载失败: ${errorMsg}`, 'error');

        if (downloadTasks[taskId]) {
            updateTaskStatus(taskId, 'failed', '下载失败');
            setTimeout(() => removeTask(taskId), 8000);
        }

        updateStatus('error', '下载失败');
        showToast(`下载失败: ${errorMsg.substring(0, 50)}`, 'error');
        scrollToBottom();
    });

    socket.on('download_info', function (data) {
        _log('收到下载信息:', data);
        addLog(data.message, 'info');
        scrollToBottom();
    });

    socket.on('download_error', function (data) {
        _log('收到下载错误:', data);
        const taskId = data.task_id || data.aweme_id || 'default';
        addLog(data.message, 'error');

        if (downloadTasks[taskId]) {
            updateTaskStatus(taskId, 'failed', '错误');
        }

        showToast(data.message, 'error');
        scrollToBottom();
    });

    socket.on('download_success', function (data) {
        _log('收到下载成功:', data);
        addLog(data.message, 'success');
        scrollToBottom();
    });

    socket.on('user_video_download_progress', function (data) {
        _log('收到用户视频下载进度:', data);
        updateDownloadProgress(data);

        if (data.type === 'info') addLog(data.message, 'info');
        else if (data.type === 'error') addLog(data.message, 'error');
        else if (data.type === 'success') addLog(data.message, 'success');
        else if (data.type === 'progress') {
            if (data.current_video && data.current_video.status === 'starting') {
                addLog(data.message, 'info');
            }
        }
        scrollToBottom();
    });

    socket.on('user_video_download_failed', function (data) {
        _log('收到用户视频下载失败:', data);
        addLog(data.message, 'error');

        const statusElement = document.getElementById(`status-${data.task_id}`);
        if (statusElement) {
            statusElement.textContent = '下载失败';
            statusElement.className = 'text-danger';
        }

        setTimeout(() => removeProgressElement(data.task_id), 5000);
        showToast(data.message, 'error');
        scrollToBottom();
    });

    // Cookie browser login status
    socket.on('cookie_login_status', function (data) {
        _log('收到Cookie登录状态:', data);
        handleCookieLoginStatus(data);
    });
}
