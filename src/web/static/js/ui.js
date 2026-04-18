// ═══════════════════════════════════════════════
// DY Downloader — UI Interactions Module
// Theme, Status/Log/Toast, Sections, Verify Dialog,
// Settings drawer, Drag & Drop, Storage Management,
// Media Preview, Immersive Player
// ═══════════════════════════════════════════════

// ── Storage batch selection state ──
let _storageSelectedVideos = new Set();

// ── Immersive Player globals ──
let _playerItems = [];
let _playerIndex = 0;
let _playerTimer = null;
let _playerVideo = null;
let _playerBgmUrl = null;
let _playerBgmAudio = null;
let _playerWorkIndex = -1;
let _playerWheelLock = false;

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════
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

// ═══════════════════════════════════════════════
// STATUS / LOG / TOAST
// ═══════════════════════════════════════════════
function updateStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    indicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
}

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

    // NOTE: log messages are generated internally, not from user input
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

    const maxLogs = 500;
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
    // 检查是否是临时 cookie（未登录）
    const cookieInput = document.getElementById('cookie-input');
    const cookieValue = cookieInput ? cookieInput.value : '';
    const hasLoginCookie = cookieValue.includes('sessionid');

    if (!hasLoginCookie) {
        // 未登录状态，提示可能需要验证
        showToast('临时 Cookie 可能触发验证，建议登录账号以获得更稳定的使用体验', 'warning');
        addLog('提示：使用临时 Cookie 可能会遇到验证。建议登录账号以避免验证。', 'warning');
    } else {
        showToast('正在打开验证浏览器...', 'info');
        addLog('触发滑块验证，正在使用已存储的Cookie打开浏览器...', 'warning');
    }

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
            window.open('https://www.douyin.com/', 'douyin_verify', 'width=1100,height=750,scrollbars=yes');
            showToast('需要滑块验证，请在弹出窗口中完成验证后重试', 'warning');
            addLog('触发滑块验证，请在弹出窗口中完成后重新搜索', 'warning');
        }
    })
    .catch(err => {
        console.error('打开验证浏览器失败:', err);
        // 回退到直接打开
        window.open('https://www.douyin.com/', 'douyin_verify', 'width=1100,height=750,scrollbars=yes');
        showToast('需要滑块验证，请在弹出窗口中完成验证后重试', 'warning');
    });
}

// ═══════════════════════════════════════════════
// SETTINGS DRAWER
// ═══════════════════════════════════════════════
function closeSettingsDrawer() {
    document.getElementById('settings-drawer').classList.remove('open');
    document.getElementById('settings-overlay').classList.remove('open');
}

function toggleBottomBar() {
    var bottomBar = document.getElementById('bottom-bar');
    var overlay = document.getElementById('bottom-bar-overlay');
    var isExpanded = bottomBar.classList.toggle('expanded');
    if (isExpanded) {
        overlay.classList.add('open');
    } else {
        overlay.classList.remove('open');
    }
}

