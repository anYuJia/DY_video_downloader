// ═══════════════════════════════════════════════
// DY Downloader — Main Application Module
// Debug flag, globals, VideoStorage, utilities
// ═══════════════════════════════════════════════

// Debug mode - set to false in production
const _DEBUG = false;
const _log = _DEBUG ? console.log.bind(console) : () => {};

// ── Global Variables ──
let socket;
let currentTasks = {};
let currentUser = null;
let currentVideos = [];
let allVideos = [];
let totalVideos = 0;
let parsedVideoData = null;
let downloadTasks = {};

// Progressive loading state
let _loadingVideos = false;
let _loadCursor = 0;
let _hasMoreVideos = true;
let _selectMode = false;
let _selectedVideos = new Set();
let isHomeView = true; // Tracks if the user is currently on the home/search page

// Utility for setting button loading state
function setButtonLoading(btnId, isLoading, loadingText = '加载中...') {
    const btn = document.getElementById(btnId.replace('#', '')) || document.querySelector(btnId);
    if (!btn) return;
    
    if (isLoading) {
        if (btn.dataset.isLoading === 'true') return;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.dataset.isLoading = 'true';
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${loadingText}`;
    } else {
        if (btn.dataset.isLoading !== 'true') return;
        btn.disabled = false;
        btn.dataset.isLoading = 'false';
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
        }
    }
}

// Search cache
let _cachedSearchUsers = {};

// Immersive player state
let _playerItems = [];
let _playerIndex = 0;
let _playerTimer = null;
let _playerVideo = null;

// ═══════════════════════════════════════════════
// VIDEO STORAGE — localStorage-based data manager
// ═══════════════════════════════════════════════
const VideoStorage = {
    saveVideo: function (videoData) {
        try {
            const videos = this.getAllVideos();
            const awemeId = videoData.aweme_id;

            if (!awemeId) {
                console.warn('视频数据缺少aweme_id，无法存储');
                return false;
            }

            videoData.stored_at = Date.now();
            videoData = this.enhanceVideoData(videoData);
            videos[awemeId] = videoData;

            localStorage.setItem('dy_video_storage', JSON.stringify(videos));
            _log(`视频 ${awemeId} 已存储到本地，媒体类型: ${videoData.media_analysis?.media_type || '未知'}，媒体数量: ${videoData.media_analysis?.media_count || 0}`);
            return true;
        } catch (error) {
            console.error('存储视频数据失败:', error);
            return false;
        }
    },

    enhanceVideoData: function (videoData) {
        const enhanced = { ...videoData };
        const mediaAnalysis = this.analyzeMediaData(videoData);
        enhanced.media_analysis = mediaAnalysis;

        if (videoData.comment_count !== undefined || videoData.digg_count !== undefined || videoData.share_count !== undefined) {
            enhanced.statistics = {
                comment_count: videoData.comment_count || 0,
                digg_count: videoData.digg_count || 0,
                share_count: videoData.share_count || 0
            };
        }

        if (videoData.cover_url) enhanced.cover = videoData.cover_url;
        if (videoData.create_time) enhanced.create_time = videoData.create_time;
        if (videoData.desc) enhanced.desc = videoData.desc;
        if (videoData.media_type) enhanced.raw_media_type = videoData.media_type;

        return enhanced;
    },

    analyzeMediaData: function (videoData) {
        const analysis = {
            media_type: 'unknown',
            media_count: 0,
            has_videos: false,
            has_images: false,
            video_urls: [],
            image_urls: [],
            live_photo_urls: [],
            original_urls: []
        };

        if (videoData.media_urls && Array.isArray(videoData.media_urls)) {
            analysis.media_count = videoData.media_urls.length;
            analysis.original_urls = [...videoData.media_urls];

            videoData.media_urls.forEach(media => {
                if (media.type === 'video') {
                    analysis.has_videos = true;
                    analysis.video_urls.push(media.url);
                } else if (media.type === 'image') {
                    analysis.has_images = true;
                    analysis.image_urls.push(media.url);
                } else if (media.type === 'live_photo') {
                    analysis.has_videos = true;
                    analysis.live_photo_urls.push(media.url);
                }
            });

            if (analysis.has_videos && analysis.has_images) {
                analysis.media_type = 'mixed';
            } else if (analysis.live_photo_urls.length > 0) {
                analysis.media_type = 'live_photo';
            } else if (analysis.has_videos) {
                analysis.media_type = 'video';
            } else if (analysis.has_images) {
                analysis.media_type = 'image';
            }
        }

        analysis.has_images_field = videoData.hasOwnProperty('images') && videoData.images;
        analysis.has_videos_field = videoData.hasOwnProperty('videos') && videoData.videos;

        if (analysis.has_images_field && Array.isArray(videoData.images)) {
            analysis.images_field_count = videoData.images.length;
            analysis.has_images = true;
            if (analysis.media_type === 'unknown') analysis.media_type = 'image';
        }

        if (analysis.has_videos_field && Array.isArray(videoData.videos)) {
            analysis.videos_field_count = videoData.videos.length;
            analysis.has_videos = true;
            if (analysis.media_type === 'unknown') analysis.media_type = 'video';
        }

        if (videoData.media_type) {
            analysis.original_media_type = videoData.media_type;
            if (analysis.media_type === 'unknown') analysis.media_type = videoData.media_type;
        }

        return analysis;
    },

    saveVideos: function (videoList) {
        let successCount = 0;
        videoList.forEach(video => {
            if (this.saveVideo(video)) successCount++;
        });
        _log(`批量存储完成: ${successCount}/${videoList.length} 个视频`);
        return successCount;
    },

    getVideo: function (awemeId) {
        try {
            const videos = this.getAllVideos();
            return videos[awemeId] || null;
        } catch (error) {
            console.error('获取视频数据失败:', error);
            return null;
        }
    },

    getAllVideos: function () {
        try {
            const stored = localStorage.getItem('dy_video_storage');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('获取存储数据失败:', error);
            return {};
        }
    },

    removeVideo: function (awemeId) {
        try {
            const videos = this.getAllVideos();
            if (videos[awemeId]) {
                delete videos[awemeId];
                localStorage.setItem('dy_video_storage', JSON.stringify(videos));
                _log(`视频 ${awemeId} 已从存储中删除`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('删除视频数据失败:', error);
            return false;
        }
    },

    clearAll: function () {
        try {
            localStorage.removeItem('dy_video_storage');
            _log('所有视频数据已清空');
            return true;
        } catch (error) {
            console.error('清空视频数据失败:', error);
            return false;
        }
    },

    // Alias used in some places
    clear: function () {
        return this.clearAll();
    },

    getStats: function () {
        const videos = this.getAllVideos();
        const videoList = Object.values(videos);
        const count = videoList.length;
        let totalSize = 0;

        try {
            totalSize = JSON.stringify(videos).length;
        } catch (error) {
            console.error('计算存储大小失败:', error);
        }

        // Count unique authors
        const authorSet = new Set();
        let oldestDate = null;
        videoList.forEach(v => {
            if (v.author && v.author.nickname) authorSet.add(v.author.nickname);
            if (v.stored_at) {
                if (!oldestDate || v.stored_at < oldestDate) oldestDate = v.stored_at;
            }
        });

        return {
            count: count,
            totalVideos: count,
            size: totalSize,
            totalSize: totalSize,
            sizeFormatted: this.formatBytes(totalSize),
            uniqueAuthors: authorSet.size,
            oldestDate: oldestDate
        };
    },

    formatBytes: function (bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    exportData: function () {
        return this.getAllVideos();
    },

    importData: function (data) {
        const existing = this.getAllVideos();
        let imported = 0;
        let skipped = 0;

        const entries = (typeof data === 'object' && !Array.isArray(data)) ? data : {};
        Object.keys(entries).forEach(key => {
            if (!existing[key]) {
                existing[key] = entries[key];
                imported++;
            } else {
                skipped++;
            }
        });

        localStorage.setItem('dy_video_storage', JSON.stringify(existing));
        return { imported, skipped };
    }
};

// ═══════════════════════════════════════════════
// LIKED DATA CACHE
// ═══════════════════════════════════════════════
const LikedDataCache = {
    LIKED_VIDEOS_KEY: 'liked_videos_cache',
    LIKED_AUTHORS_KEY: 'liked_authors_cache',
    currentDisplayType: null,

    saveLikedVideos: function(videos, count) {
        const cacheData = { data: videos, count: count, timestamp: Date.now() };
        localStorage.setItem(this.LIKED_VIDEOS_KEY, JSON.stringify(cacheData));
        _log(`已缓存 ${videos.length} 个点赞视频`);
    },

    saveLikedAuthors: function(authors, count) {
        const cacheData = { data: authors, count: count, timestamp: Date.now() };
        localStorage.setItem(this.LIKED_AUTHORS_KEY, JSON.stringify(cacheData));
        _log(`已缓存 ${authors.length} 个点赞作者`);
    },

    getLikedVideos: function() {
        try {
            const cached = localStorage.getItem(this.LIKED_VIDEOS_KEY);
            if (cached) {
                const cacheData = JSON.parse(cached);
                _log(`从缓存获取到 ${cacheData.data.length} 个点赞视频`);
                return cacheData;
            }
        } catch (error) {
            console.error('获取点赞视频缓存失败:', error);
        }
        return null;
    },

    getLikedAuthors: function() {
        try {
            const cached = localStorage.getItem(this.LIKED_AUTHORS_KEY);
            if (cached) {
                const cacheData = JSON.parse(cached);
                _log(`从缓存获取到 ${cacheData.data.length} 个点赞作者`);
                return cacheData;
            }
        } catch (error) {
            console.error('获取点赞作者缓存失败:', error);
        }
        return null;
    },

    clearAll: function() {
        localStorage.removeItem(this.LIKED_VIDEOS_KEY);
        localStorage.removeItem(this.LIKED_AUTHORS_KEY);
        _log('已清除所有点赞数据缓存');
    },

    isCacheExpired: function(timestamp, maxAge) {
        maxAge = maxAge || (24 * 60 * 60 * 1000);
        return Date.now() - timestamp > maxAge;
    }
};

// ═══════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════
function formatNumber(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
    return num.toString();
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function _hideEmptyState() {
    const el = document.getElementById('emptyState');
    if (el) el.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function proxyUrl(url) {
    if (!url) return '';
    return '/api/media/proxy?url=' + encodeURIComponent(url);
}

function getMediaTypeDisplay(mediaType) {
    switch (mediaType) {
        case 'video': return '视频';
        case 'image': return '图集';
        case 'live_photo': return 'Live Photo';
        case 'mixed': return '混合';
        default: return '未知';
    }
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initializeApp();
    setupEventListeners();
    setupSocketIO();
    loadConfig();
    setupCookieValidation();
});

function initTheme() {
    const savedTheme = localStorage.getItem('dy_theme') || 'auto';
    applyTheme(savedTheme);
    
    const radio = document.getElementById(`theme-${savedTheme}`);
    if (radio) radio.checked = true;

    document.querySelectorAll('input[name="theme-radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                applyTheme(e.target.value);
                localStorage.setItem('dy_theme', e.target.value);
            }
        });
    });

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (localStorage.getItem('dy_theme') === 'auto') {
            applyTheme('auto');
        }
    });
}

function applyTheme(themeValue) {
    const statusText = document.getElementById('theme-status-text');
    let actualTheme = themeValue;

    if (themeValue === 'auto') {
        const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        actualTheme = isLight ? 'light' : 'dark';
        if (statusText) statusText.textContent = isLight ? '自动匹配 (亮色)' : '自动匹配 (暗色)';
    } else {
        if (statusText) statusText.textContent = themeValue === 'light' ? '始终为亮色' : '始终为暗色';
    }

    if (actualTheme === 'light') {
        document.documentElement.dataset.theme = 'light';
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function initializeApp() {
    addLog('Web界面已加载', 'info');
}

function setupEventListeners() {
    _log('开始设置事件监听器...');

    // Config
    document.getElementById('save-config-btn').addEventListener('click', saveConfig);

    // Search
    document.getElementById('search-btn').addEventListener('click', searchUser);
    document.getElementById('search-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchUser();
    });

    // Link download
    document.getElementById('download-link-btn').addEventListener('click', downloadFromLink);
    document.getElementById('link-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') downloadFromLink();
    });

    // Back button — returns to empty/home state
    document.getElementById('back-btn').addEventListener('click', goBackToHome);

    // Liked buttons
    const likedBtn = document.getElementById('download-liked-btn');
    const likedAuthorsBtn = document.getElementById('download-liked-authors-btn');

    if (likedBtn) {
        likedBtn.addEventListener('click', handleLikedVideosClick);
        _log('点赞视频按钮事件已绑定');
    }

    if (likedAuthorsBtn) {
        likedAuthorsBtn.addEventListener('click', handleLikedAuthorsClick);
        _log('点赞作者按钮事件已绑定');
    }

    // Log controls
    document.getElementById('clear-log-btn').addEventListener('click', clearLog);
    document.getElementById('scroll-to-bottom-btn').addEventListener('click', scrollToBottom);

    // Storage manage
    document.getElementById('storage-manage-btn').addEventListener('click', function () {
        const modal = new bootstrap.Modal(document.getElementById('storageManageModal'));
        modal.show();
        refreshStorageData();
    });

    // Settings drawer toggle
    document.getElementById('settings-toggle').addEventListener('click', function () {
        document.getElementById('settings-drawer').classList.add('open');
        document.getElementById('settings-overlay').classList.add('open');
    });
    document.getElementById('settings-close').addEventListener('click', closeSettingsDrawer);
    document.getElementById('settings-overlay').addEventListener('click', closeSettingsDrawer);

    // Bottom bar
    document.getElementById('bottom-bar-toggle').addEventListener('click', toggleBottomBar);
    document.getElementById('bottom-bar-expand').addEventListener('click', function (e) {
        e.stopPropagation();
        toggleBottomBar();
    });

    // Bottom bar tabs
    document.querySelectorAll('.bottom-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const tab = this.dataset.tab;
            document.querySelectorAll('.bottom-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('panel-' + tab).classList.add('active');
        });
    });

    // Drag-drop
    setupDragDrop();

    // Cookie validation
    setupCookieValidation();

    // Global paste handler
    document.addEventListener('paste', function (e) {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.id === 'cookie-input') return;

        const pastedText = e.clipboardData.getData('text');
        if (pastedText.includes('douyin.com') || pastedText.includes('dy.com')) {
            document.getElementById('link-input').value = pastedText;
            showToast('检测到抖音链接，已自动填入');
        }
    });
}

function closeSettingsDrawer() {
    document.getElementById('settings-drawer').classList.remove('open');
    document.getElementById('settings-overlay').classList.remove('open');
}

function toggleBottomBar() {
    document.getElementById('bottom-bar').classList.toggle('expanded');
}

// ═══════════════════════════════════════════════
// WEBSOCKET
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

// ═══════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════
function setupDragDrop() {
    const dropZone = document.getElementById('drop-zone') || document.getElementById('link-input');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        const text = e.dataTransfer.getData('text');
        if (text.includes('douyin.com') || text.includes('dy.com')) {
            document.getElementById('link-input').value = text;
            showToast('链接已添加到输入框');
        } else {
            showToast('请拖放有效的抖音链接', 'error');
        }
    });
}

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();

        document.getElementById('download-dir-input').value = config.download_dir || '';
        document.getElementById('cookie-input').value = config.cookie || '';

        if (config.cookie_set) {
            updateStatus('ready', '已配置');
        } else {
            updateStatus('error', '需要配置Cookie');
            // 自动弹出 Cookie 配置弹窗
            setTimeout(() => showCookieSetupModal(), 500);
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showToast('加载配置失败', 'error');
    }
}

async function saveConfig() {
    const cookieValue = document.getElementById('cookie-input').value.trim();
    const validation = validateCookie(cookieValue);

    if (!validation.isValid && validation.status !== 'empty') {
        showToast('Cookie验证失败，请检查必要参数', 'error');
        updateCookieValidationUI(validation);
        return;
    }

    const config = {
        download_dir: document.getElementById('download-dir-input').value,
        cookie: cookieValue
    };

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        if (result.success) {
            showToast('配置保存成功', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('保存配置失败', 'error');
    }
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
async function searchUser() {
    const keyword = document.getElementById('search-input').value.trim();
    if (!keyword) {
        showToast('请输入搜索关键词', 'error');
        return;
    }

    const btn = document.getElementById('search-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    hideAllSections();
    updateStatus('running', '搜索中');
    addLog(`搜索用户: ${keyword}`);

    try {
        const response = await fetch('/api/search_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: keyword })
        });

        const result = await response.json();
        if (result.success) {
            if (result.type === 'single') {
                currentUser = result.user;
                showUserDetail(result.user);
                showSingleUser(result.user);
            } else {
                showMultipleUsers(result.users);
            }
        } else if (result.need_verify) {
            showVerifyDialog();
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('搜索失败', 'error');
    } finally {
        updateStatus('ready', '就绪');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-search"></i>';
    }
}

function showSingleUser(user) {
    currentUser = user;
    showUserDetail(user);
}

function showMultipleUsers(users) {
    const modal = new bootstrap.Modal(document.getElementById('user-select-modal'));
    const userList = document.getElementById('modal-user-list');

    _cachedSearchUsers = {};
    users.forEach(user => {
        if (user.sec_uid) _cachedSearchUsers[user.sec_uid] = user;
    });

    userList.innerHTML = users.map(user => createUserCard(user, false)).join('');
    modal.show();
}

function createUserCard(user, showDownloadBtn) {
    const avatarUrl = user.avatar_thumb || user.avatar_larger || '/static/default-avatar.svg';
    return `
        <div class="col-md-6 mb-3">
            <div class="card user-card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-3">
                        <img src="${avatarUrl}" alt="头像" class="rounded-circle me-3" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.src='/static/default-avatar.svg'">
                        <div class="flex-grow-1">
                            <h6 class="card-title mb-1">${user.nickname}</h6>
                            <small class="text-muted">抖音号: ${user.unique_id || '未设置'}</small>
                        </div>
                    </div>
                    <p class="card-text">
                        <small class="text-muted">粉丝: ${user.follower_count}</small><br>
                        <small class="text-muted">${user.signature || '无简介'}</small>
                    </p>
                    ${showDownloadBtn ? `
                        <button class="btn btn-primary btn-sm" onclick="downloadUser('${user.sec_uid}', '${user.nickname}')">
                            <i class="bi bi-download"></i> 下载视频
                        </button>
                    ` : `
                        <button class="btn btn-primary btn-sm" onclick="selectUser('${user.sec_uid}', '${user.nickname}')">
                            <i class="bi bi-check"></i> 选择
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

async function selectUser(secUid, nickname) {
    bootstrap.Modal.getInstance(document.getElementById('user-select-modal')).hide();

    if (_cachedSearchUsers[secUid]) {
        currentUser = _cachedSearchUsers[secUid];
        showUserDetail(currentUser);

        fetch('/api/user_detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.user) {
                Object.assign(currentUser, data.user);
                showUserDetail(currentUser);
            }
        })
        .catch(() => {});
        return;
    }

    fetch('/api/user_detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' })
    })
    .then(response => response.json())
    .then(data => {
        if (data.need_verify) showVerifyDialog();
        else if (data.success) {
            currentUser = data.user;
            showUserDetail(data.user);
        } else {
            showToast(data.message || '获取用户详情失败', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('获取用户详情失败', 'error');
    });
}

// ═══════════════════════════════════════════════
// USER DETAIL
// ═══════════════════════════════════════════════
function goBackToHome() {
    // Hide all content sections
    const sections = ['userDetailSection', 'userVideosSection', 'likedVideosSection', 'likedAuthorsSection', 'linkParseResult'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = '';

    // Hide back button
    document.getElementById('back-btn').style.display = 'none';

    // Clear state
    currentUser = null;
    allVideos = [];
    isHomeView = true; // User returned home, silence background errors
}

function showUserDetail(user) {
    // Hide empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    // Show back button
    document.getElementById('back-btn').style.display = 'flex';

    const avatarUrl = user.avatar_larger || user.avatar_thumb || '/static/default-avatar.svg';

    document.getElementById('userAvatar').src = avatarUrl;
    document.getElementById('userAvatar').onerror = function () { this.src = '/static/default-avatar.svg'; };
    document.getElementById('userNickname').textContent = user.nickname;
    document.getElementById('userUniqueId').textContent = '@' + (user.unique_id || '未设置');
    document.getElementById('userSignature').textContent = user.signature || '暂无简介';
    document.getElementById('userAwemeCount').textContent = user.aweme_count != null ? formatNumber(user.aweme_count) : '-';
    document.getElementById('userFollowerCount').textContent = formatNumber(user.follower_count || 0);
    document.getElementById('userFollowingCount').textContent = user.following_count != null ? formatNumber(user.following_count) : '-';
    document.getElementById('userTotalFavorited').textContent = formatNumber(user.total_favorited || 0);

    document.getElementById('userDetailSection').style.display = 'block';
}

// ═══════════════════════════════════════════════
// VIDEO LIST — progressive loading
// ═══════════════════════════════════════════════
function loadUserVideos() {
    if (!currentUser) {
        showToast('请先选择用户', 'warning');
        return;
    }

    allVideos = [];
    _loadCursor = 0;
    _hasMoreVideos = true;
    _selectedVideos.clear();
    _selectMode = false;

    document.getElementById('userVideosSection').style.display = 'block';
    document.getElementById('userVideosList').innerHTML = '';
    document.getElementById('videoCount').textContent = '加载中...';

    _loadNextPage();
}

async function _loadNextPage() {
    if (_loadingVideos || !_hasMoreVideos) return;
    _loadingVideos = true;

    try {
        const response = await fetch('/api/user_videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sec_uid: currentUser.sec_uid,
                cursor: _loadCursor,
                count: 18
            })
        });
        const data = await response.json();

        if (data.need_verify) {
            showVerifyDialog();
            _loadingVideos = false;
            return;
        }

        if (data.success && data.videos.length > 0) {
            allVideos = allVideos.concat(data.videos);
            window.currentVideos = allVideos;
            _hasMoreVideos = data.has_more;
            _loadCursor = data.cursor;

            displayVideos(data.videos, true);
            document.getElementById('videoCount').textContent = `${allVideos.length} 个作品` + (_hasMoreVideos ? '（加载中...）' : '');

            if (!_hasMoreVideos) {
                document.getElementById('userAwemeCount').textContent = formatNumber(allVideos.length);
            }

            if (_hasMoreVideos) {
                setTimeout(() => _loadNextPage(), 300);
            }
        } else {
            _hasMoreVideos = false;
            if (allVideos.length === 0) {
                document.getElementById('videoCount').textContent = '无作品';
            } else {
                document.getElementById('videoCount').textContent = `${allVideos.length} 个作品`;
                document.getElementById('userAwemeCount').textContent = formatNumber(allVideos.length);
            }
        }
    } catch (error) {
        console.error('加载视频失败:', error);
        showToast('加载视频失败', 'error');
    }

    _loadingVideos = false;
}

// ═══════════════════════════════════════════════
// MULTI-SELECT
// ═══════════════════════════════════════════════
function toggleSelectMode() {
    _selectMode = !_selectMode;
    _selectedVideos.clear();
    const btn = document.getElementById('selectModeBtn');
    if (_selectMode) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="bi bi-x-lg"></i> 取消选择';
        document.getElementById('selectedActions').style.display = 'inline-block';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="bi bi-check2-square"></i> 多选';
        document.getElementById('selectedActions').style.display = 'none';
    }
    document.querySelectorAll('.video-select-overlay').forEach(el => {
        el.style.display = _selectMode ? 'flex' : 'none';
    });
    document.querySelectorAll('.video-card').forEach(el => el.classList.remove('selected'));
    updateSelectedCount();
}

function toggleVideoSelect(awemeId, el) {
    if (!_selectMode) return;
    const card = el.closest('.video-card');
    if (_selectedVideos.has(awemeId)) {
        _selectedVideos.delete(awemeId);
        card.classList.remove('selected');
    } else {
        _selectedVideos.add(awemeId);
        card.classList.add('selected');
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = `已选 ${_selectedVideos.size}`;
}

function downloadSelected() {
    if (_selectedVideos.size === 0) {
        showToast('请先选择要下载的作品', 'warning');
        return;
    }
    _selectedVideos.forEach(awemeId => {
        downloadVideoFromList(awemeId);
    });
    showToast(`开始下载 ${_selectedVideos.size} 个作品`, 'success');
    addLog(`批量下载 ${_selectedVideos.size} 个选中作品`);
}

// ═══════════════════════════════════════════════
// DISPLAY VIDEOS
// ═══════════════════════════════════════════════
function showUserVideos(videos) {
    window.currentVideos = videos;
    allVideos = videos;
    document.getElementById('userVideosList').innerHTML = '';
    displayVideos(videos, false);
    document.getElementById('videoCount').textContent = `${videos.length} 个作品`;
    document.getElementById('userVideosSection').style.display = 'block';
}

function displayVideos(videos, append) {
    append = append || false;
    const videosList = document.getElementById('userVideosList');
    if (!append) videosList.innerHTML = '';

    if (videos && videos.length > 0) {
        const enhancedVideos = videos.map(v => ({...v, stored_at: Date.now()}));
        VideoStorage.saveVideos(enhancedVideos);
        window.currentVideos = allVideos;
    }

    videos.forEach(video => {
        const coverUrl = video.cover_url || '/static/default-cover.svg';
        const createTime = new Date(video.create_time * 1000).toLocaleDateString();
        const mediaType = video.media_type === 'image' ? '图集' : video.media_type === 'live_photo' ? 'Live' : '视频';
        const duration = video.duration > 0 ? formatDuration(video.duration) : '';

        const col = document.createElement('div');
        col.className = 'col-md-3 col-sm-6 mb-3';
        col.innerHTML = `
            <div class="card h-100 video-card" data-aweme-id="${video.aweme_id}">
                <div class="position-relative video-cover-container">
                    <img src="${coverUrl}" class="card-img-top video-cover" alt="封面" onerror="this.src='/static/default-cover.svg'">
                    <div class="video-overlay">
                        <div class="video-stats">
                            <div class="stat-item">
                                <i class="bi bi-heart-fill"></i>
                                <span>${formatNumber(video.digg_count)}</span>
                            </div>
                            <div class="stat-item">
                                <i class="bi bi-chat-fill"></i>
                                <span>${formatNumber(video.comment_count)}</span>
                            </div>
                            <div class="stat-item">
                                <i class="bi bi-share-fill"></i>
                                <span>${formatNumber(video.share_count)}</span>
                            </div>
                        </div>
                    </div>
                    <span class="badge bg-primary position-absolute top-0 end-0 m-2">${mediaType}</span>
                    ${duration ? `<span class="badge bg-dark position-absolute bottom-0 start-0 m-2">${duration}</span>` : ''}
                    <div class="video-select-overlay position-absolute top-0 start-0 w-100 h-100 align-items-center justify-content-center"
                         style="display:none; background:rgba(0,0,0,0.3); cursor:pointer; z-index:5;"
                         onclick="toggleVideoSelect('${video.aweme_id}', this)">
                        <i class="bi bi-check-circle-fill" style="font-size:2rem; color:rgba(255,255,255,0.8);"></i>
                    </div>
                </div>
                <div class="card-body video-card-body">
                    <p class="card-text video-desc">${video.desc || '无描述'}</p>
                    <div class="text-muted small video-date">${createTime}</div>
                    <div class="video-actions">
                        <button class="btn btn-sm btn-outline-primary video-btn" onclick="downloadVideoFromList('${video.aweme_id}')">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info video-btn" onclick="showVideoDetail('${video.aweme_id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success video-btn" onclick="previewMediaFromList('${video.aweme_id}')">
                            <i class="bi bi-play-circle"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        videosList.appendChild(col);
    });
}

// ═══════════════════════════════════════════════
// VIDEO DOWNLOAD FUNCTIONS
// ═══════════════════════════════════════════════
function downloadSingleVideoWithData(awemeId, desc, mediaUrls, rawMediaType, authorName) {
    const storedVideo = VideoStorage.getVideo(awemeId);
    let finalVideoData;

    if (storedVideo) {
        finalVideoData = {
            aweme_id: awemeId,
            desc: storedVideo.desc || desc,
            media_urls: storedVideo.media_urls || mediaUrls,
            raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || rawMediaType,
            author_name: storedVideo.author ? storedVideo.author.nickname : (authorName || '未知作者')
        };
    } else {
        finalVideoData = {
            aweme_id: awemeId,
            desc: desc,
            media_urls: mediaUrls,
            raw_media_type: rawMediaType,
            author_name: authorName || '未知作者'
        };
    }

    if (!finalVideoData.media_urls || finalVideoData.media_urls.length === 0) {
        showToast('媒体URL不能为空', 'error');
        return;
    }

    fetch('/api/download_single_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalVideoData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('开始下载媒体', 'success');
            addLog(`开始下载媒体: ${finalVideoData.desc} (${finalVideoData.media_urls.length}个文件)`);
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('下载失败', 'error');
    });
}

