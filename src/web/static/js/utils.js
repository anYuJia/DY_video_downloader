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
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

function inferProxyMediaType(url, explicitType) {
    if (explicitType) return explicitType;
    if (!url) return '';

    const lowerUrl = String(url).toLowerCase();

    if (
        lowerUrl.indexOf('/aweme/v1/play/') !== -1 ||
        lowerUrl.indexOf('video_id=') !== -1 ||
        lowerUrl.indexOf('packsourceenum_') !== -1 ||
        lowerUrl.indexOf('.mp4') !== -1 ||
        lowerUrl.indexOf('.m3u8') !== -1
    ) {
        return 'video';
    }

    if (
        lowerUrl.indexOf('.mp3') !== -1 ||
        lowerUrl.indexOf('.m4a') !== -1 ||
        lowerUrl.indexOf('.aac') !== -1 ||
        lowerUrl.indexOf('music') !== -1 ||
        lowerUrl.indexOf('audio') !== -1
    ) {
        return 'audio';
    }

    if (
        lowerUrl.indexOf('.jpg') !== -1 ||
        lowerUrl.indexOf('.jpeg') !== -1 ||
        lowerUrl.indexOf('.png') !== -1 ||
        lowerUrl.indexOf('.webp') !== -1 ||
        lowerUrl.indexOf('douyinpic') !== -1 ||
        lowerUrl.indexOf('byteimg') !== -1
    ) {
        return 'image';
    }

    return '';
}

function proxyUrl(url, mediaType) {
    if (!url) return '';
    const normalizedMediaType = inferProxyMediaType(url, mediaType);

    var proxiedUrl = '/api/media/proxy?url=' + encodeURIComponent(url);
    if (normalizedMediaType) {
        proxiedUrl += '&media_type=' + encodeURIComponent(normalizedMediaType);
    }
    return proxiedUrl;
}

async function downloadRemoteFile(url, filename) {
    if (!url) throw new Error('缺少下载地址');

    const safeFilename = filename || 'download';

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = safeFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(function() {
            URL.revokeObjectURL(objectUrl);
        }, 4000);

        return true;
    } catch (error) {
        console.warn('[downloadRemoteFile] Fallback to direct open:', error);
        window.open(url, '_blank', 'noopener');
        return false;
    }
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
    hideSectionById('emptyState');
}
