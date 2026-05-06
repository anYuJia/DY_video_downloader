// ═══════════════════════════════════════════════
// MY DOWNLOADS - 我的下载 (主界面模式)
// ═══════════════════════════════════════════════

let _myDownloadsItems = [];
let _myDownloadsFiltered = [];
let _myDownloadsSelected = new Set();
let _myDownloadsRoot = '';
let _myDownloadsSearchState = {
    raw: '',
    terms: [],
    type: 'all',
    sort: 'date_desc'
};

const MY_DOWNLOADS_TYPE_EXTS = {
    video: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'ogg']
};
const MY_DOWNLOADS_SEARCHABLE_FIELDS = new Set(['author', 'name', 'path', 'ext', 'date', 'type']);

document.addEventListener('DOMContentLoaded', function () {
    initMyDownloadsUI();
});

function initMyDownloadsUI() {
    const openBtn = document.getElementById('download-history-btn');
    if (openBtn) openBtn.addEventListener('click', showMyDownloads);

    const searchInput = document.getElementById('myDownloadsSearch');
    if (searchInput && searchInput.dataset.bound !== 'true') {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && searchInput.value) {
                event.preventDefault();
                clearMyDownloadsSearch();
            }
        });
    }
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
        hideSectionById(id);
    });

    // 显示我的下载区域
    revealSectionById('myDownloadsSection');

    // 显示返回按钮
    setBackButtonVisible(true);

    // 加载数据
    refreshMyDownloads(false);
}

// 关闭我的下载
function closeMyDownloads() {
    goBackToHome();
}

// 刷新我的下载
async function refreshMyDownloads(forceRefresh) {
    const list = document.getElementById('myDownloadsList');

    if (!list) return;

    list.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border spinner-border-sm me-2" role="status"></div>正在加载...</div>';

    try {
        const response = await fetch(forceRefresh ? '/api/download_history?refresh=1' : '/api/download_history');
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || '加载失败');
        }

        _myDownloadsItems = Array.isArray(result.items) ? result.items : [];
        _myDownloadsRoot = result.download_root || '';
        _myDownloadsSelected.clear();

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

function getMyDownloadsFileExt(name) {
    return ((name || '').split('.').pop() || '').toLowerCase();
}

function getMyDownloadsFileType(item) {
    const ext = getMyDownloadsFileExt(item && item.name);
    if (MY_DOWNLOADS_TYPE_EXTS.video.includes(ext)) return 'video';
    if (MY_DOWNLOADS_TYPE_EXTS.image.includes(ext)) return 'image';
    if (MY_DOWNLOADS_TYPE_EXTS.audio.includes(ext)) return 'audio';
    return 'other';
}

function getMyDownloadsRelativePath(item) {
    const fullPath = item && item.path ? String(item.path) : '';
    if (!fullPath) return '';

    const normalizedRoot = (_myDownloadsRoot || '').replace(/[\\/]+$/, '');
    if (normalizedRoot && fullPath.startsWith(normalizedRoot)) {
        return fullPath.slice(normalizedRoot.length).replace(/^[/\\]+/, '');
    }

    return fullPath;
}

function parseMyDownloadsSearchQuery(rawQuery) {
    const normalized = (rawQuery || '').trim().toLowerCase();
    if (!normalized) return [];

    return normalized.split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean)
        .map(token => {
            const separatorIndex = token.indexOf(':');
            if (separatorIndex > 0) {
                const field = token.slice(0, separatorIndex);
                const value = token.slice(separatorIndex + 1).trim();
                if (value && MY_DOWNLOADS_SEARCHABLE_FIELDS.has(field)) {
                    return { field, value };
                }
            }
            return { field: 'any', value: token };
        });
}

function buildMyDownloadsSearchFields(item) {
    const name = String(item.name || '').toLowerCase();
    const author = String(item.author || '').toLowerCase();
    const relativePath = getMyDownloadsRelativePath(item).toLowerCase();
    const fullPath = String(item.path || '').toLowerCase();
    const ext = getMyDownloadsFileExt(item.name);
    const type = getMyDownloadsFileType(item);
    const date = formatTime(item.modified_at || 0).toLowerCase();

    return {
        name,
        author,
        path: relativePath || fullPath,
        fullPath,
        ext,
        type,
        date,
        any: [name, author, relativePath, fullPath, ext, type, date].filter(Boolean).join(' ')
    };
}