function downloadVideoFromList(awemeId) {
    _log('开始下载视频:', awemeId);
    addLog(`点击下载按钮，视频ID: ${awemeId}`);

    const storedVideo = VideoStorage.getVideo(awemeId);
    let finalVideoData;

    if (storedVideo) {
        finalVideoData = {
            aweme_id: awemeId,
            desc: storedVideo.desc || '视频',
            media_urls: storedVideo.media_urls || [],
            raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || 'video',
            author_name: storedVideo.author ? storedVideo.author.nickname : '未知作者'
        };
    } else {
        const video = window.currentVideos ? window.currentVideos.find(v => v.aweme_id === awemeId) : null;
        if (video) {
            finalVideoData = {
                aweme_id: awemeId,
                desc: video.desc || '视频',
                media_urls: video.media_urls || [],
                raw_media_type: video.raw_media_type || video.media_type || 'video',
                author_name: video.author ? video.author.nickname : '未知作者'
            };
        } else {
            showToast('找不到视频数据', 'error');
            return;
        }
    }

    if (!finalVideoData.media_urls || finalVideoData.media_urls.length === 0) {
        showToast('媒体URL不能为空', 'error');
        return;
    }

    fetch('/api/download_single_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalVideoData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('开始下载媒体', 'success');
            addLog(`下载任务已启动: ${finalVideoData.desc} (任务ID: ${data.task_id || '未知'})`);
        } else {
            showToast(data.message || '下载失败', 'error');
        }
    })
    .catch(error => {
        console.error('下载请求错误:', error);
        showToast('下载请求失败', 'error');
    });
}

