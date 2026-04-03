// ═══════════════════════════════════════════════
// DY Downloader — Utility Functions
// ═══════════════════════════════════════════════

// Debug mode - set to false in production
const _DEBUG = false;
const _log = _DEBUG ? console.log.bind(console) : () => {};

// Debounce utility
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

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

// Utility for setting button loading state
function setButtonLoading(btnId, isLoading, loadingText) {
    loadingText = loadingText || '加载中...';
    const btn = document.getElementById(btnId.replace('#', '')) || document.querySelector(btnId);
    if (!btn) return;

    if (isLoading) {
        if (btn.dataset.isLoading === 'true') return;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.dataset.isLoading = 'true';
        btn.disabled = true;
        const spinner = document.createElement('span');
        spinner.className = 'spinner-border spinner-border-sm me-1';
        spinner.setAttribute('role', 'status');
        spinner.setAttribute('aria-hidden', 'true');
        btn.textContent = '';
        btn.appendChild(spinner);
        btn.appendChild(document.createTextNode(' ' + loadingText));
    } else {
        if (btn.dataset.isLoading !== 'true') return;
        btn.disabled = false;
        btn.dataset.isLoading = 'false';
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
        }
    }
}

function _hideEmptyState() {
    const el = document.getElementById('emptyState');
    if (el) el.style.display = 'none';
}
