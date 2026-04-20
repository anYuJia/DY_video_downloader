// ═══════════════════════════════════════════════
// MY DOWNLOADS - 我的下载 (主界面模式)
// ═══════════════════════════════════════════════

let _myDownloadsItems = [];
let _myDownloadsFiltered = [];
let _myDownloadsSelected = new Set();
let _myDownloadsRoot = '';

document.addEventListener('DOMContentLoaded', function () {
    initMyDownloadsUI();
});

function initMyDownloadsUI() {
    const openBtn = document.getElementById('download-history-btn');
    if (openBtn) openBtn.addEventListener('click', showMyDownloads);
}

// 显示我的下载主界面
function showMyDownloads() {
    // 隐藏所有区域
    const sections = [
        'emptyState', 'userDetailSection', 'userVideosSection',
        'likedVideosSection', 'likedAuthorsSection', 'linkParseResult',
        'recommendedFeedSection'
    ];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 显示我的下载区域
    const section = document.getElementById('myDownloadsSection');
    if (section) section.style.display = 'block';

    // 显示返回按钮
    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.style.display = 'flex';

    // 加载数据
    refreshMyDownloads();
}

// 关闭我的下载
function closeMyDownloads() {
    goBackToHome();
}

// 刷新我的下载
async function refreshMyDownloads() {
    const list = document.getElementById('myDownloadsList');
    const stats = document.getElementById('myDownloadsStats');

    if (!list) return;

    list.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border spinner-border-sm me-2" role="status"></div>正在加载...</div>';

    try {
        const response = await fetch('/api/download_history');
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || '加载失败');
        }

        _myDownloadsItems = Array.isArray(result.items) ? result.items : [];
        _myDownloadsRoot = result.download_root || '';
        _myDownloadsSelected.clear();

        // 更新统计
        const totalSize = _myDownloadsItems.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
        if (stats) {
            stats.innerHTML = `
                <i class="bi bi-folder me-1"></i>
                共 <strong>${_myDownloadsItems.length}</strong> 个文件，
                总计 <strong>${formatBytes(totalSize)}</strong>
                <span class="ms-3 text-muted"><i class="bi bi-folder2-open me-1"></i>${escapeHtml(_myDownloadsRoot || '未设置')}</span>
            `;
        }

        // 更新计数
        const countEl = document.getElementById('myDownloadsCount');
        if (countEl) countEl.textContent = `${_myDownloadsItems.length} 个文件`;

        // 应用筛选
        filterMyDownloads();

    } catch (error) {
        list.innerHTML = `<div class="col-12 text-center py-4 text-danger">
            <i class="bi bi-exclamation-circle me-2"></i>
            ${escapeHtml(error.message || '加载失败')}
        </div>`;
        showToast('加载失败', 'error');
    }
}

// 筛选我的下载
function filterMyDownloads() {
    const searchInput = document.getElementById('myDownloadsSearch');
    const typeFilter = document.getElementById('myDownloadsTypeFilter');
    const sortSelect = document.getElementById('myDownloadsSort');

    const search = (searchInput?.value || '').toLowerCase().trim();
    const type = typeFilter?.value || 'all';
    const sort = sortSelect?.value || 'date_desc';

    // 筛选
    _myDownloadsFiltered = _myDownloadsItems.filter(item => {
        // 搜索
        if (search) {
            const name = (item.name || '').toLowerCase();
            const author = (item.author || '').toLowerCase();
            if (!name.includes(search) && !author.includes(search)) {
                return false;
            }
        }

        // 类型筛选
        if (type !== 'all') {
            const ext = (item.name || '').split('.').pop().toLowerCase();
            const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
            const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg'];

            if (type === 'video' && !videoExts.includes(ext)) return false;
            if (type === 'image' && !imageExts.includes(ext)) return false;
            if (type === 'audio' && !audioExts.includes(ext)) return false;
        }

        return true;
    });

    // 排序
    _myDownloadsFiltered.sort((a, b) => {
        switch (sort) {
            case 'date_desc':
                return (b.modified_at || 0) - (a.modified_at || 0);
            case 'date_asc':
                return (a.modified_at || 0) - (b.modified_at || 0);
            case 'size_desc':
                return (b.size || 0) - (a.size || 0);
            case 'size_asc':
                return (a.size || 0) - (b.size || 0);
            case 'name_asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'name_desc':
                return (b.name || '').localeCompare(a.name || '');
            default:
                return 0;
        }
    });

    renderMyDownloads();
}