function downloadSingleVideo(awemeId, desc) {
    fetch('/api/download_single_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aweme_id: awemeId, desc: desc })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('开始下载视频', 'success');
            addLog(`开始下载视频: ${desc}`);
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('下载失败', 'error');
    });
}

function downloadUserVideos(secUidOverride) {
    const secUid = secUidOverride || (currentUser ? currentUser.sec_uid : null);
    const nickname = currentUser ? currentUser.nickname : '';

    if (!secUid && !currentUser) {
        showToast('请先选择用户', 'warning');
        return;
    }

    fetch('/api/download_user_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sec_uid: secUid || currentUser.sec_uid,
            nickname: nickname || '',
            aweme_count: currentUser ? currentUser.aweme_count : 0
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            createDownloadProgressElement(data.task_id, nickname || '用户');
            showToast('开始下载用户作品', 'success');
            addLog(`开始下载 ${nickname || '用户'} 的作品`);
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('下载失败', 'error');
    });
}

async function downloadUser(secUid, nickname) {
    try {
        const response = await fetch('/api/download_user_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sec_uid: secUid, 
                nickname: nickname || '',
                aweme_count: (currentUser && currentUser.sec_uid === secUid) ? currentUser.aweme_count : 0
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`开始下载 ${nickname} 的视频`, 'success');
            addLog(result.message);
            createDownloadProgressElement(result.task_id, nickname);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('下载失败', 'error');
    }
}

// ═══════════════════════════════════════════════
// LINK PARSE
// ═══════════════════════════════════════════════
async function downloadFromLink() {
    const link = document.getElementById('link-input').value.trim();
    if (!link) {
        showToast('请输入抖音链接', 'error');
        return;
    }

    if (!link.includes('douyin.com') && !link.includes('dy.com')) {
        showToast('请输入有效的抖音链接', 'error');
        return;
    }

    updateStatus('running', '解析中');
    addLog(`解析链接: ${link}`);
    setButtonLoading('download-link-btn', true, '解析中');

    try {
        const response = await fetch('/api/parse_link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link: link })
        });

        const result = await response.json();
        if (result.success) {
            isHomeView = false;
            hideAllSections();

            if (result.user && result.type === 'link_parse') {
                currentUser = result.user;
                showUserDetail(result.user);
                showUserVideos(result.videos);
                showToast('链接解析成功，已显示作者信息和作品', 'success');
                addLog(`解析成功，获取到作者: ${result.user.nickname} 的作品`);

                const parsedVideosList = document.getElementById('parsedVideosList');
                if (parsedVideosList) parsedVideosList.innerHTML = '';
            } else if (result.videos && result.videos.length > 0) {
                showParseResults(result.videos);
                showToast('链接解析成功', 'success');
                addLog(`解析成功，获取到 ${result.videos.length} 个视频`);
            } else {
                showToast('解析成功但未获取到视频信息', 'warning');
            }
        } else {
            if (isHomeView) return;
            showToast(result.message || '解析失败', 'error');
        }
    } catch (error) {
        if (isHomeView) return;
        showToast('解析失败', 'error');
    } finally {
        updateStatus('ready', '就绪');
        setButtonLoading('download-link-btn', false);
    }
}

function showParseResults(videos) {
    const parsedVideosList = document.getElementById('parsedVideosList');
    parsedVideosList.innerHTML = '';
    window.parsedVideosData = videos;

    videos.forEach((video, index) => {
        if (video && video.aweme_id) {
            if (VideoStorage.saveVideo(video)) {
                _log(`解析的视频已存储到本地: ${video.aweme_id}`);
                if (index === 0) addLog(`解析的视频已存储到本地: ${video.aweme_id}`);
            }
        }

        const coverUrl = video.cover_url || '/static/default-cover.svg';
        const avatarUrl = video.author.avatar_thumb || '/static/default-avatar.svg';

        const videoHtml = `
            <div class="row mb-2 border-bottom pb-2" data-aweme-id="${video.aweme_id}">
                <div class="col-4">
                    <img src="${coverUrl}" class="img-fluid rounded" alt="视频封面"
                        style="max-height: 60px; object-fit: cover;"
                        onerror="this.src='/static/default-cover.svg';">
                </div>
                <div class="col-8">
                    <h6 class="small fw-bold mb-1" style="font-size: 0.75rem;">${video.desc || '无描述'}</h6>
                    <p class="text-muted mb-1 small" style="font-size: 0.7rem;">
                        <img src="${avatarUrl}" class="rounded-circle me-1"
                            width="14" height="14" alt="作者头像"
                            onerror="this.src='/static/default-avatar.svg';">
                        <span>${video.author.nickname || '未知作者'}</span>
                    </p>
                    <div class="d-flex justify-content-between text-muted mb-1" style="font-size: 0.65rem;">
                        <span>${formatNumber(video.digg_count || 0)}</span>
                        <span>${formatNumber(video.comment_count || 0)}</span>
                        <span>${formatNumber(video.share_count || 0)}</span>
                    </div>
                    <div class="mt-1">
                        <button class="btn btn-primary btn-sm" style="font-size: 0.65rem; padding: 1px 4px;"
                            onclick="downloadParsedVideo('${video.aweme_id}')">下载</button>
                        <button class="btn btn-outline-info btn-sm" style="font-size: 0.65rem; padding: 1px 4px;"
                            onclick="showVideoDetail('${video.aweme_id}')">详情</button>
                    </div>
                </div>
            </div>
        `;
        parsedVideosList.innerHTML += videoHtml;
    });

    document.getElementById('linkParseResult').style.display = 'block';
    document.getElementById('back-btn').style.display = 'flex';
    _hideEmptyState();
}

function clearParseResult() {
    document.getElementById('linkParseResult').style.display = 'none';
    document.getElementById('parsedVideosList').innerHTML = '';
    window.parsedVideosData = null;
}

