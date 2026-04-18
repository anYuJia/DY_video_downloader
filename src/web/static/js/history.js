let _downloadHistoryItems = [];
let _downloadHistorySelected = new Set();

document.addEventListener('DOMContentLoaded', function () {
    initDownloadHistoryUI();
});

function initDownloadHistoryUI() {
    const openBtn = document.getElementById('download-history-btn');
    const closeBtn = document.getElementById('history-close');
    const overlay = document.getElementById('download-history-overlay');
    const refreshBtn = document.getElementById('history-refresh-btn');
    const chooseDirBtn = document.getElementById('history-select-download-dir-btn');
    const saveDirBtn = document.getElementById('history-save-config-btn');
    const selectAll = document.getElementById('history-select-all');
    const batchOpenBtn = document.getElementById('history-batch-open-btn');
    const batchLocateBtn = document.getElementById('history-batch-locate-btn');
    const batchDeleteBtn = document.getElementById('history-batch-delete-btn');

    if (openBtn) openBtn.addEventListener('click', openDownloadHistoryDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDownloadHistoryDrawer);
    if (overlay) overlay.addEventListener('click', closeDownloadHistoryDrawer);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshDownloadHistory);
    if (chooseDirBtn) chooseDirBtn.addEventListener('click', chooseDownloadHistoryDirectory);
    if (saveDirBtn) saveDirBtn.addEventListener('click', saveDownloadHistoryDirectory);
    if (selectAll) selectAll.addEventListener('change', toggleDownloadHistorySelectAll);
    if (batchOpenBtn) batchOpenBtn.addEventListener('click', function () { batchOpenDownloadHistory('open'); });
    if (batchLocateBtn) batchLocateBtn.addEventListener('click', function () { batchOpenDownloadHistory('open_location'); });
    if (batchDeleteBtn) batchDeleteBtn.addEventListener('click', deleteSelectedDownloadHistory);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const drawer = document.getElementById('download-history-drawer');
            if (drawer && drawer.classList.contains('open')) {
                closeDownloadHistoryDrawer();
                e.preventDefault();
            }
        }
    });
}

function openDownloadHistoryDrawer() {
    const drawer = document.getElementById('download-history-drawer');
    const overlay = document.getElementById('download-history-overlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    syncHistoryDownloadDirInputs();
    refreshDownloadHistory();
}

function closeDownloadHistoryDrawer() {
    const drawer = document.getElementById('download-history-drawer');
    const overlay = document.getElementById('download-history-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

async function syncHistoryDownloadDirInputs() {
    const mainInput = document.getElementById('download-dir-input');
    const historyInput = document.getElementById('history-download-dir-input');
    if (!historyInput) return;

    if (mainInput && mainInput.value) {
        historyInput.value = mainInput.value;
        return;
    }

    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        historyInput.value = config.download_dir || '';
    } catch (error) {
        _log('同步下载目录失败', error);
    }
}

async function refreshDownloadHistory() {
    const list = document.getElementById('download-history-list');
    const stats = document.getElementById('download-history-stats');
    if (!list) return;

    list.innerHTML = '<div class="history-empty">正在加载下载历史...</div>';

    try {
        const response = await fetch('/api/download_history');
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '加载失败');
        }

        _downloadHistoryItems = Array.isArray(result.items) ? result.items : [];
        _downloadHistorySelected.clear();

        const historyInput = document.getElementById('history-download-dir-input');
        if (historyInput) historyInput.value = result.base_dir || '';

        const totalSize = _downloadHistoryItems.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
        if (stats) {
            stats.textContent = `共 ${_downloadHistoryItems.length} 个文件，累计 ${formatBytes(totalSize)}，当前目录：${result.download_root || '-'}`;
        }

        renderDownloadHistory();
    } catch (error) {
        list.innerHTML = `<div class="history-empty">加载失败：${escapeHtml(error.message || '未知错误')}</div>`;
        showToast('加载下载历史失败', 'error');
    }
}

function renderDownloadHistory() {
    const list = document.getElementById('download-history-list');
    if (!list) return;

    if (!_downloadHistoryItems.length) {
        list.innerHTML = '<div class="history-empty"><i class="bi bi-clock-history"></i><div class="mt-2">还没有下载文件</div></div>';
        updateDownloadHistoryBatchUI();
        return;
    }

    list.innerHTML = _downloadHistoryItems.map(item => {
        const path = escapeHtml(item.path || '');
        const title = escapeHtml(item.name || '');
        const relPath = escapeHtml(item.relative_path || '');
        const author = escapeHtml(item.author || '未分类');
        const modified = formatTime(item.modified_at || 0);
        const size = formatBytes(Number(item.size) || 0);
        const checked = _downloadHistorySelected.has(item.path) ? 'checked' : '';
        const selectedClass = _downloadHistorySelected.has(item.path) ? ' selected' : '';

        return `
            <div class="history-card${selectedClass}" id="history-card-${encodeURIComponent(item.path)}">
                <div class="history-card-header">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" ${checked}
                               onchange="toggleDownloadHistoryItemSelection('${encodeURIComponent(item.path)}')">
                    </div>
                    <div class="history-card-main">
                        <div class="history-card-title">${title}</div>
                        <div class="history-card-meta">${author} · ${modified || '-'} · ${size}</div>
                        <div class="history-card-path">${relPath}</div>
                    </div>
                </div>
                <div class="history-card-actions">
                    <button class="btn btn-outline-primary btn-sm" onclick="openDownloadHistoryFile('${encodeURIComponent(item.path)}')">打开</button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="openDownloadHistoryLocation('${encodeURIComponent(item.path)}')">打开文件位置</button>
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteDownloadHistoryItems(['${encodeURIComponent(item.path)}'])">删除文件</button>
                </div>
            </div>
        `;
    }).join('');

    updateDownloadHistoryBatchUI();
}