function matchesMyDownloadsSearch(item, terms) {
    if (!terms.length) return true;

    const fields = buildMyDownloadsSearchFields(item);
    return terms.every(term => {
        const value = term.value;
        if (!value) return true;

        switch (term.field) {
            case 'author':
                return fields.author.includes(value);
            case 'name':
                return fields.name.includes(value);
            case 'path':
                return fields.path.includes(value) || fields.fullPath.includes(value);
            case 'ext':
                return fields.ext.includes(value.replace(/^\./, ''));
            case 'date':
                return fields.date.includes(value);
            case 'type':
                return fields.type.includes(value);
            default:
                return fields.any.includes(value);
        }
    });
}

function getMyDownloadsHighlightTerms(field) {
    return _myDownloadsSearchState.terms
        .filter(term => term.field === 'any' || term.field === field)
        .map(term => term.value)
        .filter(Boolean);
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMyDownloadsText(text, terms) {
    const safeText = escapeHtml(text || '');
    if (!safeText || !terms || !terms.length) return safeText;

    const normalizedTerms = Array.from(new Set(
        terms
            .map(term => String(term || '').trim())
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)
    ));

    if (!normalizedTerms.length) return safeText;

    const pattern = normalizedTerms.map(escapeRegExp).join('|');
    return safeText.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="my-downloads-highlight">$1</mark>');
}

function updateMyDownloadsSearchUI() {
    const clearBtn = document.getElementById('myDownloadsSearchClearBtn');
    if (clearBtn) {
        clearBtn.disabled = !_myDownloadsSearchState.raw;
    }
}

function updateMyDownloadsStats() {
    const stats = document.getElementById('myDownloadsStats');
    const countEl = document.getElementById('myDownloadsCount');
    const totalCount = _myDownloadsItems.length;
    const filteredCount = _myDownloadsFiltered.length;
    const totalSize = _myDownloadsItems.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
    const filteredSize = _myDownloadsFiltered.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
    const hasFilters = !!(_myDownloadsSearchState.terms.length || _myDownloadsSearchState.type !== 'all');
    const typeLabels = {
        all: '全部',
        video: '视频',
        image: '图片',
        audio: '音频'
    };

    if (countEl) {
        countEl.textContent = hasFilters
            ? `${filteredCount} / ${totalCount} 个文件`
            : `${totalCount} 个文件`;
    }

    if (!stats) return;

    const filterSummary = [];
    if (_myDownloadsSearchState.raw) {
        filterSummary.push(`搜索：<strong>${escapeHtml(_myDownloadsSearchState.raw)}</strong>`);
    }
    if (_myDownloadsSearchState.type !== 'all') {
        filterSummary.push(`类型：<strong>${typeLabels[_myDownloadsSearchState.type] || _myDownloadsSearchState.type}</strong>`);
    }

    const primarySummary = hasFilters
        ? `显示 <strong>${filteredCount}</strong> / <strong>${totalCount}</strong> 个文件，匹配大小 <strong>${formatBytes(filteredSize)}</strong>`
        : `共 <strong>${totalCount}</strong> 个文件，总计 <strong>${formatBytes(totalSize)}</strong>`;

    stats.innerHTML = `
        <div>
            <i class="bi bi-folder me-1"></i>
            ${primarySummary}
            <span class="ms-3 text-muted"><i class="bi bi-folder2-open me-1"></i>${escapeHtml(_myDownloadsRoot || '未设置')}</span>
        </div>
        ${filterSummary.length ? `<div class="mt-1">${filterSummary.join(' <span class="text-muted">·</span> ')}</div>` : ''}
    `;
}

function clearMyDownloadsSearch() {
    const searchInput = document.getElementById('myDownloadsSearch');
    if (!searchInput) return;

    searchInput.value = '';
    filterMyDownloads();
    searchInput.focus();
}

function resetMyDownloadsFilters() {
    const searchInput = document.getElementById('myDownloadsSearch');
    const typeFilter = document.getElementById('myDownloadsTypeFilter');

    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = 'all';

    filterMyDownloads();
}