async function downloadParsedVideo(awemeId) {
    if (!window.parsedVideosData) {
        showToast('没有可下载的视频', 'error');
        return;
    }

    const videoData = window.parsedVideosData.find(video => video.aweme_id === awemeId);
    if (!videoData) {
        showToast('视频数据不存在', 'error');
        return;
    }

    try {
        const storedVideo = VideoStorage.getVideo(awemeId);
        let finalVideoData = videoData;

        if (storedVideo) {
            finalVideoData = {
                aweme_id: awemeId,
                desc: storedVideo.desc || videoData.desc || '视频',
                media_urls: storedVideo.media_urls || videoData.media_urls || [],
                raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || videoData.media_type || 'video',
                author_name: storedVideo.author ? storedVideo.author.nickname : (videoData.author ? videoData.author.nickname : '未知作者')
            };
        } else {
            finalVideoData.author_name = videoData.author ? videoData.author.nickname : '未知作者';
        }

        const response = await fetch('/api/download_single_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aweme_id: finalVideoData.aweme_id,
                desc: finalVideoData.desc,
                media_urls: finalVideoData.media_urls,
                raw_media_type: finalVideoData.raw_media_type,
                author_name: finalVideoData.author_name
            })
        });

        const result = await response.json();
        if (result.success) {
            const mediaCount = finalVideoData.media_urls ? finalVideoData.media_urls.length : 1;
            showToast('开始下载媒体', 'success');
            addLog(`开始下载媒体: ${finalVideoData.desc} (${mediaCount}个文件)`);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('下载失败', 'error');
    }
}

// ═══════════════════════════════════════════════
// VIDEO DETAIL MODAL
// ═══════════════════════════════════════════════
async function showVideoDetail(awemeId) {
    try {
        let video = VideoStorage.getVideo(awemeId);

        if (video) {
            _log(`从本地存储加载视频详情: ${awemeId}`);
        } else {
            _log(`从API获取视频详情: ${awemeId}`);

            const response = await fetch('/api/video_detail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aweme_id: awemeId })
            });

            const result = await response.json();
            if (result.success) {
                video = result.video;
                if (VideoStorage.saveVideo(video)) {
                    _log(`视频详情已存储到本地: ${awemeId}`);
                }
            } else {
                showToast(result.message, 'error');
                return;
            }
        }

        if (video) {
            document.getElementById('videoDetailCover').src = video.cover_url || '/static/default-cover.svg';
            document.getElementById('videoDetailDesc').textContent = video.desc || '无描述';

            const author = video.author || {};
            document.getElementById('videoDetailAuthorAvatar').src = author.avatar_thumb || '/static/default-avatar.svg';
            document.getElementById('videoDetailAuthorName').textContent = author.nickname || '未知作者';

            document.getElementById('videoDetailLikes').textContent = formatNumber(video.digg_count || 0);
            document.getElementById('videoDetailComments').textContent = formatNumber(video.comment_count || 0);
            document.getElementById('videoDetailShares').textContent = formatNumber(video.share_count || 0);
            document.getElementById('videoDetailTime').textContent = new Date(video.create_time * 1000).toLocaleString();

            const extraInfoContainer = document.getElementById('videoDetailExtraInfo');
            if (extraInfoContainer) {
                let extraHtml = '';
                if (video.aweme_id) extraHtml += `<div class="mb-2"><strong>作品ID:</strong> ${video.aweme_id}</div>`;
                if (video.media_type || video.raw_media_type) extraHtml += `<div class="mb-2"><strong>媒体类型:</strong> ${video.media_type || video.raw_media_type}</div>`;
                if (video.images !== undefined) extraHtml += `<div class="mb-2"><strong>Images字段:</strong> ${video.images ? '存在' : '不存在'}</div>`;
                if (video.videos !== undefined) extraHtml += `<div class="mb-2"><strong>Videos字段:</strong> ${video.videos ? '存在' : '不存在'}</div>`;
                if (video.stored_at) extraHtml += `<div class="mb-2"><strong>存储时间:</strong> ${new Date(video.stored_at).toLocaleString()}</div>`;
                extraInfoContainer.innerHTML = extraHtml;
            }

            const mediaUrlsContainer = document.getElementById('videoDetailMediaUrls');
            if (video.media_urls && video.media_urls.length > 0) {
                let mediaHtml = '';
                video.media_urls.forEach((media, index) => {
                    mediaHtml += `
                        <div class="mb-2 p-2 border rounded">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="badge bg-secondary me-2">${media.type || 'unknown'}</span>
                                <small class="text-muted">媒体 ${index + 1}</small>
                            </div>
                            <div class="mt-1">
                                <a href="${media.url || ''}" target="_blank" class="text-break small" style="word-break: break-all;">${media.url || ''}</a>
                            </div>
                        </div>
                    `;
                });
                mediaUrlsContainer.innerHTML = mediaHtml;
            } else {
                mediaUrlsContainer.innerHTML = '<p class="text-muted">暂无媒体链接</p>';
            }

            setupMediaPreview(video);

            document.getElementById('downloadVideoFromDetail').setAttribute('data-aweme-id', awemeId);
            document.getElementById('downloadVideoFromDetail').setAttribute('data-desc', video.desc || '视频');
            document.getElementById('downloadVideoFromDetail').setAttribute('data-media-urls', JSON.stringify(video.media_urls.map(m => m.url) || []));
            document.getElementById('downloadVideoFromDetail').setAttribute('data-media-type', video.media_type || 'video');

            const modalElement = document.getElementById('videoDetailModal');
            const modal = new bootstrap.Modal(modalElement);

            modalElement.addEventListener('shown.bs.modal', function () {
                modalElement.removeAttribute('aria-hidden');
            });
            modalElement.addEventListener('hidden.bs.modal', function () {
                modalElement.setAttribute('aria-hidden', 'true');
            });

            modal.show();
        }
    } catch (error) {
        showToast('获取视频详情失败', 'error');
    }
}

async function downloadVideoFromDetail() {
    const btn = document.getElementById('downloadVideoFromDetail');
    const awemeId = btn.getAttribute('data-aweme-id');
    const desc = btn.getAttribute('data-desc');
    const mediaUrlsStr = btn.getAttribute('data-media-urls');
    const mediaType = btn.getAttribute('data-media-type');

    if (!awemeId) {
        showToast('无法获取作品ID', 'error');
        return;
    }

    try {
        const storedVideo = VideoStorage.getVideo(awemeId);
        let finalVideoData;

        if (storedVideo) {
            finalVideoData = {
                aweme_id: awemeId,
                desc: storedVideo.desc || desc,
                media_urls: storedVideo.media_urls || [],
                raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || mediaType,
                author_name: storedVideo.author ? storedVideo.author.nickname : '未知作者'
            };
        } else {
            finalVideoData = {
                aweme_id: awemeId,
                desc: desc,
                media_urls: JSON.parse(mediaUrlsStr || '[]'),
                raw_media_type: mediaType,
                author_name: '未知作者'
            };
        }

        if (!finalVideoData.media_urls || finalVideoData.media_urls.length === 0) {
            showToast('没有可下载的媒体链接', 'error');
            return;
        }

        const response = await fetch('/api/download_single_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalVideoData)
        });

        const result = await response.json();
        if (result.success) {
            showToast(`下载任务已启动: ${finalVideoData.desc}`, 'success');
        } else {
            showToast(`下载启动失败: ${result.message}`, 'error');
        }
    } catch (error) {
        showToast('下载请求失败', 'error');
    }
}

// ═══════════════════════════════════════════════
// LIKED VIDEOS / AUTHORS
// ═══════════════════════════════════════════════
async function downloadLikedVideos() {
    try {
        setButtonLoading('download-liked-btn', true, '获取中');
        const count = document.getElementById('liked-videos-count').value || 20;

        const response = await fetch('/api/get_liked_videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: parseInt(count) })
        });

        const result = await response.json();
        if (result.success) {
            isHomeView = false;
            hideAllSections();
            displayLikedVideos(result.data);
            LikedDataCache.saveLikedVideos(result.data, result.data.length);
            LikedDataCache.currentDisplayType = 'videos';
            showToast(`获取到 ${result.data.length} 个点赞视频`, 'success');
            addLog(`获取到 ${result.data.length} 个点赞视频`);
        } else {
            if (isHomeView) return;
            showToast(result.message, 'error');
        }
    } catch (error) {
        if (isHomeView) return;
        console.error('获取点赞视频错误:', error);
        showToast('获取点赞视频失败', 'error');
    } finally {
        setButtonLoading('download-liked-btn', false);
    }
}

async function downloadLikedAuthors() {
    try {
        setButtonLoading('download-liked-authors-btn', true, '获取中');
        const count = document.getElementById('liked-authors-count').value || 20;

        const response = await fetch('/api/get_liked_authors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: parseInt(count) })
        });

        const result = await response.json();
        if (result.success) {
            isHomeView = false;
            hideAllSections();
            displayLikedAuthors(result.data);
            LikedDataCache.saveLikedAuthors(result.data, result.data.length);
            LikedDataCache.currentDisplayType = 'authors';
            showToast(`获取到 ${result.data.length} 个点赞作者`, 'success');
            addLog(`获取到 ${result.data.length} 个点赞作者`);
        } else {
            if (isHomeView) return;
            showToast(result.message, 'error');
        }
    } catch (error) {
        if (isHomeView) return;
        console.error('获取点赞作者错误:', error);
        showToast('获取点赞作者失败', 'error');
    } finally {
        setButtonLoading('download-liked-authors-btn', false);
    }
}

function displayLikedVideos(videos) {
    const section = document.getElementById('likedVideosSection');
    const videosList = document.getElementById('likedVideosList');
    const videoCount = document.getElementById('likedVideoCount');

    videosList.innerHTML = '';
    videoCount.textContent = `${videos.length} 个视频`;
    window.currentVideos = videos;

    videos.forEach(video => {
        VideoStorage.saveVideo(video);
    });

    videos.forEach(video => {
        const coverUrl = video.cover_url || '/static/default-cover.svg';
        const createTime = new Date(video.create_time * 1000).toLocaleDateString();
        const mediaType = video.media_type === 'image' ? (video.image_count > 1 ? '图集' : '图片') : '视频';
        const duration = video.duration > 0 ? formatDuration(video.duration) : '';

        const videoCard = document.createElement('div');
        videoCard.className = 'col-md-3 col-sm-6 mb-3';
        videoCard.innerHTML = `
            <div class="card h-100 video-card">
                <div class="position-relative video-cover-container">
                    <img src="${coverUrl}" class="card-img-top video-cover" alt="封面" onerror="this.src='/static/default-cover.svg'">
                    <div class="video-overlay">
                        <div class="video-stats">
                            <div class="stat-item">
                                <i class="bi bi-heart-fill"></i>
                                <span>${formatNumber(video.statistics?.digg_count || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <i class="bi bi-chat-fill"></i>
                                <span>${formatNumber(video.statistics?.comment_count || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <i class="bi bi-share-fill"></i>
                                <span>${formatNumber(video.statistics?.share_count || 0)}</span>
                            </div>
                        </div>
                    </div>
                    <span class="badge bg-primary position-absolute top-0 end-0 m-2">${mediaType}</span>
                    ${duration ? `<span class="badge bg-dark position-absolute bottom-0 start-0 m-2">${duration}</span>` : ''}
                </div>
                <div class="card-body video-card-body">
                    <p class="card-text video-desc">${video.desc || '无描述'}</p>
                    <div class="text-muted small video-date">${createTime}</div>
                    <div class="video-actions">
                        <button class="btn btn-sm btn-outline-primary video-btn" onclick="downloadVideoFromList('${video.aweme_id}')">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info video-btn" onclick="showVideoDetail('${video.aweme_id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success video-btn" onclick="previewMediaFromList('${video.aweme_id}')">
                            <i class="bi bi-play-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning video-btn" onclick="goToAuthorPage('${video.author?.sec_uid || video.sec_uid}', '${video.author?.nickname || video.nickname}')">
                            <i class="bi bi-person-circle"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        videosList.appendChild(videoCard);
    });

    section.style.display = 'block';
    _hideEmptyState();}

function displayLikedAuthors(authors) {
    const section = document.getElementById('likedAuthorsSection');
    const authorsList = document.getElementById('likedAuthorsList');
    const authorCount = document.getElementById('likedAuthorCount');

    authorsList.innerHTML = '';
    authorCount.textContent = `${authors.length} 个作者`;
    window.currentAuthors = authors;

    authors.forEach(author => {
        const authorCard = document.createElement('div');
        authorCard.className = 'col-md-4 col-sm-6 mb-3';
        authorCard.innerHTML = `
            <div class="card h-100 author-card">
                <div class="card-body author-card-body">
                    <div class="d-flex align-items-center mb-2">
                        <img src="${author.avatar_thumb || author.avatar_larger || '/static/default-avatar.svg'}" class="rounded-circle me-3" alt="头像" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.src='/static/default-avatar.svg'">
                        <div class="flex-grow-1">
                            <h6 class="mb-0 text-truncate" title="${author.nickname}">${author.nickname}</h6>
                            <small class="text-muted">@${author.unique_id || author.sec_uid}</small>
                        </div>
                    </div>
                    <p class="card-text author-desc" title="${author.signature}">${author.signature || '暂无签名'}</p>
                    <div class="row text-center author-stats">
                        <div class="col-3">
                            <small class="text-muted">作品</small>
                            <span class="small">${formatNumber(author.aweme_count || 0)}</span>
                        </div>
                        <div class="col-3">
                            <small class="text-muted">粉丝</small>
                            <span class="small">${formatNumber(author.follower_count || 0)}</span>
                        </div>
                        <div class="col-3">
                            <small class="text-muted">关注</small>
                            <span class="small">${formatNumber(author.following_count || 0)}</span>
                        </div>
                        <div class="col-3">
                            <small class="text-muted">获赞</small>
                            <span class="small">${formatNumber(author.total_favorited || 0)}</span>
                        </div>
                    </div>
                    <div class="author-actions">
                        <button type="button" class="btn btn-sm btn-outline-primary author-btn" onclick="downloadAuthorVideos('${author.sec_uid}')">
                            <i class="bi bi-download"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info author-btn" onclick="loadAuthorVideos('${author.sec_uid}')">
                            <i class="bi bi-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        authorsList.appendChild(authorCard);
    });

    section.style.display = 'block';
    _hideEmptyState();}