// 渲染我的下载
function renderMyDownloads() {
    const list = document.getElementById('myDownloadsList');
    if (!list) return;

    if (!_myDownloadsFiltered.length) {
        list.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-folder2-open" style="font-size: 3rem; opacity: 0.3;"></i>
                <p class="text-muted mt-3 mb-0">还没有下载文件</p>
            </div>
        `;
        updateMyDownloadsBatchUI();
        return;
    }

    list.innerHTML = _myDownloadsFiltered.map((item, index) => {
        const isSelected = _myDownloadsSelected.has(item.path);
        const ext = (item.name || '').split('.').pop().toLowerCase();
        const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

        let icon = 'bi-file-earmark';
        let iconColor = 'var(--text-muted)';
        if (videoExts.includes(ext)) {
            icon = 'bi-play-circle-fill';
            iconColor = 'var(--accent)';
        } else if (imageExts.includes(ext)) {
            icon = 'bi-image-fill';
            iconColor = 'var(--success)';
        } else if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) {
            icon = 'bi-music-note-beamed';
            iconColor = 'var(--info)';
        }

        return `
            <div class="col-md-4 col-lg-3">
                <div class="card h-100 my-downloads-card ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(item.path)}">
                    <div class="card-body p-3">
                        <div class="form-check position-absolute" style="top: 8px; left: 8px;">
                            <input class="form-check-input" type="checkbox" ${isSelected ? 'checked' : ''}
                                   onchange="toggleMyDownloadsItemSelection('${encodeURIComponent(item.path)}')">
                        </div>
                        <div class="d-flex align-items-start mb-2" style="padding-left: 20px;">
                            <i class="bi ${icon} me-2" style="font-size: 1.5rem; color: ${iconColor};"></i>
                            <div class="flex-grow-1 min-width-0">
                                <div class="fw-semibold text-truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                                <small class="text-muted">${escapeHtml(item.author || '未知')}</small>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center small text-muted mb-2">
                            <span>${formatBytes(Number(item.size) || 0)}</span>
                            <span>${formatTime(item.modified_at || 0)}</span>
                        </div>
                        <div class="btn-group w-100">
                            <button class="btn btn-sm btn-outline-primary" onclick="openMyDownloadsFile('${encodeURIComponent(item.path)}')">
                                <i class="bi bi-play-circle"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="openMyDownloadsLocation('${encodeURIComponent(item.path)}')">
                                <i class="bi bi-folder2-open"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteMyDownloadsFile('${encodeURIComponent(item.path)}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateMyDownloadsBatchUI();
}

// 更新批量操作 UI
function updateMyDownloadsBatchUI() {
    const selectAll = document.getElementById('myDownloadsSelectAll');
    const batchOpenBtn = document.getElementById('myDownloadsBatchOpenBtn');
    const batchDeleteBtn = document.getElementById('myDownloadsBatchDeleteBtn');

    const selectedCount = _myDownloadsSelected.size;
    const totalCount = _myDownloadsFiltered.length;

    if (selectAll) {
        selectAll.checked = totalCount > 0 && selectedCount === totalCount;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }
    if (batchOpenBtn) batchOpenBtn.disabled = selectedCount === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount === 0;
}

// 切换选择
function toggleMyDownloadsItemSelection(encodedPath) {
    const path = decodeURIComponent(encodedPath);
    if (_myDownloadsSelected.has(path)) {
        _myDownloadsSelected.delete(path);
    } else {
        _myDownloadsSelected.add(path);
    }
    renderMyDownloads();
}

// 全选/取消全选
function toggleMyDownloadsSelectAll() {
    const selectAll = document.getElementById('myDownloadsSelectAll');
    if (!selectAll) return;

    if (selectAll.checked) {
        _myDownloadsSelected = new Set(_myDownloadsFiltered.map(item => item.path));
    } else {
        _myDownloadsSelected.clear();
    }
    renderMyDownloads();
}

// 打开文件
async function openMyDownloadsFile(encodedPath) {
    const path = decodeURIComponent(encodedPath);
    try {
        const response = await fetch('/api/download_history/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '打开失败');
        }
        showToast('文件已打开', 'success');
    } catch (error) {
        showToast(error.message || '打开失败', 'error');
    }
}

// 打开文件位置
async function openMyDownloadsLocation(encodedPath) {
    const path = decodeURIComponent(encodedPath);
    try {
        const response = await fetch('/api/download_history/open_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '打开失败');
        }
        showToast('已打开文件位置', 'success');
    } catch (error) {
        showToast(error.message || '打开失败', 'error');
    }
}

// 删除文件
async function deleteMyDownloadsFile(encodedPath) {
    const path = decodeURIComponent(encodedPath);
    if (!confirm('确定要删除这个文件吗？')) return;

    try {
        const response = await fetch('/api/download_history/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: [path] })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '删除失败');
        }
        showToast('已删除文件', 'success');
        await refreshMyDownloads();
    } catch (error) {
        showToast(error.message || '删除失败', 'error');
    }
}

// 批量打开
async function batchOpenMyDownloads() {
    const selected = Array.from(_myDownloadsSelected);
    if (!selected.length) return;

    let successCount = 0;
    for (const path of selected) {
        try {
            const response = await fetch('/api/download_history/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path })
            });
            const result = await response.json();
            if (result.success) successCount++;
        } catch (e) {}
    }
    showToast(`已打开 ${successCount} 个文件`, 'success');
}

// 批量删除
async function batchDeleteMyDownloads() {
    const selected = Array.from(_myDownloadsSelected);
    if (!selected.length) return;

    if (!confirm(`确定要删除选中的 ${selected.length} 个文件吗？`)) return;

    try {
        const response = await fetch('/api/download_history/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: selected })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '删除失败');
        }
        showToast(`已删除 ${result.deleted_count || selected.length} 个文件`, 'success');
        await refreshMyDownloads();
    } catch (error) {
        showToast(error.message || '删除失败', 'error');
    }
}

// 工具函数
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 添加卡片样式
const style = document.createElement('style');
style.textContent = `
    .my-downloads-card {
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .my-downloads-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .my-downloads-card.selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent);
    }
    .min-width-0 {
        min-width: 0;
    }
`;
document.head.appendChild(style);