function closeBottomBar() {
    document.getElementById('bottom-bar').classList.remove('expanded');
    document.getElementById('bottom-bar-overlay').classList.remove('open');
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
    _storageSelectedVideos.clear();

    if (!videos || videos.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-database"></i><p>暂无存储数据</p></div>';
        return;
    }

    // Batch toolbar
    const batchToolbar = `
        <div class="d-flex align-items-center mb-2 gap-2" id="storageBatchToolbar">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="storageSelectAll" onchange="toggleStorageSelectAll()">
                <label class="form-check-label" for="storageSelectAll">全选</label>
            </div>
            <button class="btn btn-outline-danger btn-sm" id="storageBatchDeleteBtn" onclick="deleteSelectedStorageVideos()" disabled>
                <i class="bi bi-trash"></i> 删除选中 (<span id="storageSelectedCount">0</span>)
            </button>
        </div>
    `;

    const cards = videos.map(video => {
        const createTime = video.create_time ? new Date(video.create_time * 1000).toLocaleDateString() : '-';
        const storedTime = video.stored_at ? new Date(video.stored_at).toLocaleString() : '-';
        const mediaAnalysis = video.media_analysis || {};
        const mediaType = getMediaTypeDisplay(mediaAnalysis.media_type || video.raw_media_type || 'unknown');
        const mediaCount = mediaAnalysis.media_count || 0;

        const mediaInfo = [];
        if (mediaAnalysis.has_videos) mediaInfo.push('<span class="badge bg-primary me-1">视频</span>');
        if (mediaAnalysis.has_images) mediaInfo.push('<span class="badge bg-info me-1">图片</span>');
        if (mediaAnalysis.live_photo_urls && mediaAnalysis.live_photo_urls.length > 0) {
            mediaInfo.push('<span class="badge bg-warning me-1">Live Photo(' + mediaAnalysis.live_photo_urls.length + ')</span>');
        }
        const mediaInfoHtml = mediaInfo.length > 0 ? '<div class="mt-1">' + mediaInfo.join('') + '</div>' : '';

        const safeDesc = escapeHtml(video.desc || '无描述');
        const safeAuthor = escapeHtml(video.author?.nickname || '未知作者');
        const coverSrc = escapeHtml(video.cover || video.cover_url || '/static/placeholder.jpg');
        const aid = escapeHtml(video.aweme_id);

        return '<div class="card mb-2" id="storage-card-' + aid + '">'
            + '<div class="card-body p-3">'
            + '<div class="row align-items-center">'
            + '<div class="col-auto">'
            + '<div class="form-check">'
            + '<input class="form-check-input storage-video-checkbox" type="checkbox"'
            + ' data-aweme-id="' + aid + '"'
            + ' id="storage-cb-' + aid + '"'
            + ' onchange="toggleStorageSelect(\'' + aid + '\')">'
            + '</div></div>'
            + '<div class="col-md-2">'
            + '<img src="' + coverSrc + '"'
            + ' class="img-thumbnail" style="width: 80px; height: 80px; object-fit: cover;" alt="封面">'
            + '</div>'
            + '<div class="col-md-5">'
            + '<h6 class="mb-1">' + safeDesc + '</h6>'
            + '<small class="text-muted">'
            + '<i class="bi bi-person"></i> ' + safeAuthor
            + ' <span class="ms-2"><i class="bi bi-calendar"></i> ' + createTime + '</span>'
            + ' <span class="ms-2"><i class="bi bi-tag"></i> ' + mediaType + '</span>'
            + ' <span class="ms-2"><i class="bi bi-collection"></i> ' + mediaCount + '</span>'
            + '</small>'
            + '<div class="mt-1"><small class="text-muted">'
            + '<i class="bi bi-heart"></i> ' + formatNumber(video.statistics?.digg_count || 0)
            + ' <span class="ms-2"><i class="bi bi-chat"></i> ' + formatNumber(video.statistics?.comment_count || 0) + '</span>'
            + ' <span class="ms-2"><i class="bi bi-share"></i> ' + formatNumber(video.statistics?.share_count || 0) + '</span>'
            + '</small></div>'
            + mediaInfoHtml
            + '</div>'
            + '<div class="col-md-2">'
            + '<small class="text-muted">存储: ' + storedTime + '</small>'
            + '<div class="mt-1"><small class="text-muted">ID: ' + aid + '</small></div>'
            + '</div>'
            + '<div class="col-md-2">'
            + '<div class="btn-group-vertical btn-group-sm" role="group">'
            + '<button class="btn btn-outline-info btn-sm" onclick="previewMediaFromStorage(\'' + aid + '\')">'
            + '<i class="bi bi-play-circle"></i> 预览</button>'
            + '<button class="btn btn-outline-primary btn-sm" onclick="showVideoDetailFromStorage(\'' + aid + '\')">'
            + '<i class="bi bi-eye"></i> 查看</button>'
            + '<button class="btn btn-outline-success btn-sm" onclick="downloadVideoFromStorage(\'' + aid + '\')">'
            + '<i class="bi bi-download"></i> 下载</button>'
            + '<button class="btn btn-outline-danger btn-sm" onclick="removeVideoFromStorage(\'' + aid + '\')">'
            + '<i class="bi bi-trash"></i> 删除</button>'
            + '</div></div>'
            + '</div></div></div>';
    }).join('');

    container.innerHTML = batchToolbar + cards;
}

function toggleStorageSelect(awemeId) {
    if (_storageSelectedVideos.has(awemeId)) {
        _storageSelectedVideos.delete(awemeId);
    } else {
        _storageSelectedVideos.add(awemeId);
    }
    _updateStorageBatchUI();
}