async function downloadAllLikedAuthors() {
    try {
        if (!window.currentAuthors || window.currentAuthors.length === 0) {
            showToast('没有可下载的点赞作者，请先获取点赞作者列表', 'warning');
            return;
        }

        const authors = window.currentAuthors;
        const totalCount = authors.length;

        showToast(`开始顺序下载 ${totalCount} 个点赞作者的所有视频`, 'info');
        addLog(`开始顺序下载 ${totalCount} 个点赞作者的所有视频`);

        const batchTaskId = 'batch_liked_authors_' + Date.now();
        createDownloadProgressElement(batchTaskId, `顺序下载点赞作者视频 (${totalCount}个作者)`);

        let successCount = 0, failedCount = 0, processedCount = 0;

        for (let i = 0; i < authors.length; i++) {
            const author = authors[i];
            try {
                addLog(`正在下载第 ${i + 1}/${totalCount} 个作者的视频: ${author.nickname}`);
                const downloadResult = await downloadAuthorAndWait(author.sec_uid, author.nickname);

                if (downloadResult.success) {
                    successCount++;
                    addLog(`第 ${i + 1} 个作者下载完成: ${author.nickname}`, 'success');
                } else {
                    failedCount++;
                    addLog(`第 ${i + 1} 个作者下载失败: ${downloadResult.message || '未知错误'}`, 'error');
                }

                processedCount++;
                const progress = Math.round((processedCount / totalCount) * 100);
                updateDownloadProgress(progress, processedCount, totalCount, batchTaskId);

                if (i < authors.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                failedCount++;
                processedCount++;
                addLog(`第 ${i + 1} 个作者下载请求失败: ${error.message}`, 'error');
                const progress = Math.round((processedCount / totalCount) * 100);
                updateDownloadProgress(progress, processedCount, totalCount, batchTaskId);
            }
        }

        updateDownloadProgress(100, totalCount, totalCount, batchTaskId);
        const summaryMsg = `顺序下载完成！成功: ${successCount}, 失败: ${failedCount}, 总计: ${totalCount} 个作者`;
        showToast(summaryMsg, successCount > 0 ? 'success' : 'warning');
        addLog(summaryMsg);

        setTimeout(() => removeProgressElement(batchTaskId), 3000);
    } catch (error) {
        showToast('批量下载失败: ' + error.message, 'error');
    }
}

async function downloadAuthorAndWait(secUid, nickname) {
    return new Promise(async (resolve) => {
        try {
            const response = await fetch('/api/download_user_video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' })
            });

            const result = await response.json();
            if (!result.success) {
                resolve({ success: false, message: result.message });
                return;
            }

            const taskId = result.task_id;
            if (!taskId) {
                resolve({ success: false, message: '未获取到任务ID' });
                return;
            }

            createDownloadProgressElement(taskId, `${nickname} 的视频`);

            const completionHandler = (data) => {
                if (data.task_id === taskId) {
                    socket.off('download_completed', completionHandler);
                    socket.off('download_error', errorHandler);
                    resolve({ success: true });
                }
            };

            const errorHandler = (data) => {
                if (data.task_id === taskId) {
                    socket.off('download_completed', completionHandler);
                    socket.off('download_error', errorHandler);
                    resolve({ success: false, message: data.message });
                }
            };

            socket.on('download_completed', completionHandler);
            socket.on('download_error', errorHandler);

            setTimeout(() => {
                socket.off('download_completed', completionHandler);
                socket.off('download_error', errorHandler);
                resolve({ success: false, message: '下载超时' });
            }, 30 * 60 * 1000);
        } catch (error) {
            resolve({ success: false, message: error.message });
        }
    });
}

async function downloadAllLikedVideos() {
    try {
        if (!window.currentVideos || window.currentVideos.length === 0) {
            showToast('没有可下载的点赞视频', 'warning');
            return;
        }

        const videos = window.currentVideos;
        const totalCount = videos.length;

        showToast(`开始批量下载 ${totalCount} 个点赞视频`, 'info');
        addLog(`开始批量下载 ${totalCount} 个点赞视频`);

        const batchTaskId = 'batch_liked_videos_' + Date.now();
        createDownloadProgressElement(batchTaskId, `批量下载点赞视频 (${totalCount}个)`);

        let successCount = 0, failedCount = 0, processedCount = 0;

        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            try {
                const videoData = {
                    aweme_id: video.aweme_id,
                    desc: video.desc || `点赞视频_${i + 1}`,
                    media_urls: video.media_urls || [],
                    raw_media_type: video.raw_media_type || video.media_type || 'video',
                    author_name: video.author ? video.author.nickname : '未知作者'
                };

                if (!videoData.media_urls || videoData.media_urls.length === 0) {
                    failedCount++;
                    processedCount++;
                    continue;
                }

                const response = await fetch('/api/download_single_video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(videoData)
                });

                const result = await response.json();
                if (result.success) successCount++;
                else failedCount++;

                processedCount++;
                const progress = Math.round((processedCount / totalCount) * 100);
                updateDownloadProgress(progress, processedCount, totalCount, batchTaskId);

                if (i < videos.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                failedCount++;
                processedCount++;
            }
        }

        updateDownloadProgress(100, totalCount, totalCount, batchTaskId);
        const summaryMsg = `批量下载完成！成功: ${successCount}, 失败: ${failedCount}, 总计: ${totalCount}`;
        showToast(summaryMsg, successCount > 0 ? 'success' : 'warning');
        addLog(summaryMsg);

        setTimeout(() => removeProgressElement(batchTaskId), 3000);
    } catch (error) {
        showToast('批量下载失败: ' + error.message, 'error');
    }
}

function downloadAuthorVideos(secUid) {
    downloadUserVideos(secUid);
}

function loadAuthorVideos(secUid) {
    hideAllSections();

    fetch('/api/user_detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sec_uid: secUid })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = data.user;
            showUserDetail(data.user);
            loadUserVideos();
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        showToast('获取作者详情失败', 'error');
    });
}

async function handleLikedVideosClick() {
    const currentSection = document.getElementById('likedVideosSection');
    const isCurrentlyDisplayed = currentSection && currentSection.style.display === 'block';

    if (isCurrentlyDisplayed || LikedDataCache.currentDisplayType === 'videos') {
        await downloadLikedVideos();
        return;
    }

    const cachedData = LikedDataCache.getLikedVideos();
    if (cachedData && cachedData.data && cachedData.data.length > 0) {
        hideAllSections(true);
        displayLikedVideos(cachedData.data);
        LikedDataCache.currentDisplayType = 'videos';
        showToast(`显示缓存的 ${cachedData.data.length} 个点赞视频`, 'info');
    } else {
        await downloadLikedVideos();
    }
}

async function handleLikedAuthorsClick() {
    const currentSection = document.getElementById('likedAuthorsSection');
    const isCurrentlyDisplayed = currentSection && currentSection.style.display === 'block';

    if (isCurrentlyDisplayed || LikedDataCache.currentDisplayType === 'authors') {
        await downloadLikedAuthors();
        return;
    }

    const cachedData = LikedDataCache.getLikedAuthors();
    if (cachedData && cachedData.data && cachedData.data.length > 0) {
        hideAllSections(true);
        displayLikedAuthors(cachedData.data);
        LikedDataCache.currentDisplayType = 'authors';
        showToast(`显示缓存的 ${cachedData.data.length} 个点赞作者`, 'info');
    } else {
        await downloadLikedAuthors();
    }
}

// ═══════════════════════════════════════════════
// STATUS & PROGRESS
// ═══════════════════════════════════════════════
function updateStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    indicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
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
            startTime: new Date()
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

    // Auto-expand bottom bar when progress starts
    const bottomBar = document.getElementById('bottom-bar');
    if (bottomBar && !bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
    }
}

