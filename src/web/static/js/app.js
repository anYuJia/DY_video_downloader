// ═══════════════════════════════════════════════
// DY Downloader — Main Application Entry Point
// Globals, initialization, event listeners,
// search, user detail, video list, link parse,
// liked videos/authors, config
// ═══════════════════════════════════════════════

// ── Global Variables ──
let socket;
let currentUser = null;
let currentVideos = [];
let allVideos = [];
let totalVideos = 0;
let parsedVideoData = null;

// Progressive loading state
let _loadingVideos = false;
let _loadCursor = 0;
let _hasMoreVideos = true;
let _selectMode = false;
let _selectedVideos = new Set();
let isHomeView = true;

// Search cache
let _cachedSearchUsers = {};

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

    // 自动预加载推荐视频数据（不显示界面）
    setTimeout(() => {
        if (typeof loadRecommendedFeed === 'function' && typeof recommendedVideos !== 'undefined') {
            addLog('后台预加载推荐视频数据...', 'info');
            loadRecommendedFeed(20);  // 只加载数据，不显示界面
        }
    }, 1000); // 延迟1秒，等待页面完全加载
});

function initializeApp() {
    addLog('Web界面已加载', 'info');
}

function setupEventListeners() {
    _log('开始设置事件监听器...');

    document.getElementById('save-config-btn').addEventListener('click', saveConfig);

    var selectDirBtn = document.getElementById('select-download-dir-btn');
    if (selectDirBtn) selectDirBtn.addEventListener('click', selectDownloadDirectory);

    document.getElementById('search-btn').addEventListener('click', searchUser);
    document.getElementById('search-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchUser();
    });

    document.getElementById('download-link-btn').addEventListener('click', downloadFromLink);
    document.getElementById('link-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') downloadFromLink();
    });

    document.getElementById('back-btn').addEventListener('click', goBackToHome);

    var likedBtn = document.getElementById('download-liked-btn');
    var likedAuthorsBtn = document.getElementById('download-liked-authors-btn');
    if (likedBtn) likedBtn.addEventListener('click', function(e) {
        if (!checkLoginRequired(likedBtn)) {
            e.preventDefault();
            return;
        }
        handleLikedVideosClick();
    });
    if (likedAuthorsBtn) likedAuthorsBtn.addEventListener('click', function(e) {
        if (!checkLoginRequired(likedAuthorsBtn)) {
            e.preventDefault();
            return;
        }
        handleLikedAuthorsClick();
    });

    document.getElementById('clear-log-btn').addEventListener('click', clearLog);
    document.getElementById('scroll-to-bottom-btn').addEventListener('click', scrollToBottom);

    document.getElementById('storage-manage-btn').addEventListener('click', function (e) {
        e.stopPropagation(); // prevent dropdown from toggling
        var modal = new bootstrap.Modal(document.getElementById('storageManageModal'));
        modal.show();
        refreshStorageData();
    });

    document.getElementById('settings-toggle').addEventListener('click', function () {
        document.getElementById('settings-drawer').classList.add('open');
        document.getElementById('settings-overlay').classList.add('open');
    });
    document.getElementById('settings-close').addEventListener('click', closeSettingsDrawer);
    document.getElementById('settings-overlay').addEventListener('click', closeSettingsDrawer);

    document.getElementById('bottom-bar-toggle').addEventListener('click', toggleBottomBar);
    document.getElementById('bottom-bar-expand').addEventListener('click', function (e) {
        e.stopPropagation();
        toggleBottomBar();
    });
    document.getElementById('bottom-bar-overlay').addEventListener('click', closeBottomBar);

    document.querySelectorAll('.bottom-tabs .tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var tab = this.dataset.tab;
            document.querySelectorAll('.bottom-tabs .tab-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
            document.getElementById('panel-' + tab).classList.add('active');
        });
    });

    var miniProgress = document.getElementById('bottom-bar-mini-progress');
    if (miniProgress) miniProgress.addEventListener('click', function (e) { e.stopPropagation(); });

    setupDragDrop();
    setupCookieValidation();

    // Global paste handler
    document.addEventListener('paste', function (e) {
        var activeElement = document.activeElement;
        if (activeElement && activeElement.id === 'cookie-input') return;
        var pastedText = e.clipboardData.getData('text');
        if (pastedText.includes('douyin.com') || pastedText.includes('dy.com')) {
            document.getElementById('link-input').value = pastedText;
            showToast('检测到抖音链接，已自动填入');
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('search-input').focus();
            return;
        }
        if (e.key === 'Escape') {
            if (document.getElementById('immersive-player')) return;
            var drawer = document.getElementById('settings-drawer');
            if (drawer && drawer.classList.contains('open')) {
                closeSettingsDrawer();
                e.preventDefault();
            }
        }
    });
}

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
async function loadConfig() {
    try {
        var response = await fetch('/api/config');
        var config = await response.json();
        document.getElementById('download-dir-input').value = config.download_dir || '';
        document.getElementById('cookie-input').value = config.cookie || '';
        if (config.cookie_set) {
            updateStatus('ready', '已配置');
        } else {
            updateStatus('error', '需要配置Cookie');
            setTimeout(function() { showCookieSetupModal(); }, 500);
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showToast('加载配置失败', 'error');
    }
}

async function saveConfig() {
    var cookieValue = document.getElementById('cookie-input').value.trim();
    var validation = validateCookie(cookieValue);
    if (!validation.isValid && validation.status !== 'empty') {
        showToast('Cookie验证失败，请检查必要参数', 'error');
        updateCookieValidationUI(validation);
        return;
    }
    var config = {
        download_dir: document.getElementById('download-dir-input').value,
        cookie: cookieValue
    };
    try {
        var response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        var result = await response.json();
        if (result.success) showToast('配置保存成功', 'success');
        else showToast(result.message, 'error');
    } catch (error) {
        showToast('保存配置失败', 'error');
    }
}

async function selectDownloadDirectory() {
    try {
        var response = await fetch('/api/select_directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        var result = await response.json();
        if (result.success && result.path) {
            document.getElementById('download-dir-input').value = result.path;
            document.getElementById('download-dir-hint').textContent = '已选择：' + result.path;
            showToast('已选择文件夹：' + result.path, 'success');
        } else if (result.message !== '用户取消选择') {
            showToast(result.message || '选择失败', 'error');
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
        showToast('选择文件夹失败', 'error');
    }
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
async function searchUser() {
    var keyword = document.getElementById('search-input').value.trim();
    if (!keyword) { showToast('请输入搜索关键词', 'error'); return; }

    var btn = document.getElementById('search-btn');
    btn.disabled = true;
    btn.textContent = '';
    var spinnerEl = document.createElement('span');
    spinnerEl.className = 'spinner-border spinner-border-sm';
    btn.appendChild(spinnerEl);

    hideAllSections();
    updateStatus('running', '搜索中');
    addLog('搜索用户: ' + keyword);

    try {
        var response = await fetch('/api/search_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: keyword })
        });
        var result = await response.json();
        if (result.success) {
            if (result.type === 'single') {
                currentUser = result.user;
                showUserDetail(result.user);
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
        btn.textContent = '';
        var icon = document.createElement('i');
        icon.className = 'bi bi-search';
        btn.appendChild(icon);
    }
}

function showMultipleUsers(users) {
    var modal = new bootstrap.Modal(document.getElementById('user-select-modal'));
    var userList = document.getElementById('modal-user-list');
    _cachedSearchUsers = {};
    users.forEach(function(user) { if (user.sec_uid) _cachedSearchUsers[user.sec_uid] = user; });
    userList.innerHTML = users.map(function(user) { return createUserCard(user, false); }).join('');
    modal.show();
}

function createUserCard(user, showDownloadBtn) {
    var avatarUrl = user.avatar_thumb || user.avatar_larger || '/static/default-avatar.svg';
    var nickEscaped = escapeHtml(user.nickname);
    var sigEscaped = escapeHtml(user.signature || '无简介');
    var nickForAttr = nickEscaped.replace(/'/g, "\\'");
    var btnHtml = showDownloadBtn
        ? '<button class="btn btn-primary btn-sm" onclick="downloadUser(\'' + user.sec_uid + '\', \'' + nickForAttr + '\')"><i class="bi bi-download"></i> 下载视频</button>'
        : '<button class="btn btn-primary btn-sm" onclick="selectUser(\'' + user.sec_uid + '\', \'' + nickForAttr + '\')"><i class="bi bi-check"></i> 选择</button>';
    return '<div class="col-md-6 mb-3"><div class="card user-card h-100"><div class="card-body">' +
        '<div class="d-flex align-items-center mb-3">' +
        '<img src="' + avatarUrl + '" alt="头像" class="rounded-circle me-3" style="width:50px;height:50px;object-fit:cover;" onerror="this.src=\'/static/default-avatar.svg\'">' +
        '<div class="flex-grow-1"><h6 class="card-title mb-1">' + nickEscaped + '</h6>' +
        '<small class="text-muted">抖音号: ' + (user.unique_id || '未设置') + '</small></div></div>' +
        '<p class="card-text"><small class="text-muted">粉丝: ' + user.follower_count + '</small><br>' +
        '<small class="text-muted">' + sigEscaped + '</small></p>' + btnHtml +
        '</div></div></div>';
}

async function selectUser(secUid, nickname) {
    bootstrap.Modal.getInstance(document.getElementById('user-select-modal')).hide();
    if (_cachedSearchUsers[secUid]) {
        currentUser = _cachedSearchUsers[secUid];
        showUserDetail(currentUser);
        fetch('/api/user_detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' }) })
        .then(function(r) { return r.json(); })
        .then(function(data) { if (data.success && data.user) { Object.assign(currentUser, data.user); showUserDetail(currentUser); } })
        .catch(function() {});
        return;
    }
    fetch('/api/user_detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' }) })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.need_verify) showVerifyDialog();
        else if (data.success) { currentUser = data.user; showUserDetail(data.user); }
        else showToast(data.message || '获取用户详情失败', 'error');
    })
    .catch(function() { showToast('获取用户详情失败', 'error'); });
}