// 筛选我的下载
function filterMyDownloads() {
    const searchInput = document.getElementById('myDownloadsSearch');
    const typeFilter = document.getElementById('myDownloadsTypeFilter');
    const sortSelect = document.getElementById('myDownloadsSort');

    const rawSearch = searchInput?.value || '';
    const searchTerms = parseMyDownloadsSearchQuery(rawSearch);
    const type = typeFilter?.value || 'all';
    const sort = sortSelect?.value || 'date_desc';

    _myDownloadsSearchState = {
        raw: rawSearch.trim(),
        terms: searchTerms,
        type: type,
        sort: sort
    };

    // 筛选
    _myDownloadsFiltered = _myDownloadsItems.filter(item => {
        if (!matchesMyDownloadsSearch(item, searchTerms)) return false;

        // 类型筛选
        if (type !== 'all') {
            if (getMyDownloadsFileType(item) !== type) return false;
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
                return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
            case 'name_desc':
                return (b.name || '').localeCompare(a.name || '', 'zh-Hans-CN');
            default:
                return 0;
        }
    });

    updateMyDownloadsSearchUI();
    updateMyDownloadsStats();
    renderMyDownloads();
}

// 渲染我的下载
function renderMyDownloads() {
    const list = document.getElementById('myDownloadsList');
    if (!list) return;

    if (!_myDownloadsFiltered.length) {
        const hasActiveFilters = !!(_myDownloadsSearchState.terms.length || _myDownloadsSearchState.type !== 'all');
        list.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-folder2-open" style="font-size: 3rem; opacity: 0.3;"></i>
                <p class="text-muted mt-3 mb-0">${_myDownloadsItems.length && hasActiveFilters ? '没有符合条件的文件' : '还没有下载文件'}</p>
                ${_myDownloadsItems.length && hasActiveFilters ? `
                    <p class="small text-muted mt-2 mb-3">试试搜索作者、路径、扩展名，或使用 <code>author:</code>、<code>ext:</code> 前缀</p>
                    <button class="btn btn-outline-light btn-sm my-downloads-empty-action" onclick="resetMyDownloadsFilters()">
                        <i class="bi bi-arrow-counterclockwise me-1"></i>清除筛选
                    </button>
                ` : ''}
            </div>
        `;
        updateMyDownloadsBatchUI();
        return;
    }

    list.innerHTML = _myDownloadsFiltered.map((item, index) => {
        const isSelected = _myDownloadsSelected.has(item.path);
        const ext = getMyDownloadsFileExt(item.name);
        const relativePath = getMyDownloadsRelativePath(item);
        const displayName = highlightMyDownloadsText(item.name || '未命名文件', getMyDownloadsHighlightTerms('name'));
        const displayAuthor = highlightMyDownloadsText(item.author || '未知', getMyDownloadsHighlightTerms('author'));
        const displayPath = highlightMyDownloadsText(relativePath, getMyDownloadsHighlightTerms('path'));

        let icon = 'bi-file-earmark';
        let iconColor = 'var(--text-muted)';
        if (MY_DOWNLOADS_TYPE_EXTS.video.includes(ext)) {
            icon = 'bi-play-circle-fill';
            iconColor = 'var(--accent)';
        } else if (MY_DOWNLOADS_TYPE_EXTS.image.includes(ext)) {
            icon = 'bi-image-fill';
            iconColor = 'var(--success)';
        } else if (MY_DOWNLOADS_TYPE_EXTS.audio.includes(ext)) {
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
                                <div class="fw-semibold text-truncate" title="${escapeHtml(item.name)}">${displayName}</div>
                                <small class="text-muted d-block text-truncate" title="${escapeHtml(item.author || '未知')}">${displayAuthor}</small>
                                ${relativePath ? `<div class="my-downloads-card-path text-truncate" title="${escapeHtml(relativePath)}">${displayPath}</div>` : ''}
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

// 打开下载目录
async function openMyDownloadsDirectory() {
    try {
        const response = await fetch('/api/download_history/open_directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '打开失败');
        }
        showToast('已打开下载目录', 'success');
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
    .my-downloads-card-path {
        font-size: 0.72rem;
        color: var(--text-muted);
        margin-top: 2px;
    }
    .my-downloads-highlight {
        padding: 0 0.12em;
        border-radius: 0.25rem;
        background: rgba(254, 44, 85, 0.18);
        color: inherit;
    }
    .my-downloads-empty-action {
        min-width: 108px;
    }
`;
document.head.appendChild(style);