function createTaskProgressElement(taskId, taskName) {
    const container = document.getElementById('progress-tasks-container');
    if (!container) return;

    const taskElement = document.createElement('div');
    taskElement.id = `task-${taskId}`;
    taskElement.className = 'mb-2 p-2 border rounded';

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

// 全局下载面板状态
let globalDownloadPanel = {
    taskId: null,
    nickname: null
};

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
            <small class="text-muted" id="elapsed-time">用时: 0s</small>
        </div>
    `;

    // 清空之前的进度任务，只保留新的全局面板
    progressContainer.innerHTML = '';
    progressContainer.appendChild(progressElement);

    // Auto-expand bottom bar
    const bottomBar = document.getElementById('bottom-bar');
    if (bottomBar && !bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
    }

    updateActiveTasksCount();
}

let isPaused = false;

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
    const element = document.getElementById(`progress-${taskId}`);
    if (element) {
        element.remove();
        updateActiveTasksCount();

        const progressContainer = document.getElementById('progress-tasks-container');
        if (progressContainer && progressContainer.children.length === 0) {
            const noProgress = document.getElementById('no-progress');
            if (noProgress) noProgress.style.display = 'block';
        }
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
        overallPct = overallPct || 0;

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

function updateProgress(progress, completed, total, taskId) {
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
        progressTime.textContent = `用时: ${elapsed}s`;
    }

    if (progressSpeed && task.completed > 0) {
        const elapsed = (new Date() - task.startTime) / 1000;
        const speed = task.completed / elapsed;
        progressSpeed.textContent = `速度: ${speed.toFixed(1)}/s`;
    }

    // 更新全局面板的当前作品进度
    const currentProgressBar = document.getElementById('current-progress-bar');
    const currentProgressText = document.getElementById('current-progress-text');
    const currentStatus = document.getElementById('current-status');
    const currentSpeedEl = document.getElementById('current-speed');
    const elapsedTime = document.getElementById('elapsed-time');

    if (currentProgressBar) {
        currentProgressBar.style.width = `${task.progress}%`;
        currentProgressBar.setAttribute('aria-valuenow', task.progress);
        if (task.progress >= 100) currentProgressBar.className = 'progress-bar bg-success';
        else if (task.progress >= 50) currentProgressBar.className = 'progress-bar bg-info';
        else currentProgressBar.className = 'progress-bar bg-info';
    }
    if (currentProgressText) {
        currentProgressText.textContent = `${Math.round(task.progress)}%`;
    }
    if (currentStatus) {
        currentStatus.textContent = `${task.completed}/${task.total}`;
    }
    if (currentSpeedEl && task.completed > 0) {
        const elapsed = (new Date() - task.startTime) / 1000;
        const speed = task.completed / elapsed;
        currentSpeedEl.textContent = `速度: ${speed.toFixed(1)}/s`;
    }
    if (elapsedTime && task.startTime) {
        const elapsed = Math.floor((new Date() - task.startTime) / 1000);
        elapsedTime.textContent = `用时: ${elapsed}s`;
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

// ═══════════════════════════════════════════════
// MEDIA PREVIEW
// ═══════════════════════════════════════════════
function setupMediaPreview(video) {
    const previewContainer = document.getElementById('videoDetailMediaPreview');

    if (!video.media_urls || video.media_urls.length === 0) {
        previewContainer.innerHTML = '<p class="text-muted">暂无媒体内容</p>';
        return;
    }

    let previewHtml = '';

    video.media_urls.forEach((media, index) => {
        const mediaType = media.type || 'unknown';
        const mediaUrl = proxyUrl(media.url || '');

        if (mediaType === 'video' || mediaType === 'live_photo') {
            previewHtml += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-primary">${mediaType === 'live_photo' ? 'Live Photo' : '视频'}</span>
                        <small class="text-muted">媒体 ${index + 1}</small>
                    </div>
                    <video controls class="w-100" style="max-height: 300px; border-radius: 8px;">
                        <source src="${mediaUrl}" type="video/mp4">
                    </video>
                </div>
            `;
        } else if (mediaType === 'image') {
            previewHtml += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-success">图片</span>
                        <small class="text-muted">媒体 ${index + 1}</small>
                    </div>
                    <img src="${mediaUrl}" class="w-100" style="max-height: 300px; object-fit: contain; border-radius: 8px; cursor: pointer;" onerror="this.style.display='none';">
                </div>
            `;
        } else {
            previewHtml += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-secondary">未知类型</span>
                        <small class="text-muted">媒体 ${index + 1}</small>
                    </div>
                    <div class="alert alert-info">
                        <i class="bi bi-file-earmark"></i> 无法预览此媒体类型
                        <br><a href="${mediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">在新窗口中打开</a>
                    </div>
                </div>
            `;
        }
    });

    previewContainer.innerHTML = previewHtml;
}

function openImageModal(imageUrl) {
    let imageModal = document.getElementById('imageModal');
    if (!imageModal) {
        const modalHtml = `
            <div class="modal fade" id="imageModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">图片预览</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body text-center">
                            <img id="modalImage" src="" class="img-fluid" style="max-height: 70vh;">
                        </div>
                        <div class="modal-footer">
                            <a id="modalImageDownload" href="" target="_blank" class="btn btn-primary">在新窗口中打开</a>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        imageModal = document.getElementById('imageModal');
    }

    document.getElementById('modalImage').src = imageUrl;
    document.getElementById('modalImageDownload').href = imageUrl;
    const modal = new bootstrap.Modal(imageModal);
    modal.show();
}

function setupMediaPreviewControls(video) {
    const mediaControls = document.getElementById('mediaControls');
    const showVideoBtn = document.getElementById('showVideoBtn');
    const showImagesBtn = document.getElementById('showImagesBtn');
    const videoPlayer = document.getElementById('videoDetailPlayer');

    resetMediaDisplay();

    if (video.media_urls && video.media_urls.length > 0) {
        mediaControls.style.display = 'block';

        const hasVideo = video.media_urls.some(media => media.type === 'video');
        const hasImages = video.media_urls.some(media => media.type === 'image' || media.type === 'live_photo');

        if (hasVideo) {
            const videoUrl = video.media_urls.find(media => media.type === 'video')?.url;
            if (videoUrl) {
                videoPlayer.src = videoUrl;
                showVideoBtn.style.display = 'inline-block';
            }
        }

        if (hasImages) {
            setupImageCarousel(video.media_urls.filter(media => media.type === 'image' || media.type === 'live_photo'));
            showImagesBtn.style.display = 'inline-block';
        }
    } else {
        mediaControls.style.display = 'none';
    }
}

function setupImageCarousel(imageMedias) {
    const carouselInner = document.getElementById('carouselInner');
    const carouselIndicators = document.getElementById('carouselIndicators');

    carouselInner.innerHTML = '';
    carouselIndicators.innerHTML = '';

    imageMedias.forEach((media, index) => {
        const carouselItem = document.createElement('div');
        carouselItem.className = `carousel-item ${index === 0 ? 'active' : ''}`;

        if (media.type === 'live_photo') {
            carouselItem.innerHTML = `
                <video class="d-block w-100 rounded" controls>
                    <source src="${media.url}" type="video/mp4">
                </video>
                <div class="carousel-caption d-none d-md-block">
                    <span class="badge bg-primary">Live Photo</span>
                </div>
            `;
        } else {
            carouselItem.innerHTML = `
                <img src="${media.url}" class="d-block w-100 rounded" alt="图片 ${index + 1}">
                <div class="carousel-caption d-none d-md-block">
                    <span class="badge bg-secondary">图片 ${index + 1}</span>
                </div>
            `;
        }

        carouselInner.appendChild(carouselItem);

        const indicator = document.createElement('button');
        indicator.type = 'button';
        indicator.setAttribute('data-bs-target', '#imageCarousel');
        indicator.setAttribute('data-bs-slide-to', index.toString());
        if (index === 0) {
            indicator.className = 'active';
            indicator.setAttribute('aria-current', 'true');
        }
        indicator.setAttribute('aria-label', `Slide ${index + 1}`);
        carouselIndicators.appendChild(indicator);
    });
}

function resetMediaDisplay() {
    document.getElementById('videoDetailCover').style.display = 'none';
    document.getElementById('videoDetailPlayer').style.display = 'none';
    document.getElementById('imageCarousel').style.display = 'none';
    document.querySelectorAll('#mediaControls .btn').forEach(btn => btn.classList.remove('active'));
}

function showCover() {
    resetMediaDisplay();
    document.getElementById('videoDetailCover').style.display = 'block';
    document.getElementById('showCoverBtn').classList.add('active');
}

function showVideo() {
    resetMediaDisplay();
    document.getElementById('videoDetailPlayer').style.display = 'block';
    document.getElementById('showVideoBtn').classList.add('active');
}

function showImages() {
    resetMediaDisplay();
    document.getElementById('imageCarousel').style.display = 'block';
    document.getElementById('showImagesBtn').classList.add('active');
}

function previewMediaFromStorage(awemeId) {
    const video = VideoStorage.getVideo(awemeId);
    if (video && video.media_urls && video.media_urls.length > 0) {
        setupMediaPreviewModal(video);
        const modal = new bootstrap.Modal(document.getElementById('mediaPreviewModal'));
        modal.show();
    } else {
        showToast('没有可预览的媒体内容', 'error');
    }
}

function setupMediaPreviewModal(video) {
    const modalTitle = document.getElementById('mediaPreviewModalTitle');
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');

    modalTitle.textContent = video.desc || '媒体预览';
    mediaPreviewContainer.innerHTML = '';

    if (video.media_urls && video.media_urls.length > 0) {
        const mediaHtml = video.media_urls.map((media, index) => {
            switch (media.type) {
                case 'video':
                    return `<div class="mb-3"><h6>视频 ${index + 1}</h6><video class="w-100 rounded" controls style="max-height: 400px;"><source src="${media.url}" type="video/mp4"></video></div>`;
                case 'live_photo':
                    return `<div class="mb-3"><h6>Live Photo ${index + 1}</h6><video class="w-100 rounded" controls style="max-height: 400px;"><source src="${media.url}" type="video/mp4"></video></div>`;
                case 'image':
                    return `<div class="mb-3"><h6>图片 ${index + 1}</h6><img src="${media.url}" class="w-100 rounded" style="max-height: 400px; object-fit: contain;" onclick="openImageModal('${media.url}')"></div>`;
                default:
                    return `<div class="mb-3"><h6>未知类型 ${index + 1}</h6><a href="${media.url}" target="_blank" class="btn btn-outline-primary btn-sm"><i class="bi bi-box-arrow-up-right"></i> 打开</a></div>`;
            }
        }).join('');
        mediaPreviewContainer.innerHTML = mediaHtml;
    } else {
        mediaPreviewContainer.innerHTML = '<p class="text-muted text-center">没有可预览的媒体内容</p>';
    }
}

function previewMediaFromList(awemeId) {
    const storedVideo = VideoStorage.getVideo(awemeId);
    if (storedVideo && storedVideo.media_urls && storedVideo.media_urls.length > 0) {
        openImmersivePlayer(storedVideo);
        return;
    }

    if (window.currentVideos) {
        const video = window.currentVideos.find(v => v.aweme_id === awemeId);
        if (video && video.media_urls && video.media_urls.length > 0) {
            openImmersivePlayer(video);
            return;
        }
    }

    showToast('没有可预览的媒体内容', 'error');
}

// ═══════════════════════════════════════════════
// IMMERSIVE PLAYER
// ═══════════════════════════════════════════════
function openImmersivePlayer(video) {
    if (!video || !video.media_urls || video.media_urls.length === 0) {
        showToast('没有可播放的媒体', 'warning');
        return;
    }

    _playerItems = video.media_urls.map(m => ({
        type: m.type || 'unknown',
        url: m.url,
        proxy: proxyUrl(m.url)
    }));
    _playerIndex = 0;

    const overlay = document.createElement('div');
    overlay.id = 'immersive-player';
    overlay.innerHTML = `
        <div class="ip-backdrop" onclick="closeImmersivePlayer()"></div>
        <div class="ip-container">
            <div class="ip-header">
                <span class="ip-title">${escapeHtml(video.desc || '媒体播放')}</span>
                <span class="ip-counter" id="ip-counter">1 / ${_playerItems.length}</span>
                <button class="ip-close" onclick="closeImmersivePlayer()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div class="ip-media" id="ip-media"></div>
            <div class="ip-controls">
                <button class="ip-btn" onclick="playerPrev()" id="ip-prev"><i class="bi bi-chevron-left"></i></button>
                <button class="ip-btn ip-play-btn" onclick="playerTogglePlay()" id="ip-play"><i class="bi bi-pause-fill"></i></button>
                <button class="ip-btn" onclick="playerNext()" id="ip-next"><i class="bi bi-chevron-right"></i></button>
            </div>
            <div class="ip-progress-track" onclick="playerSeek(event)">
                <div class="ip-progress-bar" id="ip-progress"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', _playerKeyHandler);
    _renderPlayerItem();
}

function _playerKeyHandler(e) {
    if (e.key === 'Escape') closeImmersivePlayer();
    if (e.key === 'ArrowLeft') playerPrev();
    if (e.key === 'ArrowRight') playerNext();
    if (e.key === ' ') { e.preventDefault(); playerTogglePlay(); }
}

function closeImmersivePlayer() {
    if (_playerTimer) clearInterval(_playerTimer);
    if (_playerVideo) { _playerVideo.pause(); _playerVideo = null; }
    const el = document.getElementById('immersive-player');
    if (el) el.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _playerKeyHandler);
}