function decodeHistoryPath(encodedPath) {
    return decodeURIComponent(encodedPath);
}

function toggleDownloadHistoryItemSelection(encodedPath) {
    const path = decodeHistoryPath(encodedPath);
    if (_downloadHistorySelected.has(path)) _downloadHistorySelected.delete(path);
    else _downloadHistorySelected.add(path);
    renderDownloadHistory();
}

function toggleDownloadHistorySelectAll() {
    const selectAll = document.getElementById('history-select-all');
    if (!selectAll) return;

    if (selectAll.checked) {
        _downloadHistorySelected = new Set(_downloadHistoryItems.map(item => item.path));
    } else {
        _downloadHistorySelected.clear();
    }
    renderDownloadHistory();
}

function updateDownloadHistoryBatchUI() {
    const selectAll = document.getElementById('history-select-all');
    const batchDeleteBtn = document.getElementById('history-batch-delete-btn');
    const batchOpenBtn = document.getElementById('history-batch-open-btn');
    const batchLocateBtn = document.getElementById('history-batch-locate-btn');

    const selectedCount = _downloadHistorySelected.size;
    const totalCount = _downloadHistoryItems.length;

    if (selectAll) {
        selectAll.checked = totalCount > 0 && selectedCount === totalCount;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }
    if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount === 0;
    if (batchOpenBtn) batchOpenBtn.disabled = selectedCount === 0;
    if (batchLocateBtn) batchLocateBtn.disabled = selectedCount === 0;
}

async function openDownloadHistoryFile(encodedPath) {
    await postHistoryAction('/api/download_history/open', { path: decodeHistoryPath(encodedPath) }, '文件已打开');
}

async function openDownloadHistoryLocation(encodedPath) {
    await postHistoryAction('/api/download_history/open_location', { path: decodeHistoryPath(encodedPath) }, '已打开文件位置');
}

async function batchOpenDownloadHistory(action) {
    const selected = Array.from(_downloadHistorySelected);
    if (!selected.length) return;

    for (const path of selected) {
        await postHistoryAction(`/api/download_history/${action}`, { path: path });
    }

    showToast(action === 'open' ? '已打开选中文件' : '已打开选中文件位置', 'success');
}

async function deleteSelectedDownloadHistory() {
    const selected = Array.from(_downloadHistorySelected);
    if (!selected.length) return;
    await deleteDownloadHistoryItems(selected.map(path => encodeURIComponent(path)));
}

async function deleteDownloadHistoryItems(encodedPaths) {
    const paths = encodedPaths.map(decodeHistoryPath);
    if (!paths.length) return;
    if (!confirm(`确定删除选中的 ${paths.length} 个文件吗？`)) return;

    try {
        const response = await fetch('/api/download_history/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: paths })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '删除失败');
        }
        showToast(`已删除 ${result.deleted_count || 0} 个文件`, 'success');
        await refreshDownloadHistory();
    } catch (error) {
        showToast(error.message || '删除失败', 'error');
    }
}

async function postHistoryAction(url, payload, successMessage) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '操作失败');
        }
        if (successMessage) showToast(successMessage, 'success');
        return true;
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
        return false;
    }
}

async function chooseDownloadHistoryDirectory() {
    try {
        const response = await fetch('/api/select_directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success && result.path) {
            const historyInput = document.getElementById('history-download-dir-input');
            const mainInput = document.getElementById('download-dir-input');
            if (historyInput) historyInput.value = result.path;
            if (mainInput) mainInput.value = result.path;
        } else if (result.message && result.message !== '用户取消选择') {
            throw new Error(result.message);
        }
    } catch (error) {
        showToast(error.message || '选择目录失败', 'error');
    }
}

async function saveDownloadHistoryDirectory() {
    const historyInput = document.getElementById('history-download-dir-input');
    const mainCookieInput = document.getElementById('cookie-input');
    const mainDirInput = document.getElementById('download-dir-input');
    if (!historyInput) return;

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cookie: mainCookieInput ? mainCookieInput.value.trim() : '',
                download_dir: historyInput.value.trim()
            })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '保存失败');
        }

        if (mainDirInput) mainDirInput.value = historyInput.value.trim();
        showToast('下载目录已保存', 'success');
        await refreshDownloadHistory();
    } catch (error) {
        showToast(error.message || '保存目录失败', 'error');
    }
}