// ═══════════════════════════════════════════════
// USER DETAIL
// ═══════════════════════════════════════════════
function goBackToHome() {
    ['userDetailSection', 'userVideosSection', 'likedVideosSection', 'likedAuthorsSection', 'linkParseResult'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = '';
    document.getElementById('back-btn').style.display = 'none';
    currentUser = null;
    allVideos = [];
    isHomeView = true;
}

function showUserDetail(user) {
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';
    document.getElementById('back-btn').style.display = 'flex';
    var avatarUrl = user.avatar_larger || user.avatar_thumb || '/static/default-avatar.svg';
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
// VIDEO LIST — progressive loading with skeleton
// ═══════════════════════════════════════════════
function loadUserVideos() {
    if (!currentUser) { showToast('请先选择用户', 'warning'); return; }
    allVideos = [];
    _loadCursor = 0;
    _hasMoreVideos = true;
    _selectedVideos.clear();
    _selectMode = false;

    document.getElementById('userVideosSection').style.display = 'block';
    var videosList = document.getElementById('userVideosList');
    videosList.innerHTML = '';
    // Show skeleton loading placeholders
    for (var i = 0; i < 8; i++) {
        var sk = document.createElement('div');
        sk.className = 'col-md-3 col-sm-6 mb-3';
        sk.innerHTML = '<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>';
        videosList.appendChild(sk);
    }
    document.getElementById('videoCount').textContent = '加载中...';
    _loadNextPage();
}

async function _loadNextPage() {
    if (_loadingVideos || !_hasMoreVideos) return;
    _loadingVideos = true;
    try {
        var response = await fetch('/api/user_videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sec_uid: currentUser.sec_uid, cursor: _loadCursor, count: 18 })
        });
        var data = await response.json();
        if (data.need_verify) { showVerifyDialog(); _loadingVideos = false; return; }
        if (data.success && data.videos.length > 0) {
            if (allVideos.length === 0) document.getElementById('userVideosList').innerHTML = '';
            allVideos = allVideos.concat(data.videos);
            window.currentVideos = allVideos;
            _hasMoreVideos = data.has_more;
            _loadCursor = data.cursor;
            displayVideos(data.videos, true);
            document.getElementById('videoCount').textContent = allVideos.length + ' 个作品' + (_hasMoreVideos ? '（加载中...）' : '');
            if (!_hasMoreVideos) document.getElementById('userAwemeCount').textContent = formatNumber(allVideos.length);
            if (_hasMoreVideos) setTimeout(function() { _loadNextPage(); }, 300);
        } else {
            _hasMoreVideos = false;
            if (allVideos.length === 0) { document.getElementById('userVideosList').innerHTML = ''; document.getElementById('videoCount').textContent = '无作品'; }
            else { document.getElementById('videoCount').textContent = allVideos.length + ' 个作品'; document.getElementById('userAwemeCount').textContent = formatNumber(allVideos.length); }
        }
    } catch (error) { console.error('加载视频失败:', error); showToast('加载视频失败', 'error'); }
    _loadingVideos = false;
}

// ═══════════════════════════════════════════════
// MULTI-SELECT
// ═══════════════════════════════════════════════
function toggleSelectMode() {
    _selectMode = !_selectMode;
    _selectedVideos.clear();
    var btn = document.getElementById('selectModeBtn');
    btn.textContent = '';
    if (_selectMode) {
        btn.classList.add('active');
        var i1 = document.createElement('i'); i1.className = 'bi bi-x-lg'; btn.appendChild(i1); btn.appendChild(document.createTextNode(' 取消选择'));
        document.getElementById('selectedActions').style.display = 'inline-block';
    } else {
        btn.classList.remove('active');
        var i2 = document.createElement('i'); i2.className = 'bi bi-check2-square'; btn.appendChild(i2); btn.appendChild(document.createTextNode(' 多选'));
        document.getElementById('selectedActions').style.display = 'none';
    }
    document.querySelectorAll('.video-select-overlay').forEach(function(el) { el.style.display = _selectMode ? 'flex' : 'none'; });
    document.querySelectorAll('.video-card').forEach(function(el) { el.classList.remove('selected'); });
    updateSelectedCount();
}

function toggleVideoSelect(awemeId, el) {
    if (!_selectMode) return;
    var card = el.closest('.video-card');
    if (_selectedVideos.has(awemeId)) { _selectedVideos.delete(awemeId); card.classList.remove('selected'); }
    else { _selectedVideos.add(awemeId); card.classList.add('selected'); }
    updateSelectedCount();
}

function updateSelectedCount() {
    var el = document.getElementById('selectedCount');
    if (el) el.textContent = '已选 ' + _selectedVideos.size;
}

function downloadSelected() {
    if (_selectedVideos.size === 0) { showToast('请先选择要下载的作品', 'warning'); return; }
    _selectedVideos.forEach(function(awemeId) { downloadVideoFromList(awemeId); });
    showToast('开始下载 ' + _selectedVideos.size + ' 个作品', 'success');
    addLog('批量下载 ' + _selectedVideos.size + ' 个选中作品');
}

// ═══════════════════════════════════════════════
// DISPLAY VIDEOS
// ═══════════════════════════════════════════════
function showUserVideos(videos) {
    window.currentVideos = videos;
    allVideos = videos;
    document.getElementById('userVideosList').innerHTML = '';
    displayVideos(videos, false);
    document.getElementById('videoCount').textContent = videos.length + ' 个作品';
    document.getElementById('userVideosSection').style.display = 'block';
}

function displayVideos(videos, append) {
    append = append || false;
    var videosList = document.getElementById('userVideosList');
    if (!append) videosList.innerHTML = '';
    if (videos && videos.length > 0) {
        var enhancedVideos = videos.map(function(v) { return Object.assign({}, v, { stored_at: Date.now() }); });
        VideoStorage.saveVideos(enhancedVideos);
        window.currentVideos = allVideos;
    }
    videos.forEach(function(video) {
        var coverUrl = video.cover_url || '/static/default-cover.svg';
        var createTime = new Date(video.create_time * 1000).toLocaleDateString();
        var mediaType = video.media_type === 'image' ? '图集' : video.media_type === 'live_photo' ? 'Live' : '视频';
        var duration = video.duration > 0 ? formatDuration(video.duration) : '';
        var col = document.createElement('div');
        col.className = 'col-md-3 col-sm-6 mb-3';
        col.innerHTML = '<div class="card h-100 video-card" data-aweme-id="' + video.aweme_id + '">' +
            '<div class="position-relative video-cover-container" onclick="previewMediaFromList(\'' + video.aweme_id + '\')">' +
            '<img src="' + coverUrl + '" class="card-img-top video-cover" alt="封面" onerror="this.src=\'/static/default-cover.svg\'">' +
            '<i class="bi bi-play-circle-fill video-play-icon"></i>' +
            '<div class="video-overlay"><div class="video-stats">' +
            '<div class="stat-item"><i class="bi bi-heart-fill"></i><span>' + formatNumber(video.digg_count) + '</span></div>' +
            '<div class="stat-item"><i class="bi bi-chat-fill"></i><span>' + formatNumber(video.comment_count) + '</span></div>' +
            '<div class="stat-item"><i class="bi bi-share-fill"></i><span>' + formatNumber(video.share_count) + '</span></div>' +
            '</div></div>' +
            '<span class="badge bg-primary position-absolute top-0 end-0 m-2">' + mediaType + '</span>' +
            (duration ? '<span class="badge bg-dark position-absolute bottom-0 start-0 m-2">' + duration + '</span>' : '') +
            '<div class="video-select-overlay position-absolute top-0 start-0 w-100 h-100 align-items-center justify-content-center" style="display:none;background:rgba(0,0,0,0.3);cursor:pointer;z-index:5;" onclick="event.stopPropagation();toggleVideoSelect(\'' + video.aweme_id + '\',this)">' +
            '<i class="bi bi-check-circle-fill" style="font-size:2rem;color:rgba(255,255,255,0.8);"></i></div></div>' +
            '<div class="card-body video-card-body">' +
            '<p class="card-text video-desc">' + escapeHtml(video.desc || '无描述') + '</p>' +
            '<div class="text-muted small video-date">' + createTime + '</div>' +
            '<div class="video-actions">' +
            '<button class="btn btn-sm btn-outline-primary video-btn" onclick="downloadVideoFromList(\'' + video.aweme_id + '\')"><i class="bi bi-download"></i></button>' +
            '<button class="btn btn-sm btn-outline-info video-btn" onclick="showVideoDetail(\'' + video.aweme_id + '\')"><i class="bi bi-eye"></i></button>' +
            '<button class="btn btn-sm btn-outline-success video-btn" onclick="event.stopPropagation();previewMediaFromList(\'' + video.aweme_id + '\')"><i class="bi bi-play-circle"></i></button>' +
            '</div></div></div>';
        videosList.appendChild(col);
    });
}

// ═══════════════════════════════════════════════
// VIDEO DOWNLOAD FUNCTIONS
// ═══════════════════════════════════════════════
function inferMediaTypeFromUrl(url, fallbackType) {
    var normalizedFallback = fallbackType === 'image' || fallbackType === 'live_photo' || fallbackType === 'video'
        ? fallbackType
        : 'video';
    if (!url || typeof url !== 'string') return normalizedFallback;

    var cleanUrl = url.split('?')[0].toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/.test(cleanUrl)) return 'image';
    if (/\.(mp4|mov|m4v|webm)$/.test(cleanUrl)) return 'video';
    return normalizedFallback;
}