function toggleStorageSelectAll() {
    const allCheckbox = document.getElementById('storageSelectAll');
    const checkboxes = document.querySelectorAll('.storage-video-checkbox');

    if (allCheckbox && allCheckbox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            _storageSelectedVideos.add(cb.dataset.awemeId);
        });
    } else {
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        _storageSelectedVideos.clear();
    }
    _updateStorageBatchUI();
}

function deleteSelectedStorageVideos() {
    if (_storageSelectedVideos.size === 0) return;
    if (!confirm('确定要删除选中的 ' + _storageSelectedVideos.size + ' 个视频吗？此操作不可恢复！')) return;

    try {
        for (const awemeId of _storageSelectedVideos) {
            VideoStorage.removeVideo(awemeId);
        }
        showToast('已删除 ' + _storageSelectedVideos.size + ' 个视频', 'success');
        _storageSelectedVideos.clear();
        refreshStorageData();
    } catch (error) {
        showToast('批量删除失败', 'error');
    }
}

function _updateStorageBatchUI() {
    const countEl = document.getElementById('storageSelectedCount');
    const deleteBtn = document.getElementById('storageBatchDeleteBtn');
    const selectAllCb = document.getElementById('storageSelectAll');

    if (countEl) countEl.textContent = _storageSelectedVideos.size;
    if (deleteBtn) deleteBtn.disabled = _storageSelectedVideos.size === 0;

    // Sync select-all checkbox state
    if (selectAllCb) {
        const allCheckboxes = document.querySelectorAll('.storage-video-checkbox');
        selectAllCb.checked = allCheckboxes.length > 0 && _storageSelectedVideos.size === allCheckboxes.length;
    }
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
        a.download = 'douyin_storage_' + new Date().toISOString().split('T')[0] + '.json';
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
            showToast('导入成功: ' + result.imported + ' 个视频', 'success');
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
// MEDIA PREVIEW
// ═══════════════════════════════════════════════
function setupMediaPreview(video) {
    const previewContainer = document.getElementById('videoDetailMediaPreview');

    if (!video.media_urls || video.media_urls.length === 0) {
        previewContainer.textContent = '暂无媒体内容';
        return;
    }

    previewContainer.innerHTML = '';

    video.media_urls.forEach((media, index) => {
        const mediaType = media.type || 'unknown';
        const mediaUrl = proxyUrl(media.url || '');
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'd-flex justify-content-between align-items-center mb-2';

        const badge = document.createElement('span');
        const label = document.createElement('small');
        label.className = 'text-muted';
        label.textContent = '媒体 ' + (index + 1);

        if (mediaType === 'video' || mediaType === 'live_photo') {
            badge.className = 'badge bg-primary';
            badge.textContent = mediaType === 'live_photo' ? 'Live Photo' : '视频';
            headerDiv.appendChild(badge);
            headerDiv.appendChild(label);
            wrapper.appendChild(headerDiv);

            const videoEl = document.createElement('video');
            videoEl.controls = true;
            videoEl.className = 'w-100';
            videoEl.style.maxHeight = '300px';
            videoEl.style.borderRadius = '8px';
            const source = document.createElement('source');
            source.src = mediaUrl;
            source.type = 'video/mp4';
            videoEl.appendChild(source);
            wrapper.appendChild(videoEl);
        } else if (mediaType === 'image') {
            badge.className = 'badge bg-success';
            badge.textContent = '图片';
            headerDiv.appendChild(badge);
            headerDiv.appendChild(label);
            wrapper.appendChild(headerDiv);

            const img = document.createElement('img');
            img.src = mediaUrl;
            img.className = 'w-100';
            img.style.maxHeight = '300px';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '8px';
            img.style.cursor = 'pointer';
            img.onerror = function() { this.style.display = 'none'; };
            wrapper.appendChild(img);
        } else {
            badge.className = 'badge bg-secondary';
            badge.textContent = '未知类型';
            headerDiv.appendChild(badge);
            headerDiv.appendChild(label);
            wrapper.appendChild(headerDiv);

            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-info';
            const icon = document.createElement('i');
            icon.className = 'bi bi-file-earmark';
            alertDiv.appendChild(icon);
            alertDiv.appendChild(document.createTextNode(' 无法预览此媒体类型'));
            alertDiv.appendChild(document.createElement('br'));
            const link = document.createElement('a');
            link.href = mediaUrl;
            link.target = '_blank';
            link.className = 'btn btn-sm btn-outline-primary mt-2';
            link.textContent = '在新窗口中打开';
            alertDiv.appendChild(link);
            wrapper.appendChild(alertDiv);
        }

        previewContainer.appendChild(wrapper);
    });
}

function openImageModal(imageUrl) {
    let imageModal = document.getElementById('imageModal');
    if (!imageModal) {
        imageModal = document.createElement('div');
        imageModal.className = 'modal fade';
        imageModal.id = 'imageModal';
        imageModal.tabIndex = -1;

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog modal-lg modal-dialog-centered';
        const content = document.createElement('div');
        content.className = 'modal-content';

        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h5');
        title.className = 'modal-title';
        title.textContent = '图片预览';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'modal');
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body text-center';
        const img = document.createElement('img');
        img.id = 'modalImage';
        img.className = 'img-fluid';
        img.style.maxHeight = '70vh';
        body.appendChild(img);

        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const downloadLink = document.createElement('a');
        downloadLink.id = 'modalImageDownload';
        downloadLink.target = '_blank';
        downloadLink.className = 'btn btn-primary';
        downloadLink.textContent = '在新窗口中打开';
        const closeBtn2 = document.createElement('button');
        closeBtn2.type = 'button';
        closeBtn2.className = 'btn btn-secondary';
        closeBtn2.setAttribute('data-bs-dismiss', 'modal');
        closeBtn2.textContent = '关闭';
        footer.appendChild(downloadLink);
        footer.appendChild(closeBtn2);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        dialog.appendChild(content);
        imageModal.appendChild(dialog);
        document.body.appendChild(imageModal);
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

    clearMediaState();

    if (video.media_urls && video.media_urls.length > 0) {
        mediaControls.style.display = 'block';

        const hasVideo = video.media_urls.some(media => media.type === 'video');
        const hasImages = video.media_urls.some(media => media.type === 'image' || media.type === 'live_photo');

        if (hasVideo) {
            const videoUrl = video.media_urls.find(media => media.type === 'video')?.url;
            if (videoUrl) {
                videoPlayer.src = proxyUrl(videoUrl);
                showVideoBtn.style.display = 'inline-block';
            }
        }

        if (hasImages) {
            setupImageCarousel(video.media_urls.filter(media => media.type === 'image' || media.type === 'live_photo'));
            showImagesBtn.style.display = 'inline-block';
        }

        // Auto-show the most relevant media
        if (hasImages && !hasVideo) {
            showImages();
        } else if (hasVideo) {
            showVideo();
        } else {
            showCover();
        }
    } else {
        mediaControls.style.display = 'none';
        document.getElementById('videoDetailCover').style.display = 'block';
    }
}

function setupImageCarousel(imageMedias) {
    const carouselInner = document.getElementById('carouselInner');
    const carouselIndicators = document.getElementById('carouselIndicators');

    carouselInner.innerHTML = '';
    carouselIndicators.innerHTML = '';

    imageMedias.forEach((media, index) => {
        const carouselItem = document.createElement('div');
        carouselItem.className = 'carousel-item' + (index === 0 ? ' active' : '');

        if (media.type === 'live_photo') {
            const video = document.createElement('video');
            video.className = 'd-block w-100 rounded';
            video.controls = true;
            const source = document.createElement('source');
            source.src = proxyUrl(media.url);
            source.type = 'video/mp4';
            video.appendChild(source);
            carouselItem.appendChild(video);

            const caption = document.createElement('div');
            caption.className = 'carousel-caption d-none d-md-block';
            const badge = document.createElement('span');
            badge.className = 'badge bg-primary';
            badge.textContent = 'Live Photo';
            caption.appendChild(badge);
            carouselItem.appendChild(caption);
        } else {
            const img = document.createElement('img');
            img.src = proxyUrl(media.url);
            img.className = 'd-block w-100 rounded';
            img.alt = '图片 ' + (index + 1);
            carouselItem.appendChild(img);

            const caption = document.createElement('div');
            caption.className = 'carousel-caption d-none d-md-block';
            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary';
            badge.textContent = '图片 ' + (index + 1);
            caption.appendChild(badge);
            carouselItem.appendChild(caption);
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
        indicator.setAttribute('aria-label', 'Slide ' + (index + 1));
        carouselIndicators.appendChild(indicator);
    });
}

function resetMediaDisplay() {
    document.getElementById('videoDetailCover').style.display = 'none';
    document.getElementById('videoDetailPlayer').style.display = 'none';
    document.getElementById('imageCarousel').style.display = 'none';
    document.querySelectorAll('#mediaControls .btn').forEach(btn => btn.classList.remove('active'));
}

function clearMediaState() {
    resetMediaDisplay();
    const player = document.getElementById('videoDetailPlayer');
    player.pause();
    player.removeAttribute('src');
    player.load();
    document.getElementById('carouselInner').textContent = '';
    document.getElementById('carouselIndicators').textContent = '';
    document.getElementById('showVideoBtn').style.display = 'none';
    document.getElementById('showImagesBtn').style.display = 'none';
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
        video.media_urls.forEach((media, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'mb-3';

            const heading = document.createElement('h6');

            switch (media.type) {
                case 'video':
                    heading.textContent = '视频 ' + (index + 1);
                    wrapper.appendChild(heading);
                    const vid = document.createElement('video');
                    vid.className = 'w-100 rounded';
                    vid.controls = true;
                    vid.style.maxHeight = '400px';
                    const src = document.createElement('source');
                    src.src = media.url;
                    src.type = 'video/mp4';
                    vid.appendChild(src);
                    wrapper.appendChild(vid);
                    break;
                case 'live_photo':
                    heading.textContent = 'Live Photo ' + (index + 1);
                    wrapper.appendChild(heading);
                    const lp = document.createElement('video');
                    lp.className = 'w-100 rounded';
                    lp.controls = true;
                    lp.style.maxHeight = '400px';
                    const lpSrc = document.createElement('source');
                    lpSrc.src = media.url;
                    lpSrc.type = 'video/mp4';
                    lp.appendChild(lpSrc);
                    wrapper.appendChild(lp);
                    break;
                case 'image':
                    heading.textContent = '图片 ' + (index + 1);
                    wrapper.appendChild(heading);
                    const img = document.createElement('img');
                    img.src = media.url;
                    img.className = 'w-100 rounded';
                    img.style.maxHeight = '400px';
                    img.style.objectFit = 'contain';
                    img.style.cursor = 'pointer';
                    img.onclick = function() { openImageModal(media.url); };
                    wrapper.appendChild(img);
                    break;
                default:
                    heading.textContent = '未知类型 ' + (index + 1);
                    wrapper.appendChild(heading);
                    const link = document.createElement('a');
                    link.href = media.url;
                    link.target = '_blank';
                    link.className = 'btn btn-outline-primary btn-sm';
                    const linkIcon = document.createElement('i');
                    linkIcon.className = 'bi bi-box-arrow-up-right';
                    link.appendChild(linkIcon);
                    link.appendChild(document.createTextNode(' 打开'));
                    wrapper.appendChild(link);
                    break;
            }

            mediaPreviewContainer.appendChild(wrapper);
        });
    } else {
        const p = document.createElement('p');
        p.className = 'text-muted text-center';
        p.textContent = '没有可预览的媒体内容';
        mediaPreviewContainer.appendChild(p);
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

function _resolvePlayerBgmUrl(video) {
    return video?.music || video?.bgm_url || null;
}

function _shouldUseSeparateBgm(item) {
    return item && (item.type === 'image' || item.type === 'live_photo');
}

function _startPlayerBgm() {
    if (!_playerBgmUrl) return;
    if (!_playerBgmAudio) {
        _playerBgmAudio = new Audio(proxyUrl(_playerBgmUrl));
        _playerBgmAudio.loop = true;
    }
    _playerBgmAudio.play().catch(() => {});
}

function _setPlayerPlayButtonState(isPlaying) {
    const playBtn = document.getElementById('ip-play');
    if (!playBtn) return;

    playBtn.innerHTML = '';
    const icon = document.createElement('i');
    icon.className = isPlaying ? 'bi bi-pause-fill' : 'bi bi-play-fill';
    playBtn.appendChild(icon);
}

function _advancePlayerSequence() {
    if (_playerItems.length > 1) {
        if (_playerIndex < _playerItems.length - 1) {
            playerNext();
        } else {
            _playerIndex = 0;
            _renderPlayerItem();
            _playerAnimate('slide-left');
        }
        return;
    }

    if (_playerTimer) {
        clearInterval(_playerTimer);
        _playerTimer = null;
    }
    if (_playerBgmAudio) {
        _playerBgmAudio.pause();
    }
    _setPlayerPlayButtonState(false);
}

// ═══════════════════════════════════════════════
// IMMERSIVE PLAYER
// ═══════════════════════════════════════════════
function openImmersivePlayer(video) {
    if (!video || !video.media_urls || video.media_urls.length === 0) {
        showToast('没有可播放的媒体', 'warning');
        return;
    }

    // 提取 BGM 信息
    _playerBgmUrl = _resolvePlayerBgmUrl(video);

    _playerItems = video.media_urls.map(m => ({
        type: m.type || 'unknown',
        url: m.url,
        proxy: proxyUrl(m.url)
    }));
    _playerIndex = 0;

    // 记住当前作品在列表中的位置
    _playerWorkIndex = -1;
    if (window.currentVideos && video.aweme_id) {
        _playerWorkIndex = window.currentVideos.findIndex(v => v.aweme_id === video.aweme_id);
    }

    const overlay = document.createElement('div');
    overlay.id = 'immersive-player';

    const backdrop = document.createElement('div');
    backdrop.className = 'ip-backdrop';
    backdrop.onclick = closeImmersivePlayer;

    const container = document.createElement('div');
    container.className = 'ip-container';

    // Header
    const ipHeader = document.createElement('div');
    ipHeader.className = 'ip-header';

    const ipTitle = document.createElement('span');
    ipTitle.className = 'ip-title';
    ipTitle.textContent = video.desc || '媒体播放';

    const ipCounter = document.createElement('span');
    ipCounter.className = 'ip-counter';
    ipCounter.id = 'ip-counter';
    ipCounter.textContent = '1 / ' + _playerItems.length;

    const ipCloseBtn = document.createElement('button');
    ipCloseBtn.className = 'ip-close';
    ipCloseBtn.onclick = closeImmersivePlayer;
    const closeIcon = document.createElement('i');
    closeIcon.className = 'bi bi-x-lg';
    ipCloseBtn.appendChild(closeIcon);

    ipHeader.appendChild(ipTitle);
    ipHeader.appendChild(ipCounter);
    ipHeader.appendChild(ipCloseBtn);

    // Media area
    const ipMedia = document.createElement('div');
    ipMedia.className = 'ip-media';
    ipMedia.id = 'ip-media';
    ipMedia.onclick = playerTogglePlay;

    // Overlay controls
    const overlayControls = document.createElement('div');
    overlayControls.className = 'ip-overlay-controls';

    const controls = document.createElement('div');
    controls.className = 'ip-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'ip-btn';
    prevBtn.id = 'ip-prev';
    prevBtn.onclick = function(e) { e.stopPropagation(); playerPrev(); };
    const prevIcon = document.createElement('i');
    prevIcon.className = 'bi bi-chevron-left';
    prevBtn.appendChild(prevIcon);

    const playBtn = document.createElement('button');
    playBtn.className = 'ip-btn ip-play-btn';
    playBtn.id = 'ip-play';
    playBtn.onclick = function(e) { e.stopPropagation(); playerTogglePlay(); };
    const playIcon = document.createElement('i');
    playIcon.className = 'bi bi-play-fill';
    playBtn.appendChild(playIcon);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'ip-btn';
    nextBtn.id = 'ip-next';
    nextBtn.onclick = function(e) { e.stopPropagation(); playerNext(); };
    const nextIcon = document.createElement('i');
    nextIcon.className = 'bi bi-chevron-right';
    nextBtn.appendChild(nextIcon);

    controls.appendChild(prevBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextBtn);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'ip-progress-track';
    progressTrack.onclick = function(e) { e.stopPropagation(); playerSeek(e); };

    const progressBar = document.createElement('div');
    progressBar.className = 'ip-progress-bar';
    progressBar.id = 'ip-progress';
    progressTrack.appendChild(progressBar);

    overlayControls.appendChild(controls);
    overlayControls.appendChild(progressTrack);

    container.appendChild(ipHeader);
    container.appendChild(ipMedia);
    container.appendChild(overlayControls);

    overlay.appendChild(backdrop);
    overlay.appendChild(container);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', _playerKeyHandler);
    overlay.addEventListener('wheel', _playerWheelHandler, { passive: false });
    _renderPlayerItem();
}

function _playerWheelHandler(e) {
    e.preventDefault();
    if (_playerWheelLock) return;
    _playerWheelLock = true;
    if (e.deltaY > 0) playerWorkNext();
    else if (e.deltaY < 0) playerWorkPrev();
    setTimeout(() => { _playerWheelLock = false; }, 300);
}

function _playerKeyHandler(e) {
    if (e.key === 'Escape') closeImmersivePlayer();
    if (e.key === 'ArrowLeft') { e.preventDefault(); playerPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); playerNext(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); playerWorkPrev(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); playerWorkNext(); }
    if (e.key === ' ') { e.preventDefault(); playerTogglePlay(); }
}

function closeImmersivePlayer() {
    if (_playerTimer) clearInterval(_playerTimer);
    if (_playerVideo) { _playerVideo.pause(); _playerVideo = null; }
    // 停止 BGM
    if (_playerBgmAudio) {
        _playerBgmAudio.pause();
        _playerBgmAudio = null;
    }
    const el = document.getElementById('immersive-player');
    if (el) el.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _playerKeyHandler);
    const ipEl = document.getElementById('immersive-player');
    if (ipEl) ipEl.removeEventListener('wheel', _playerWheelHandler);
}

function _renderPlayerItem() {
    if (_playerTimer) clearInterval(_playerTimer);
    const container = document.getElementById('ip-media');
    const counter = document.getElementById('ip-counter');
    const progress = document.getElementById('ip-progress');
    const playBtn = document.getElementById('ip-play');
    if (!container) return;

    const item = _playerItems[_playerIndex];
    counter.textContent = (_playerIndex + 1) + ' / ' + _playerItems.length;
    progress.style.width = '0%';

    if (item.type === 'video' || item.type === 'live_photo') {
        if (_playerBgmAudio && !_shouldUseSeparateBgm(item)) {
            _playerBgmAudio.pause();
        }

        const videoEl = document.createElement('video');
        videoEl.id = 'ip-video';
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.src = item.proxy;
        container.innerHTML = '';
        container.appendChild(videoEl);

        _playerVideo = videoEl;
        _setPlayerPlayButtonState(true);

        _playerVideo.ontimeupdate = () => {
            if (_playerVideo.duration) {
                progress.style.width = (_playerVideo.currentTime / _playerVideo.duration * 100) + '%';
            }
        };
        _playerVideo.onplay = () => _setPlayerPlayButtonState(true);
        _playerVideo.onpause = () => _setPlayerPlayButtonState(false);
        _playerVideo.onended = () => {
            _advancePlayerSequence();
        };
        _playerVideo.onerror = () => {
            container.innerHTML = '';
            _setPlayerPlayButtonState(false);
            const errDiv = document.createElement('div');
            errDiv.className = 'ip-error';
            const errIcon = document.createElement('i');
            errIcon.className = 'bi bi-exclamation-triangle';
            const errP = document.createElement('p');
            errP.textContent = '视频加载失败';
            const errLink = document.createElement('a');
            errLink.href = item.url;
            errLink.target = '_blank';
            errLink.className = 'btn btn-sm btn-outline-light mt-2';
            errLink.textContent = '在新窗口打开';
            errDiv.appendChild(errIcon);
            errDiv.appendChild(errP);
            errDiv.appendChild(errLink);
            container.appendChild(errDiv);
        };

        if (_shouldUseSeparateBgm(item)) {
            _startPlayerBgm();
        }
    } else if (item.type === 'image') {
        if (_playerBgmAudio && !_shouldUseSeparateBgm(item)) {
            _playerBgmAudio.pause();
        }

        const img = document.createElement('img');
        img.src = item.proxy;
        img.alt = '图片';
        img.onerror = function() { this.src = item.url; };
        container.innerHTML = '';
        container.appendChild(img);

        _playerVideo = null;
        _startPlayerBgm();
        _setPlayerPlayButtonState(true);

        let elapsed = 0;
        _playerTimer = setInterval(() => {
            elapsed += 50;
            progress.style.width = (elapsed / 3000 * 100) + '%';
            if (elapsed >= 3000) {
                _advancePlayerSequence();
            }
        }, 50);
    } else {
        container.innerHTML = '';
        _setPlayerPlayButtonState(false);
        const errDiv = document.createElement('div');
        errDiv.className = 'ip-error';
        const errP = document.createElement('p');
        errP.textContent = '不支持的媒体类型: ' + item.type;
        errDiv.appendChild(errP);
        container.appendChild(errDiv);
    }
}

function _playerAnimate(dir) {
    const el = document.getElementById('ip-media');
    if (!el) return;
    el.classList.remove('ip-slide-up', 'ip-slide-down', 'ip-slide-left', 'ip-slide-right');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('ip-' + dir);
    el.addEventListener('animationend', () => el.classList.remove('ip-' + dir), { once: true });
}

function playerNext() {
    if (_playerIndex < _playerItems.length - 1) {
        _playerIndex++;
        _renderPlayerItem();
        _playerAnimate('slide-left');
    }
}

function playerPrev() {
    if (_playerIndex > 0) {
        _playerIndex--;
        _renderPlayerItem();
        _playerAnimate('slide-right');
    }
}

function _switchToWork(newIndex) {
    if (!window.currentVideos || newIndex < 0 || newIndex >= window.currentVideos.length) return;
    const video = window.currentVideos[newIndex];
    if (!video || !video.media_urls || video.media_urls.length === 0) return;

    // 停止当前播放
    if (_playerTimer) { clearInterval(_playerTimer); _playerTimer = null; }
    if (_playerVideo) { _playerVideo.pause(); _playerVideo = null; }
    if (_playerBgmAudio) { _playerBgmAudio.pause(); _playerBgmAudio = null; }

    // 更新作品状态
    _playerWorkIndex = newIndex;
    _playerBgmUrl = _resolvePlayerBgmUrl(video);
    _playerItems = video.media_urls.map(m => ({
        type: m.type || 'unknown',
        url: m.url,
        proxy: proxyUrl(m.url)
    }));
    _playerIndex = 0;

    // 更新标题
    const titleEl = document.querySelector('.ip-title');
    if (titleEl) titleEl.textContent = video.desc || '媒体播放';

    _renderPlayerItem();
}

function playerWorkNext() {
    if (_playerWorkIndex >= 0 && _playerWorkIndex < (window.currentVideos?.length || 0) - 1) {
        _switchToWork(_playerWorkIndex + 1);
        _playerAnimate('slide-up');
    }
}

function playerWorkPrev() {
    if (_playerWorkIndex > 0) {
        _switchToWork(_playerWorkIndex - 1);
        _playerAnimate('slide-down');
    }
}

function playerTogglePlay() {
    if (_playerVideo) {
        if (_playerVideo.paused) {
            _playerVideo.play();
            if (_playerBgmAudio) _playerBgmAudio.play().catch(() => {});
            _setPlayerPlayButtonState(true);
        } else {
            _playerVideo.pause();
            if (_playerBgmAudio) _playerBgmAudio.pause();
            _setPlayerPlayButtonState(false);
        }
    } else {
        if (_playerTimer) {
            clearInterval(_playerTimer);
            _playerTimer = null;
            if (_playerBgmAudio) _playerBgmAudio.pause();
            _setPlayerPlayButtonState(false);
        } else {
            if (_playerBgmAudio) _playerBgmAudio.play().catch(() => {});
            _setPlayerPlayButtonState(true);
            let elapsed = 0;
            const progress = document.getElementById('ip-progress');
            _playerTimer = setInterval(() => {
                elapsed += 50;
                if (progress) progress.style.width = (elapsed / 3000 * 100) + '%';
                if (elapsed >= 3000) {
                    _advancePlayerSequence();
                }
            }, 50);
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
// DEBOUNCED FILTER
// ═══════════════════════════════════════════════
const debouncedFilterStorageVideos = debounce(filterStorageVideos, 300);