function _renderPlayerItem() {
    if (_playerTimer) clearInterval(_playerTimer);
    const container = document.getElementById('ip-media');
    const counter = document.getElementById('ip-counter');
    const progress = document.getElementById('ip-progress');
    const playBtn = document.getElementById('ip-play');
    if (!container) return;

    const item = _playerItems[_playerIndex];
    counter.textContent = `${_playerIndex + 1} / ${_playerItems.length}`;
    progress.style.width = '0%';

    if (item.type === 'video' || item.type === 'live_photo') {
        container.innerHTML = `<video id="ip-video" autoplay playsinline></video>`;
        _playerVideo = document.getElementById('ip-video');
        _playerVideo.src = item.proxy;
        playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';

        _playerVideo.ontimeupdate = () => {
            if (_playerVideo.duration) {
                progress.style.width = (_playerVideo.currentTime / _playerVideo.duration * 100) + '%';
            }
        };
        _playerVideo.onended = () => {
            if (_playerIndex < _playerItems.length - 1) playerNext();
            else playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        };
        _playerVideo.onerror = () => {
            container.innerHTML = `<div class="ip-error"><i class="bi bi-exclamation-triangle"></i><p>视频加载失败</p><a href="${item.url}" target="_blank" class="btn btn-sm btn-outline-light mt-2">在新窗口打开</a></div>`;
        };
    } else if (item.type === 'image') {
        container.innerHTML = `<img src="${item.proxy}" alt="图片" onerror="this.src='${item.url}'">`;
        _playerVideo = null;
        playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';

        let elapsed = 0;
        _playerTimer = setInterval(() => {
            elapsed += 50;
            progress.style.width = (elapsed / 3000 * 100) + '%';
            if (elapsed >= 3000) {
                if (_playerIndex < _playerItems.length - 1) playerNext();
                else clearInterval(_playerTimer);
            }
        }, 50);
    } else {
        container.innerHTML = `<div class="ip-error"><p>不支持的媒体类型: ${item.type}</p></div>`;
    }
}

function playerNext() {
    if (_playerIndex < _playerItems.length - 1) {
        _playerIndex++;
        _renderPlayerItem();
    }
}

function playerPrev() {
    if (_playerIndex > 0) {
        _playerIndex--;
        _renderPlayerItem();
    }
}

function playerTogglePlay() {
    const playBtn = document.getElementById('ip-play');
    if (_playerVideo) {
        if (_playerVideo.paused) {
            _playerVideo.play();
            playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
        } else {
            _playerVideo.pause();
            playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        }
    }
}

function playerSeek(e) {
    if (!_playerVideo || !_playerVideo.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    _playerVideo.currentTime = pct * _playerVideo.duration;
}

// ═══════════════════════════════════════════════
// LOG & TOAST
// ═══════════════════════════════════════════════
function addLog(message, type) {
    type = type || 'info';
    _log('添加日志:', message, type);
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type} mb-1`;

    const timestamp = new Date().toLocaleTimeString();

    let icon = '';
    switch (type) {
        case 'success': icon = '+ '; break;
        case 'error': icon = 'x '; break;
        case 'warning': icon = '! '; break;
        default: icon = '> '; break;
    }

    logEntry.innerHTML = `
        <div class="d-flex align-items-start">
            <span class="log-time text-muted me-2" style="font-size: 0.75rem; min-width: 60px;">[${timestamp}]</span>
            <span class="log-content flex-grow-1" style="font-size: 0.8rem; line-height: 1.2;">${icon}${message}</span>
        </div>
    `;

    logContainer.appendChild(logEntry);

    setTimeout(() => {
        const logParent = logContainer.parentElement;
        if (logParent) logParent.scrollTop = logParent.scrollHeight;
    }, 10);

    const maxLogs = 2000;
    while (logContainer.children.length > maxLogs) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

function clearLog() {
    const logContainer = document.getElementById('log-container');
    logContainer.innerHTML = '';
    addLog('日志已清空', 'info');
}

function scrollToBottom() {
    setTimeout(() => {
        const logContainer = document.getElementById('log-container');
        if (logContainer && logContainer.parentElement) {
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }

        const progressContainer = document.querySelector('#progress-tasks-container');
        if (progressContainer && progressContainer.parentElement) {
            progressContainer.parentElement.scrollTop = progressContainer.parentElement.scrollHeight;
        }
    }, 10);
}

function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('notification-toast');
    const toastMessage = document.getElementById('toast-message');

    toastMessage.textContent = message;

    const header = toast.querySelector('.toast-header i');
    header.className = `bi me-2 ${type === 'success' ? 'bi-check-circle text-success' :
        type === 'error' ? 'bi-exclamation-triangle text-danger' :
            'bi-info-circle text-primary'
    }`;

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// ═══════════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════════
function hideAllSections(fromCache) {
    const sections = [
        'userDetailSection',
        'userVideosSection',
        'likedVideosSection',
        'likedAuthorsSection',
        'linkParseResult'
    ];

    sections.forEach(sectionId => {
        const element = document.getElementById(sectionId);
        if (element) element.style.display = 'none';
    });

    // Show empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'flex';

    const parsedVideosList = document.getElementById('parsedVideosList');
    if (parsedVideosList) parsedVideosList.innerHTML = '';

    if (typeof LikedDataCache !== 'undefined' && !fromCache) {
        LikedDataCache.currentDisplayType = null;
    }
}

// ═══════════════════════════════════════════════
// VERIFY DIALOG
// ═══════════════════════════════════════════════
async function apiFetch(url, options) {
    options = options || {};
    const resp = await fetch(url, options);
    const data = await resp.json();
    if (data.need_verify) {
        showVerifyDialog();
        throw new Error('need_verify');
    }
    return data;
}

function showVerifyDialog() {
    showToast('正在打开验证浏览器...', 'info');
    addLog('触发滑块验证，正在使用已存储的Cookie打开浏览器...', 'warning');

    // 调用后端API，使用已存储的Cookie打开浏览器
    fetch('/api/open_verify_browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('请在浏览器中完成验证，然后重新搜索', 'info');
            addLog('浏览器已打开，请在浏览器中完成验证后重新搜索', 'info');
        } else {
            // 如果后端打开失败，尝试直接打开
            const verifyWin = window.open('https://www.douyin.com/', 'douyin_verify', 'width=1100,height=750,scrollbars=yes');
            showToast('需要滑块验证，请在弹出窗口中完成验证后重试', 'warning');
            addLog('触发滑块验证，请在弹出窗口中完成后重新搜索', 'warning');
        }
    })
    .catch(err => {
        console.error('打开验证浏览器失败:', err);
        // 回退到直接打开
        const verifyWin = window.open('https://www.douyin.com/', 'douyin_verify', 'width=1100,height=750,scrollbars=yes');
        showToast('需要滑块验证，请在弹出窗口中完成验证后重试', 'warning');
    });
}

// ═══════════════════════════════════════════════
// COOKIE VALIDATION
// ═══════════════════════════════════════════════
function validateCookie(cookieString) {
    if (!cookieString || cookieString.trim() === '') {
        return { isValid: false, status: 'empty', message: '请输入Cookie', missingParams: [] };
    }

    const requiredParams = ['sessionid'];
    const recommendedParams = ['ttwid', 'passport_csrf_token', 's_v_web_id'];

    const missingParams = [];
    const missingRecommended = [];
    const cookieLower = cookieString.toLowerCase();

    requiredParams.forEach(param => {
        if (!cookieLower.includes(param.toLowerCase())) missingParams.push(param);
    });

    recommendedParams.forEach(param => {
        if (!cookieLower.includes(param.toLowerCase())) missingRecommended.push(param);
    });

    if (missingParams.length > 0) {
        return { isValid: false, status: 'invalid', message: 'Cookie缺少必要参数: ' + missingParams.join(', '), missingParams: missingParams };
    } else if (missingRecommended.length > 0) {
        return { isValid: true, status: 'warning', message: 'Cookie可用，但建议补充: ' + missingRecommended.join(', '), missingParams: missingRecommended };
    } else {
        return { isValid: true, status: 'valid', message: 'Cookie格式正确', missingParams: [] };
    }
}

function updateCookieValidationUI(validation) {
    const statusContainer = document.getElementById('cookie-validation-status');
    const statusIcon = document.getElementById('cookie-status-icon');
    const statusText = document.getElementById('cookie-status-text');
    const missingParamsContainer = document.getElementById('cookie-missing-params');
    const missingParamsList = document.getElementById('missing-params-list');

    statusContainer.style.display = 'block';

    if (validation.status === 'empty') {
        statusContainer.style.display = 'none';
        return;
    }

    if (validation.isValid) {
        statusIcon.className = 'bi bi-check-circle-fill text-success me-1';
        statusText.className = 'text-success';
        statusText.textContent = validation.message;
        missingParamsContainer.style.display = 'none';
    } else {
        statusIcon.className = 'bi bi-exclamation-triangle-fill text-danger me-1';
        statusText.className = 'text-danger';
        statusText.textContent = validation.message;

        if (validation.missingParams.length > 0) {
            missingParamsContainer.style.display = 'block';
            missingParamsList.innerHTML = validation.missingParams.map(param =>
                `<span class="badge bg-danger me-1">${param}</span>`
            ).join('');
        } else {
            missingParamsContainer.style.display = 'none';
        }
    }
}

function setupCookieValidation() {
    const cookieInput = document.getElementById('cookie-input');
    if (!cookieInput) return;

    cookieInput.addEventListener('input', function() {
        const validation = validateCookie(this.value);
        updateCookieValidationUI(validation);
    });

    cookieInput.addEventListener('paste', function() {
        setTimeout(() => {
            const validation = validateCookie(this.value);
            updateCookieValidationUI(validation);
        }, 100);
    });
}

// ═══════════════════════════════════════════════
// COOKIE SETUP MODAL
// ═══════════════════════════════════════════════
let _cookieSetupModal = null;
let _browserLoginActive = false;

function showCookieSetupModal() {
    const modalEl = document.getElementById('cookieSetupModal');
    if (!modalEl) return;
    if (!_cookieSetupModal) {
        _cookieSetupModal = new bootstrap.Modal(modalEl);
    }
    // 同步 Cookie 输入框
    const mainCookie = document.getElementById('cookie-input');
    const modalCookie = document.getElementById('cookie-modal-input');
    if (mainCookie && modalCookie) {
        modalCookie.value = mainCookie.value;
    }
    _cookieSetupModal.show();
}

function switchCookieTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.cookie-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Update panels
    document.querySelectorAll('.cookie-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanel = document.getElementById('cookie-tab-' + tab);
    if (targetPanel) targetPanel.classList.add('active');
}

function saveCookieFromModal() {
    const cookieValue = document.getElementById('cookie-modal-input').value.trim();
    const validation = validateCookie(cookieValue);

    // Update validation UI in modal
    const statusContainer = document.getElementById('cookie-modal-validation');
    const statusIcon = document.getElementById('cookie-modal-status-icon');
    const statusText = document.getElementById('cookie-modal-status-text');

    if (!validation.isValid && validation.status !== 'empty') {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-exclamation-triangle-fill text-danger me-1';
        statusText.className = 'text-danger';
        statusText.textContent = validation.message;
        return;
    }

    if (validation.status === 'empty') {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-exclamation-triangle-fill text-warning me-1';
        statusText.className = 'text-warning';
        statusText.textContent = '请输入 Cookie';
        return;
    }

    // Save via API
    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cookie: cookieValue,
            download_dir: document.getElementById('download-dir-input').value
        })
    }).then(response => response.json()).then(data => {
        if (data.success) {
            showToast('Cookie 保存成功！', 'success');
            updateStatus('ready', '已配置');
            // Sync to settings drawer
            document.getElementById('cookie-input').value = cookieValue;
            // Close modal
            if (_cookieSetupModal) _cookieSetupModal.hide();
        } else {
            showToast('保存失败: ' + (data.message || ''), 'error');
        }
    }).catch(error => {
        showToast('保存失败: ' + error.message, 'error');
    });
}

function startBrowserLogin() {
    if (_browserLoginActive) return;
    _browserLoginActive = true;

    const startBtn = document.getElementById('cookie-browser-start-btn');
    const cancelBtn = document.getElementById('cookie-browser-cancel-btn');
    const statusEl = document.getElementById('cookie-browser-status');
    const statusText = document.getElementById('cookie-browser-status-text');
    const spinner = document.getElementById('cookie-browser-spinner');
    const resultIcon = document.getElementById('cookie-browser-result-icon');

    startBtn.disabled = true;
    startBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div> 正在启动浏览器...';
    cancelBtn.style.display = 'block';
    statusEl.style.display = 'flex';
    statusEl.className = 'cookie-browser-status';
    spinner.style.display = 'block';
    resultIcon.style.display = 'none';
    statusText.textContent = '正在启动浏览器...';

    fetch('/api/cookie/browser_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            timeout: 300,
            browser: document.getElementById('cookie-browser-type').value || 'chrome'
        })
    }).then(response => response.json()).then(data => {
        if (!data.success) {
            resetBrowserLoginUI();
            showToast(data.message || '启动失败', 'error');
        }
    }).catch(error => {
        resetBrowserLoginUI();
        showToast('启动失败: ' + error.message, 'error');
    });
}

function cancelBrowserLogin() {
    fetch('/api/cookie/browser_login/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(response => response.json()).then(data => {
        resetBrowserLoginUI();
        showToast(data.message || '已取消', 'info');
    }).catch(() => {
        resetBrowserLoginUI();
    });
}

function resetBrowserLoginUI() {
    _browserLoginActive = false;
    const startBtn = document.getElementById('cookie-browser-start-btn');
    const cancelBtn = document.getElementById('cookie-browser-cancel-btn');

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i> 打开浏览器登录';
    }
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function handleCookieLoginStatus(data) {
    const statusEl = document.getElementById('cookie-browser-status');
    const statusText = document.getElementById('cookie-browser-status-text');
    const spinner = document.getElementById('cookie-browser-spinner');
    const resultIcon = document.getElementById('cookie-browser-result-icon');

    if (!statusEl) return;
    statusEl.style.display = 'flex';
    statusText.textContent = data.message || '';

    switch (data.event) {
        case 'success':
            statusEl.className = 'cookie-browser-status status-success';
            spinner.style.display = 'none';
            resultIcon.style.display = 'block';
            resultIcon.className = 'bi bi-check-circle-fill text-success';
            resetBrowserLoginUI();
            // Update cookie in settings drawer and main config
            if (data.cookie) {
                document.getElementById('cookie-input').value = data.cookie;
            }
            updateStatus('ready', '已配置');
            showToast('Cookie 获取成功！', 'success');
            // Close modal after short delay
            setTimeout(() => {
                if (_cookieSetupModal) _cookieSetupModal.hide();
            }, 1500);
            break;

        case 'failed':
        case 'error':
            statusEl.className = 'cookie-browser-status status-error';
            spinner.style.display = 'none';
            resultIcon.style.display = 'block';
            resultIcon.className = 'bi bi-x-circle-fill text-danger';
            resetBrowserLoginUI();
            break;

        case 'cancelled':
            statusEl.className = 'cookie-browser-status status-error';
            spinner.style.display = 'none';
            resultIcon.style.display = 'block';
            resultIcon.className = 'bi bi-dash-circle-fill text-warning';
            resetBrowserLoginUI();
            break;

        case 'timeout':
            statusEl.className = 'cookie-browser-status status-error';
            spinner.style.display = 'none';
            resultIcon.style.display = 'block';
            resultIcon.className = 'bi bi-clock-fill text-warning';
            resetBrowserLoginUI();
            break;

        default:
            // Progress updates (waiting, page_loaded, etc.)
            statusEl.className = 'cookie-browser-status';
            spinner.style.display = 'block';
            resultIcon.style.display = 'none';
            break;
    }
}

// ═══════════════════════════════════════════════
// STORAGE MANAGEMENT
// ═══════════════════════════════════════════════
function refreshStorageData() {
    try {
        const stats = VideoStorage.getStats();
        const videos = Object.values(VideoStorage.getAllVideos());

        document.getElementById('storageVideoCount').textContent = stats.totalVideos;
        document.getElementById('storageSize').textContent = formatBytes(stats.totalSize);
        document.getElementById('storageAuthors').textContent = stats.uniqueAuthors;
        document.getElementById('storageOldest').textContent = stats.oldestDate ?
            new Date(stats.oldestDate).toLocaleDateString() : '-';

        displayStorageVideos(videos);
        addLog(`存储数据已刷新: ${stats.totalVideos} 个视频`);
    } catch (error) {
        console.error('刷新存储数据失败:', error);
        showToast('刷新存储数据失败', 'error');
    }
}

function displayStorageVideos(videos) {
    const container = document.getElementById('storageVideosList');

    if (!videos || videos.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-4"><i class="bi bi-database"></i><p>暂无存储数据</p></div>`;
        return;
    }

    const html = videos.map(video => {
        const createTime = video.create_time ? new Date(video.create_time * 1000).toLocaleDateString() : '-';
        const storedTime = video.stored_at ? new Date(video.stored_at).toLocaleString() : '-';
        const mediaAnalysis = video.media_analysis || {};
        const mediaType = getMediaTypeDisplay(mediaAnalysis.media_type || video.raw_media_type || 'unknown');
        const mediaCount = mediaAnalysis.media_count || 0;

        const mediaInfo = [];
        if (mediaAnalysis.has_videos) mediaInfo.push('<span class="badge bg-primary me-1">视频</span>');
        if (mediaAnalysis.has_images) mediaInfo.push('<span class="badge bg-info me-1">图片</span>');
        if (mediaAnalysis.live_photo_urls && mediaAnalysis.live_photo_urls.length > 0) {
            mediaInfo.push(`<span class="badge bg-warning me-1">Live Photo(${mediaAnalysis.live_photo_urls.length})</span>`);
        }
        const mediaInfoHtml = mediaInfo.length > 0 ? `<div class="mt-1">${mediaInfo.join('')}</div>` : '';

        return `
            <div class="card mb-2">
                <div class="card-body p-3">
                    <div class="row align-items-center">
                        <div class="col-md-2">
                            <img src="${video.cover || video.cover_url || '/static/placeholder.jpg'}"
                                 class="img-thumbnail" style="width: 80px; height: 80px; object-fit: cover;"
                                 alt="封面">
                        </div>
                        <div class="col-md-6">
                            <h6 class="mb-1">${escapeHtml(video.desc || '无描述')}</h6>
                            <small class="text-muted">
                                <i class="bi bi-person"></i> ${escapeHtml(video.author?.nickname || '未知作者')}
                                <span class="ms-2"><i class="bi bi-calendar"></i> ${createTime}</span>
                                <span class="ms-2"><i class="bi bi-tag"></i> ${mediaType}</span>
                                <span class="ms-2"><i class="bi bi-collection"></i> ${mediaCount}</span>
                            </small>
                            <div class="mt-1">
                                <small class="text-muted">
                                    <i class="bi bi-heart"></i> ${formatNumber(video.statistics?.digg_count || 0)}
                                    <span class="ms-2"><i class="bi bi-chat"></i> ${formatNumber(video.statistics?.comment_count || 0)}</span>
                                    <span class="ms-2"><i class="bi bi-share"></i> ${formatNumber(video.statistics?.share_count || 0)}</span>
                                </small>
                            </div>
                            ${mediaInfoHtml}
                        </div>
                        <div class="col-md-2">
                            <small class="text-muted">存储: ${storedTime}</small>
                            <div class="mt-1"><small class="text-muted">ID: ${video.aweme_id}</small></div>
                        </div>
                        <div class="col-md-2">
                            <div class="btn-group-vertical btn-group-sm" role="group">
                                <button class="btn btn-outline-info btn-sm" onclick="previewMediaFromStorage('${video.aweme_id}')">
                                    <i class="bi bi-play-circle"></i> 预览
                                </button>
                                <button class="btn btn-outline-primary btn-sm" onclick="showVideoDetailFromStorage('${video.aweme_id}')">
                                    <i class="bi bi-eye"></i> 查看
                                </button>
                                <button class="btn btn-outline-success btn-sm" onclick="downloadVideoFromStorage('${video.aweme_id}')">
                                    <i class="bi bi-download"></i> 下载
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="removeVideoFromStorage('${video.aweme_id}')">
                                    <i class="bi bi-trash"></i> 删除
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function filterStorageVideos() {
    const searchTerm = document.getElementById('storageSearchInput').value.toLowerCase();
    const filterType = document.getElementById('storageFilterType').value;
    const sortBy = document.getElementById('storageSortBy').value;

    let videos = Object.values(VideoStorage.getAllVideos());

    if (searchTerm) {
        videos = videos.filter(video => {
            const desc = (video.desc || '').toLowerCase();
            const author = (video.author?.nickname || '').toLowerCase();
            return desc.includes(searchTerm) || author.includes(searchTerm);
        });
    }

    if (filterType !== 'all') {
        videos = videos.filter(video => {
            const mediaAnalysis = video.media_analysis || {};
            const mediaType = mediaAnalysis.media_type || video.raw_media_type;

            switch (filterType) {
                case 'video': return mediaType === 'video' || mediaAnalysis.has_videos;
                case 'image': return mediaType === 'image' || mediaAnalysis.has_images;
                case 'live_photo': return mediaType === 'live_photo' || (mediaAnalysis.live_photo_urls && mediaAnalysis.live_photo_urls.length > 0);
                case 'mixed': return mediaType === 'mixed' || (mediaAnalysis.has_videos && mediaAnalysis.has_images);
                case 'has_images_field': return mediaAnalysis.has_images_field;
                case 'has_videos_field': return mediaAnalysis.has_videos_field;
                default: return true;
            }
        });
    }

    videos.sort((a, b) => {
        switch (sortBy) {
            case 'stored_desc': return new Date(b.stored_at || 0) - new Date(a.stored_at || 0);
            case 'stored_asc': return new Date(a.stored_at || 0) - new Date(b.stored_at || 0);
            case 'create_desc': return (b.create_time || 0) - (a.create_time || 0);
            case 'create_asc': return (a.create_time || 0) - (b.create_time || 0);
            case 'likes_desc': return (b.statistics?.digg_count || 0) - (a.statistics?.digg_count || 0);
            case 'likes_asc': return (a.statistics?.digg_count || 0) - (b.statistics?.digg_count || 0);
            default: return 0;
        }
    });

    displayStorageVideos(videos);
}

function exportStorageData() {
    try {
        const data = VideoStorage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `douyin_storage_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('存储数据已导出', 'success');
    } catch (error) {
        showToast('导出存储数据失败', 'error');
    }
}