function normalizeMediaUrlsForDownload(mediaUrls, rawMediaType) {
    if (!Array.isArray(mediaUrls)) return [];

    var fallbackType = rawMediaType === 'image' || rawMediaType === 'live_photo' || rawMediaType === 'video'
        ? rawMediaType
        : 'video';

    return mediaUrls.map(function(item) {
        if (typeof item === 'string') {
            var normalizedUrl = item.trim();
            if (!normalizedUrl) return null;
            return {
                url: normalizedUrl,
                type: inferMediaTypeFromUrl(normalizedUrl, fallbackType)
            };
        }

        if (item && typeof item === 'object') {
            var itemUrl = typeof item.url === 'string' ? item.url.trim() : '';
            if (!itemUrl) return null;
            return Object.assign({}, item, {
                url: itemUrl,
                type: item.type || inferMediaTypeFromUrl(itemUrl, fallbackType)
            });
        }

        return null;
    }).filter(function(item) { return !!item; });
}

function downloadSingleVideoWithData(awemeId, desc, mediaUrls, rawMediaType, authorName) {
    var storedVideo = VideoStorage.getVideo(awemeId);
    var fvd = storedVideo ? { aweme_id: awemeId, desc: storedVideo.desc || desc, media_urls: storedVideo.media_urls || mediaUrls, raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || rawMediaType, author_name: storedVideo.author ? storedVideo.author.nickname : (authorName || '未知作者') }
        : { aweme_id: awemeId, desc: desc, media_urls: mediaUrls, raw_media_type: rawMediaType, author_name: authorName || '未知作者' };
    fvd.media_urls = normalizeMediaUrlsForDownload(fvd.media_urls, fvd.raw_media_type);
    if (!fvd.media_urls || fvd.media_urls.length === 0) { showToast('媒体URL不能为空', 'error'); return; }
    fetch('/api/download_single_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fvd) })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data.success) { showToast('开始下载媒体', 'success'); addLog('开始下载媒体: ' + fvd.desc + ' (' + fvd.media_urls.length + '个文件)'); } else showToast(data.message, 'error'); })
    .catch(function() { showToast('下载失败', 'error'); });
}

function downloadVideoFromList(awemeId) {
    _log('开始下载视频:', awemeId);
    addLog('点击下载按钮，视频ID: ' + awemeId);
    var storedVideo = VideoStorage.getVideo(awemeId);
    var fvd;
    if (storedVideo) {
        fvd = { aweme_id: awemeId, desc: storedVideo.desc || '视频', media_urls: storedVideo.media_urls || [], raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || 'video', author_name: storedVideo.author ? storedVideo.author.nickname : '未知作者' };
    } else {
        var video = window.currentVideos ? window.currentVideos.find(function(v) { return v.aweme_id === awemeId; }) : null;
        if (video) { fvd = { aweme_id: awemeId, desc: video.desc || '视频', media_urls: video.media_urls || [], raw_media_type: video.raw_media_type || video.media_type || 'video', author_name: video.author ? video.author.nickname : '未知作者' }; }
        else { showToast('找不到视频数据', 'error'); return; }
    }
    fvd.media_urls = normalizeMediaUrlsForDownload(fvd.media_urls, fvd.raw_media_type);
    if (!fvd.media_urls || fvd.media_urls.length === 0) { showToast('媒体URL不能为空', 'error'); return; }
    fetch('/api/download_single_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fvd) })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data.success) { showToast('开始下载媒体', 'success'); addLog('下载任务已启动: ' + fvd.desc + ' (任务ID: ' + (data.task_id || '未知') + ')'); } else showToast(data.message || '下载失败', 'error'); })
    .catch(function() { showToast('下载请求失败', 'error'); });
}

function downloadUserVideos(secUidOverride) {
    var secUid = secUidOverride || (currentUser ? currentUser.sec_uid : null);
    var nickname = currentUser ? currentUser.nickname : '';
    if (!secUid && !currentUser) { showToast('请先选择用户', 'warning'); return; }
    fetch('/api/download_user_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid || currentUser.sec_uid, nickname: nickname || '', aweme_count: currentUser ? currentUser.aweme_count : 0 }) })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data.success) { createDownloadProgressElement(data.task_id, nickname || '用户'); showToast('开始下载用户作品', 'success'); addLog('开始下载 ' + (nickname || '用户') + ' 的作品'); } else showToast(data.message, 'error'); })
    .catch(function() { showToast('下载失败', 'error'); });
}

async function downloadUser(secUid, nickname) {
    try {
        var response = await fetch('/api/download_user_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '', aweme_count: (currentUser && currentUser.sec_uid === secUid) ? currentUser.aweme_count : 0 }) });
        var result = await response.json();
        if (result.success) { showToast('开始下载 ' + nickname + ' 的视频', 'success'); addLog(result.message); createDownloadProgressElement(result.task_id, nickname); }
        else showToast(result.message, 'error');
    } catch (error) { showToast('下载失败', 'error'); }
}

// ═══════════════════════════════════════════════
// LINK PARSE
// ═══════════════════════════════════════════════
async function downloadFromLink() {
    var link = document.getElementById('link-input').value.trim();
    if (!link) { showToast('请输入抖音链接', 'error'); return; }
    if (!link.includes('douyin.com') && !link.includes('dy.com')) { showToast('请输入有效的抖音链接', 'error'); return; }
    updateStatus('running', '解析中');
    addLog('解析链接: ' + link);
    setButtonLoading('download-link-btn', true, '解析中');
    try {
        var response = await fetch('/api/parse_link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: link }) });
        var result = await response.json();
        if (result.success) {
            isHomeView = false;
            hideAllSections();
            if (result.user && result.type === 'link_parse') {
                currentUser = result.user;
                showUserDetail(result.user);
                showUserVideos(result.videos);
                showToast('链接解析成功，已显示作者信息和作品', 'success');
                var pl = document.getElementById('parsedVideosList');
                if (pl) pl.innerHTML = '';
            } else if (result.videos && result.videos.length > 0) {
                showParseResults(result.videos);
                showToast('链接解析成功', 'success');
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
    var parsedVideosList = document.getElementById('parsedVideosList');
    parsedVideosList.innerHTML = '';
    window.parsedVideosData = videos;
    videos.forEach(function(video, index) {
        if (video && video.aweme_id) {
            if (VideoStorage.saveVideo(video)) {
                _log('解析的视频已存储到本地: ' + video.aweme_id);
                if (index === 0) addLog('解析的视频已存储到本地: ' + video.aweme_id);
            }
        }
        var coverUrl = video.cover_url || '/static/default-cover.svg';
        var avatarUrl = video.author.avatar_thumb || '/static/default-avatar.svg';
        var h = '<div class="row mb-2 border-bottom pb-2" data-aweme-id="' + video.aweme_id + '">' +
            '<div class="col-4"><img src="' + coverUrl + '" class="img-fluid rounded" alt="封面" style="max-height:60px;object-fit:cover;" onerror="this.src=\'/static/default-cover.svg\';"></div>' +
            '<div class="col-8"><h6 class="small fw-bold mb-1" style="font-size:0.75rem;">' + escapeHtml(video.desc || '无描述') + '</h6>' +
            '<p class="text-muted mb-1 small" style="font-size:0.7rem;"><img src="' + avatarUrl + '" class="rounded-circle me-1" width="14" height="14" onerror="this.src=\'/static/default-avatar.svg\';">' +
            '<span>' + escapeHtml(video.author.nickname || '未知作者') + '</span></p>' +
            '<div class="d-flex justify-content-between text-muted mb-1" style="font-size:0.65rem;">' +
            '<span>' + formatNumber(video.digg_count || 0) + '</span><span>' + formatNumber(video.comment_count || 0) + '</span><span>' + formatNumber(video.share_count || 0) + '</span></div>' +
            '<div class="mt-1"><button class="btn btn-primary btn-sm" style="font-size:0.65rem;padding:1px 4px;" onclick="downloadParsedVideo(\'' + video.aweme_id + '\')">下载</button> ' +
            '<button class="btn btn-outline-info btn-sm" style="font-size:0.65rem;padding:1px 4px;" onclick="showVideoDetail(\'' + video.aweme_id + '\')">详情</button></div></div></div>';
        parsedVideosList.innerHTML += h;
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
    if (!window.parsedVideosData) { showToast('没有可下载的视频', 'error'); return; }
    var videoData = window.parsedVideosData.find(function(v) { return v.aweme_id === awemeId; });
    if (!videoData) { showToast('视频数据不存在', 'error'); return; }
    try {
        var storedVideo = VideoStorage.getVideo(awemeId);
        var fvd = storedVideo
            ? { aweme_id: awemeId, desc: storedVideo.desc || videoData.desc || '视频', media_urls: storedVideo.media_urls || videoData.media_urls || [], raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || videoData.media_type || 'video', author_name: storedVideo.author ? storedVideo.author.nickname : (videoData.author ? videoData.author.nickname : '未知作者') }
            : Object.assign({}, videoData, { raw_media_type: videoData.raw_media_type || videoData.media_type || 'video', author_name: videoData.author ? videoData.author.nickname : '未知作者' });
        fvd.media_urls = normalizeMediaUrlsForDownload(fvd.media_urls, fvd.raw_media_type);
        var response = await fetch('/api/download_single_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aweme_id: fvd.aweme_id, desc: fvd.desc, media_urls: fvd.media_urls, raw_media_type: fvd.raw_media_type, author_name: fvd.author_name }) });
        var result = await response.json();
        if (result.success) { showToast('开始下载媒体', 'success'); addLog('开始下载媒体: ' + fvd.desc); }
        else showToast(result.message, 'error');
    } catch (error) { showToast('下载失败', 'error'); }
}

// ═══════════════════════════════════════════════
// VIDEO DETAIL MODAL
// ═══════════════════════════════════════════════
async function showVideoDetail(awemeId) {
    try {
        var video = null;
        if (window.currentVideos) video = window.currentVideos.find(function(v) { return v.aweme_id === awemeId; }) || null;
        if (!video) video = VideoStorage.getVideo(awemeId);
        if (!video || !video.media_urls || video.media_urls.length === 0) {
            var response = await fetch('/api/video_detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aweme_id: awemeId }) });
            var result = await response.json();
            if (!result.success) { showToast(result.message || '获取视频详情失败', 'error'); return; }
            video = result.video;
            VideoStorage.saveVideo(video);
        }
        if (!video) { showToast('获取视频详情失败', 'error'); return; }
        renderVideoDetail(video, awemeId);
    } catch (error) { console.error('[showVideoDetail]:', error); showToast('获取视频详情失败', 'error'); }
}

function renderVideoDetail(video, awemeId) {
    var typeBadge = document.getElementById('videoDetailTypeBadge');
    if (typeBadge) { var tm = { video: '视频', image: '图集', live_photo: 'Live Photo', mixed: '混合' }; typeBadge.textContent = tm[video.media_type || video.raw_media_type] || '作品'; }
    document.getElementById('videoDetailCover').src = video.cover_url || '/static/default-cover.svg';
    var author = video.author || {};
    document.getElementById('videoDetailAuthorAvatar').src = author.avatar_thumb || '/static/default-avatar.svg';
    document.getElementById('videoDetailAuthorName').textContent = author.nickname || '未知作者';
    document.getElementById('videoDetailTime').textContent = video.create_time ? new Date(video.create_time * 1000).toLocaleString() : '';
    document.getElementById('videoDetailDesc').textContent = video.desc || '无描述';
    document.getElementById('videoDetailLikes').textContent = formatNumber(video.digg_count || 0);
    document.getElementById('videoDetailComments').textContent = formatNumber(video.comment_count || 0);
    document.getElementById('videoDetailShares').textContent = formatNumber(video.share_count || 0);

    var mediaUrlsContainer = document.getElementById('videoDetailMediaUrls');
    mediaUrlsContainer.textContent = '';
    if (video.media_urls && video.media_urls.length > 0) {
        video.media_urls.forEach(function(media, index) {
            var item = document.createElement('div');
            item.className = 'video-detail-media-item';
            var badge = document.createElement('span');
            badge.className = 'badge ' + (media.type === 'video' ? 'bg-primary' : media.type === 'image' ? 'bg-success' : 'bg-secondary');
            badge.textContent = media.type === 'video' ? '视频' : media.type === 'image' ? '图片' : media.type === 'live_photo' ? 'Live' : (media.type || '未知');
            var link = document.createElement('a');
            link.href = media.url || '';
            link.target = '_blank';
            link.textContent = '媒体 ' + (index + 1) + ' - ' + (media.type || 'unknown');
            link.title = media.url || '';
            item.appendChild(badge);
            item.appendChild(link);
            mediaUrlsContainer.appendChild(item);
        });
    } else {
        var empty = document.createElement('span');
        empty.className = 'text-muted small';
        empty.textContent = '暂无媒体链接';
        mediaUrlsContainer.appendChild(empty);
    }

    var audioSection = document.getElementById('videoDetailAudioSection');
    var audioUrlsContainer = document.getElementById('videoDetailAudioUrls');
    var downloadAudioBtn = document.getElementById('downloadAudioFromDetail');
    var bgmUrl = video.bgm_url || video.music;
    if (bgmUrl) {
        var proxiedBgmUrl = proxyUrl(bgmUrl);
        if (audioSection) audioSection.style.display = '';
        if (downloadAudioBtn) downloadAudioBtn.style.display = 'inline-block';
        if (audioUrlsContainer) {
            audioUrlsContainer.textContent = '';
            var aud = document.createElement('audio'); aud.controls = true;
            var src = document.createElement('source'); src.src = proxiedBgmUrl; src.type = 'audio/mpeg';
            aud.appendChild(src); audioUrlsContainer.appendChild(aud);
            var al = document.createElement('a'); al.href = proxiedBgmUrl; al.target = '_blank'; al.className = 'video-detail-audio-link'; al.textContent = bgmUrl;
            audioUrlsContainer.appendChild(al);
        }
        if (downloadAudioBtn) downloadAudioBtn.setAttribute('data-bgm-url', proxiedBgmUrl);
    } else {
        if (audioSection) audioSection.style.display = 'none';
        if (downloadAudioBtn) downloadAudioBtn.style.display = 'none';
    }

    setupMediaPreview(video);
    setupMediaPreviewControls(video);
    document.getElementById('downloadVideoFromDetail').setAttribute('data-aweme-id', awemeId);
    document.getElementById('downloadVideoFromDetail').setAttribute('data-desc', video.desc || '视频');
    document.getElementById('downloadVideoFromDetail').setAttribute('data-media-urls', JSON.stringify(video.media_urls || []));
    document.getElementById('downloadVideoFromDetail').setAttribute('data-media-type', video.raw_media_type || video.media_type || 'video');

    var modalElement = document.getElementById('videoDetailModal');
    if (!modalElement._detailInited) {
        modalElement._detailInited = true;
        modalElement.addEventListener('shown.bs.modal', function () { modalElement.removeAttribute('aria-hidden'); });
        modalElement.addEventListener('hidden.bs.modal', function () { modalElement.setAttribute('aria-hidden', 'true'); document.getElementById('videoDetailPlayer').pause(); });
    }
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

async function downloadVideoFromDetail() {
    var btn = document.getElementById('downloadVideoFromDetail');
    var awemeId = btn.getAttribute('data-aweme-id');
    if (!awemeId) { showToast('无法获取作品ID', 'error'); return; }
    try {
        var storedVideo = VideoStorage.getVideo(awemeId);
        var fvd = storedVideo
            ? { aweme_id: awemeId, desc: storedVideo.desc || btn.getAttribute('data-desc'), media_urls: storedVideo.media_urls || [], raw_media_type: storedVideo.raw_media_type || storedVideo.media_type || btn.getAttribute('data-media-type'), author_name: storedVideo.author ? storedVideo.author.nickname : '未知作者' }
            : { aweme_id: awemeId, desc: btn.getAttribute('data-desc'), media_urls: JSON.parse(btn.getAttribute('data-media-urls') || '[]'), raw_media_type: btn.getAttribute('data-media-type'), author_name: '未知作者' };
        fvd.media_urls = normalizeMediaUrlsForDownload(fvd.media_urls, fvd.raw_media_type);
        if (!fvd.media_urls || fvd.media_urls.length === 0) { showToast('没有可下载的媒体链接', 'error'); return; }
        var response = await fetch('/api/download_single_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fvd) });
        var result = await response.json();
        if (result.success) showToast('下载任务已启动: ' + fvd.desc, 'success');
        else showToast('下载启动失败: ' + result.message, 'error');
    } catch (error) { showToast('下载请求失败', 'error'); }
}

async function downloadAudioFromDetail() {
    var bgmUrl = document.getElementById('downloadAudioFromDetail').getAttribute('data-bgm-url');
    if (!bgmUrl) { showToast('没有可下载的音频', 'error'); return; }
    window.open(bgmUrl, '_blank');
    showToast('音频将在新标签页打开，请右键保存', 'info');
}

// ═══════════════════════════════════════════════
// LIKED VIDEOS / AUTHORS
// ═══════════════════════════════════════════════
async function downloadLikedVideos() {
    try {
        setButtonLoading('download-liked-btn', true, '获取中');
        var count = document.getElementById('liked-videos-count').value || 20;
        var response = await fetch('/api/get_liked_videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: parseInt(count) }) });
        var result = await response.json();
        if (result.success) {
            isHomeView = false; hideAllSections();
            displayLikedVideos(result.data);
            LikedDataCache.saveLikedVideos(result.data, result.data.length);
            LikedDataCache.currentDisplayType = 'videos';
            showToast('获取到 ' + result.data.length + ' 个点赞视频', 'success');
        } else { if (!isHomeView) showToast(result.message, 'error'); }
    } catch (error) { if (!isHomeView) showToast('获取点赞视频失败', 'error'); }
    finally { setButtonLoading('download-liked-btn', false); }
}

async function downloadLikedAuthors() {
    try {
        setButtonLoading('download-liked-authors-btn', true, '获取中');
        var count = document.getElementById('liked-authors-count').value || 20;
        var response = await fetch('/api/get_liked_authors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: parseInt(count) }) });
        var result = await response.json();
        if (result.success) {
            isHomeView = false; hideAllSections();
            displayLikedAuthors(result.data);
            LikedDataCache.saveLikedAuthors(result.data, result.data.length);
            LikedDataCache.currentDisplayType = 'authors';
            showToast('获取到 ' + result.data.length + ' 个点赞作者', 'success');
        } else { if (!isHomeView) showToast(result.message, 'error'); }
    } catch (error) { if (!isHomeView) showToast('获取点赞作者失败', 'error'); }
    finally { setButtonLoading('download-liked-authors-btn', false); }
}

function displayLikedVideos(videos) {
    var section = document.getElementById('likedVideosSection');
    var videosList = document.getElementById('likedVideosList');
    videosList.innerHTML = '';
    document.getElementById('likedVideoCount').textContent = videos.length + ' 个视频';
    window.currentVideos = videos;
    videos.forEach(function(v) { VideoStorage.saveVideo(v); });
    videos.forEach(function(video) {
        var coverUrl = video.cover_url || '/static/default-cover.svg';
        var createTime = new Date(video.create_time * 1000).toLocaleDateString();
        var mediaType = video.media_type === 'image' ? (video.image_count > 1 ? '图集' : '图片') : '视频';
        var duration = video.duration > 0 ? formatDuration(video.duration) : '';
        var diggCount = video.digg_count != null ? video.digg_count : (video.statistics?.digg_count || 0);
        var commentCount = video.comment_count != null ? video.comment_count : (video.statistics?.comment_count || 0);
        var shareCount = video.share_count != null ? video.share_count : (video.statistics?.share_count || 0);
        var vc = document.createElement('div');
        vc.className = 'col-md-3 col-sm-6 mb-3';
        vc.innerHTML = '<div class="card h-100 video-card">' +
            '<div class="position-relative video-cover-container" onclick="previewMediaFromList(\'' + video.aweme_id + '\')">' +
            '<img src="' + coverUrl + '" class="card-img-top video-cover" alt="封面" onerror="this.src=\'/static/default-cover.svg\'">' +
            '<i class="bi bi-play-circle-fill video-play-icon"></i>' +
            '<div class="video-overlay"><div class="video-stats">' +
            '<div class="stat-item"><i class="bi bi-heart-fill"></i><span>' + formatNumber(diggCount) + '</span></div>' +
            '<div class="stat-item"><i class="bi bi-chat-fill"></i><span>' + formatNumber(commentCount) + '</span></div>' +
            '<div class="stat-item"><i class="bi bi-share-fill"></i><span>' + formatNumber(shareCount) + '</span></div>' +
            '</div></div>' +
            '<span class="badge bg-primary position-absolute top-0 end-0 m-2">' + mediaType + '</span>' +
            (duration ? '<span class="badge bg-dark position-absolute bottom-0 start-0 m-2">' + duration + '</span>' : '') +
            '</div><div class="card-body video-card-body">' +
            '<p class="card-text video-desc">' + escapeHtml(video.desc || '无描述') + '</p>' +
            '<div class="text-muted small video-date">' + createTime + '</div>' +
            '<div class="video-actions">' +
            '<button class="btn btn-sm btn-outline-primary video-btn" onclick="downloadVideoFromList(\'' + video.aweme_id + '\')"><i class="bi bi-download"></i></button>' +
            '<button class="btn btn-sm btn-outline-info video-btn" onclick="showVideoDetail(\'' + video.aweme_id + '\')"><i class="bi bi-eye"></i></button>' +
            '<button class="btn btn-sm btn-outline-success video-btn" onclick="event.stopPropagation();previewMediaFromList(\'' + video.aweme_id + '\')"><i class="bi bi-play-circle"></i></button>' +
            '<button class="btn btn-sm btn-outline-warning video-btn" onclick="event.stopPropagation();goToAuthorPage(\'' + (video.author?.sec_uid || video.sec_uid) + '\',\'' + (video.author?.nickname || video.nickname) + '\')"><i class="bi bi-person-circle"></i></button>' +
            '</div></div></div>';
        videosList.appendChild(vc);
    });
    section.style.display = 'block';
    _hideEmptyState();
}

function displayLikedAuthors(authors) {
    var section = document.getElementById('likedAuthorsSection');
    var authorsList = document.getElementById('likedAuthorsList');
    authorsList.innerHTML = '';
    document.getElementById('likedAuthorCount').textContent = authors.length + ' 个作者';
    window.currentAuthors = authors;
    authors.forEach(function(author) {
        var ac = document.createElement('div');
        ac.className = 'col-md-4 col-sm-6 mb-3';
        ac.innerHTML = '<div class="card h-100 author-card"><div class="card-body author-card-body">' +
            '<div class="d-flex align-items-center mb-2">' +
            '<img src="' + (author.avatar_thumb || '/static/default-avatar.svg') + '" class="rounded-circle me-3" style="width:50px;height:50px;object-fit:cover;" onerror="this.src=\'/static/default-avatar.svg\'">' +
            '<div class="flex-grow-1"><h6 class="mb-0 text-truncate">' + escapeHtml(author.nickname) + '</h6>' +
            '<small class="text-muted">@' + (author.unique_id || author.sec_uid) + '</small></div></div>' +
            '<p class="card-text author-desc">' + escapeHtml(author.signature || '暂无签名') + '</p>' +
            '<div class="row text-center author-stats">' +
            '<div class="col-3"><small class="text-muted">作品</small><span class="small">' + formatNumber(author.aweme_count || 0) + '</span></div>' +
            '<div class="col-3"><small class="text-muted">粉丝</small><span class="small">' + formatNumber(author.follower_count || 0) + '</span></div>' +
            '<div class="col-3"><small class="text-muted">关注</small><span class="small">' + formatNumber(author.following_count || 0) + '</span></div>' +
            '<div class="col-3"><small class="text-muted">获赞</small><span class="small">' + formatNumber(author.total_favorited || 0) + '</span></div></div>' +
            '<div class="author-actions">' +
            '<button class="btn btn-sm btn-outline-primary author-btn" onclick="downloadAuthorVideos(\'' + author.sec_uid + '\')"><i class="bi bi-download"></i></button>' +
            '<button class="btn btn-sm btn-outline-info author-btn" onclick="loadAuthorVideos(\'' + author.sec_uid + '\')"><i class="bi bi-eye"></i></button>' +
            '</div></div></div>';
        authorsList.appendChild(ac);
    });
    section.style.display = 'block';
    _hideEmptyState();
}

async function downloadAllLikedAuthors() {
    if (!window.currentAuthors || window.currentAuthors.length === 0) { showToast('没有可下载的点赞作者', 'warning'); return; }
    var authors = window.currentAuthors, total = authors.length;
    var batchId = 'batch_liked_authors_' + Date.now();
    createDownloadProgressElement(batchId, '顺序下载点赞作者视频 (' + total + '个作者)');
    var ok = 0, fail = 0, done = 0;
    for (var i = 0; i < authors.length; i++) {
        try {
            var r = await downloadAuthorAndWait(authors[i].sec_uid, authors[i].nickname);
            r.success ? ok++ : fail++;
        } catch (e) { fail++; }
        done++;
        updateDownloadProgress(Math.round(done / total * 100), done, total, batchId);
        if (i < authors.length - 1) await new Promise(function(res) { setTimeout(res, 2000); });
    }
    updateDownloadProgress(100, total, total, batchId);
    showToast('完成！成功: ' + ok + ', 失败: ' + fail, ok > 0 ? 'success' : 'warning');
    setTimeout(function() { removeProgressElement(batchId); }, 3000);
}

async function downloadAuthorAndWait(secUid, nickname) {
    return new Promise(async function(resolve) {
        try {
            var resp = await fetch('/api/download_user_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' }) });
            var result = await resp.json();
            if (!result.success) { resolve({ success: false }); return; }
            var taskId = result.task_id;
            if (!taskId) { resolve({ success: false }); return; }
            createDownloadProgressElement(taskId, nickname + ' 的视频');
            var onDone = function(d) { if (d.task_id === taskId) { socket.off('download_completed', onDone); socket.off('download_error', onErr); resolve({ success: true }); } };
            var onErr = function(d) { if (d.task_id === taskId) { socket.off('download_completed', onDone); socket.off('download_error', onErr); resolve({ success: false }); } };
            socket.on('download_completed', onDone);
            socket.on('download_error', onErr);
            setTimeout(function() { socket.off('download_completed', onDone); socket.off('download_error', onErr); resolve({ success: false }); }, 30 * 60 * 1000);
        } catch (e) { resolve({ success: false }); }
    });
}

async function downloadAllLikedVideos() {
    if (!window.currentVideos || window.currentVideos.length === 0) { showToast('没有可下载的点赞视频', 'warning'); return; }
    var videos = window.currentVideos, total = videos.length;
    var batchId = 'batch_liked_videos_' + Date.now();
    createDownloadProgressElement(batchId, '批量下载点赞视频 (' + total + '个)');
    var ok = 0, fail = 0, done = 0;
    for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        var vd = { aweme_id: v.aweme_id, desc: v.desc || '点赞视频_' + (i + 1), media_urls: v.media_urls || [], raw_media_type: v.raw_media_type || v.media_type || 'video', author_name: v.author ? v.author.nickname : '未知作者' };
        vd.media_urls = normalizeMediaUrlsForDownload(vd.media_urls, vd.raw_media_type);
        if (!vd.media_urls.length) { fail++; done++; continue; }
        try {
            var r = await fetch('/api/download_single_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vd) });
            var res = await r.json();
            res.success ? ok++ : fail++;
        } catch (e) { fail++; }
        done++;
        updateDownloadProgress(Math.round(done / total * 100), done, total, batchId);
        if (i < videos.length - 1) await new Promise(function(res) { setTimeout(res, 500); });
    }
    updateDownloadProgress(100, total, total, batchId);
    showToast('完成！成功: ' + ok + ', 失败: ' + fail, ok > 0 ? 'success' : 'warning');
    setTimeout(function() { removeProgressElement(batchId); }, 3000);
}

function downloadAuthorVideos(secUid) { downloadUserVideos(secUid); }

function loadAuthorVideos(secUid) {
    hideAllSections();
    fetch('/api/user_detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid }) })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data.success) { currentUser = data.user; showUserDetail(data.user); loadUserVideos(); } else showToast(data.message, 'error'); })
    .catch(function() { showToast('获取作者详情失败', 'error'); });
}

async function handleLikedVideosClick() {
    var s = document.getElementById('likedVideosSection');
    if ((s && s.style.display === 'block') || LikedDataCache.currentDisplayType === 'videos') { await downloadLikedVideos(); return; }
    var cached = LikedDataCache.getLikedVideos();
    if (cached && cached.data && cached.data.length > 0) { hideAllSections(true); displayLikedVideos(cached.data); LikedDataCache.currentDisplayType = 'videos'; showToast('显示缓存的 ' + cached.data.length + ' 个点赞视频', 'info'); }
    else await downloadLikedVideos();
}

async function handleLikedAuthorsClick() {
    var s = document.getElementById('likedAuthorsSection');
    if ((s && s.style.display === 'block') || LikedDataCache.currentDisplayType === 'authors') { await downloadLikedAuthors(); return; }
    var cached = LikedDataCache.getLikedAuthors();
    if (cached && cached.data && cached.data.length > 0) { hideAllSections(true); displayLikedAuthors(cached.data); LikedDataCache.currentDisplayType = 'authors'; showToast('显示缓存的 ' + cached.data.length + ' 个点赞作者', 'info'); }
    else await downloadLikedAuthors();
}

// ═══════════════════════════════════════════════
// GO TO AUTHOR PAGE
// ═══════════════════════════════════════════════
async function goToAuthorPage(secUid, nickname) {
    if (!secUid) { showToast('无法获取作者信息', 'error'); return; }
    hideAllSections();
    updateStatus('running', '获取作者信息中');
    try {
        var response = await fetch('/api/user_detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sec_uid: secUid, nickname: nickname || '' }) });
        var result = await response.json();
        if (result.success) { currentUser = result.user; showUserDetail(result.user); showToast('已切换到 ' + result.user.nickname + ' 的主页', 'success'); }
        else showToast(result.message || '获取作者信息失败', 'error');
    } catch (error) { showToast('获取作者信息失败', 'error'); }
    finally { updateStatus('ready', '就绪'); }
}

// ═══════════════════════════════════════════════
// Unified Player Entry for User Works
// ═══════════════════════════════════════════════

function openUnifiedPlayerFromUserWorks(awemeId) {
    if (!window.currentVideos || window.currentVideos.length === 0) {
        showToast('未找到视频列表', 'error');
        return;
    }

    const index = window.currentVideos.findIndex(v => v.aweme_id === awemeId);
    if (index === -1) {
        showToast('未找到视频', 'error');
        return;
    }

    // 转换数据格式以匹配统一播放器的要求
    const formattedVideos = window.currentVideos.map(v => ({
        aweme_id: v.aweme_id,
        desc: v.desc,
        author: v.author,
        create_time: v.create_time,
        statistics: {
            digg_count: v.digg_count || 0,
            comment_count: v.comment_count || 0,
            share_count: v.share_count || 0
        },
        video: {
            play_addr: v.media_urls && v.media_urls[0] ? v.media_urls[0] : null,
            cover: v.cover_url,
            duration: v.duration || 0,
            images: v.media_urls ? v.media_urls.filter((url, idx) => idx > 0 && v.media_type === 'image') : []
        },
        music: {
            title: v.music_title || '原声',
            play_url: v.music_url
        },
        bgm_url: v.music_url
    }));

    // 设置统一播放器状态
    if (typeof unifiedPlayerState !== 'undefined') {
        unifiedPlayerState = {
            currentIndex: index,
            isOpen: true,
            videos: formattedVideos,
            currentVideo: formattedVideos[index],
            videoElement: null,
            isMuted: false,
            volume: 1.0,
            playbackRate: 1.0,
            source: 'user-works'
        };

        const player = document.getElementById('unifiedPlayer');
        if (player) {
            player.style.display = 'flex';
        }

        if (typeof renderUnifiedCurrentVideo === 'function') {
            renderUnifiedCurrentVideo();
        }
        if (typeof setupUnifiedPlayerGestures === 'function') {
            setupUnifiedPlayerGestures();
        }
    } else {
        showToast('播放器未初始化', 'error');
    }
}