function importStorageData() {
    document.getElementById('importFileInput').click();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            const result = VideoStorage.importData(data);
            showToast(`导入成功: ${result.imported} 个视频`, 'success');
            refreshStorageData();
        } catch (error) {
            showToast('导入失败: 文件格式错误', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function clearStorageData() {
    if (confirm('确定要清空所有存储数据吗？此操作不可恢复！')) {
        try {
            VideoStorage.clear();
            refreshStorageData();
            showToast('存储数据已清空', 'success');
        } catch (error) {
            showToast('清空存储数据失败', 'error');
        }
    }
}

function showVideoDetailFromStorage(awemeId) {
    const video = VideoStorage.getVideo(awemeId);
    if (video) {
        showVideoDetail(awemeId);
        const modal = bootstrap.Modal.getInstance(document.getElementById('storageManageModal'));
        if (modal) modal.hide();
    } else {
        showToast('视频数据不存在', 'error');
    }
}

function downloadVideoFromStorage(awemeId) {
    const video = VideoStorage.getVideo(awemeId);
    if (video && video.media_urls && video.media_urls.length > 0) {
        downloadSingleVideoWithData(awemeId, video.desc || '无描述', video.media_urls, video.raw_media_type || 'video');
    } else {
        showToast('视频数据不完整，无法下载', 'error');
    }
}

function removeVideoFromStorage(awemeId) {
    if (confirm('确定要删除这个视频的存储数据吗？')) {
        try {
            VideoStorage.removeVideo(awemeId);
            filterStorageVideos();
            refreshStorageData();
            showToast('视频数据已删除', 'success');
        } catch (error) {
            showToast('删除视频数据失败', 'error');
        }
    }
}

// ═══════════════════════════════════════════════
// GO TO AUTHOR PAGE
// ═══════════════════════════════════════════════
async function goToAuthorPage(secUid, nickname) {
    if (!secUid) {
        showToast('无法获取作者信息', 'error');
        return;
    }

    hideAllSections();
    updateStatus('running', '获取作者信息中');

    try {
        const response = await fetch('/api/user_detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' })
        });

        const result = await response.json();
        if (result.success) {
            currentUser = result.user;
            showUserDetail(result.user);
            showToast(`已切换到 ${result.user.nickname} 的主页`, 'success');
        } else {
            showToast(result.message || '获取作者信息失败', 'error');
        }
    } catch (error) {
        showToast('获取作者信息失败', 'error');
    } finally {
        updateStatus('ready', '就绪');
    }
}
