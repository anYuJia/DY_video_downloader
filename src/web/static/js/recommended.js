// ═══════════════════════════════════════════════
// RECOMMENDED FEED - 推荐视频流 (抖音风格全屏播放)
// ═══════════════════════════════════════════════

console.log('[recommended.js] 文件已加载');

let recommendedVideos = [];
let recommendedCursor = 0;
let hasMoreRecommended = false;

// 全屏播放器状态
let currentPlayerIndex = 0;
let isPlayerOpen = false;
let touchStartY = 0;
let touchEndY = 0;
let isTransitioning = false;  // 防止快速滑动
let lastScrollTime = 0;       // 滚动防抖
let isLoadingMore = false;    // 是否正在加载更多
let currentVideoElement = null; // 当前视频元素引用
let isInitializing = false;   // 是否正在初始化（新增：防止重复点击）

// 智能预加载配置
const PRELOAD_THRESHOLD = 10;  // 剩余视频少于10条时预加载
const INITIAL_LOAD_COUNT = 20; // 首次加载数量
const LOAD_MORE_COUNT = 20;    // 每次加载更多数量

async function showRecommendedFeed() {
    console.log('[showRecommendedFeed] 显示推荐视频界面');

    // 防止重复点击：检查是否正在初始化或加载中
    if (isInitializing) {
        console.log('[showRecommendedFeed] 正在初始化中，跳过重复请求');
        showToast('正在加载中，请稍候...', 'info');
        return;
    }

    if (isLoadingMore) {
        console.log('[showRecommendedFeed] 正在加载中，跳过重复请求');
        showToast('正在加载中，请稍候...', 'info');
        return;
    }

    isInitializing = true;

    // 隐藏所有区域（包括主页）
    const sections = [
        'emptyState',  // 主页
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

    // 显示推荐视频区域
    const section = document.getElementById('recommendedFeedSection');
    section.style.display = 'block';
    console.log('[showRecommendedFeed] 区域显示状态:', section.style.display);

    // 如果已经有数据，直接显示，不需要重新加载
    if (recommendedVideos.length > 0) {
        console.log('[showRecommendedFeed] 使用已缓存的推荐视频数据，数量:', recommendedVideos.length);
        // 清空并重新显示所有视频
        document.getElementById('recommendedFeedList').textContent = '';
        displayRecommendedVideos(recommendedVideos);

        // 显示/隐藏加载更多按钮
        document.getElementById('loadMoreRecommended').style.display =
            hasMoreRecommended ? 'block' : 'none';
        isInitializing = false;  // 重置标志位
        return;
    }

    // 如果没有数据，加载视频
    console.log('[showRecommendedFeed] 无缓存数据，开始加载');
    recommendedVideos = [];
    recommendedCursor = 0;
    document.getElementById('recommendedFeedList').textContent = '';
    await loadRecommendedFeed(INITIAL_LOAD_COUNT);
    isInitializing = false;  // 加载完成后重置标志位
}

function closeRecommendedFeed() {
    document.getElementById('recommendedFeedSection').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    recommendedVideos = [];
    recommendedCursor = 0;
    isInitializing = false;  // 重置初始化标志
    isLoadingMore = false;   // 重置加载标志
}

async function loadRecommendedFeed(count = LOAD_MORE_COUNT) {
    // 防止重复加载
    if (isLoadingMore) {
        console.log('[loadRecommendedFeed] 正在加载中，跳过');
        return;
    }

    try {
        isLoadingMore = true;
        console.log('[loadRecommendedFeed] 开始请求 API, count:', count);
        updateStatus('working', '加载中...');

        const response = await fetch('/api/recommended_feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: count,
                cursor: recommendedCursor
            })
        });

        const data = await response.json();
        console.log('[loadRecommendedFeed] API 响应:', data.success, '视频数:', data.videos?.length);

        if (data.success) {
            const previousCount = recommendedVideos.length;
            const newVideos = data.videos || [];

            // 合并新视频 - 使用push保持数组引用
            newVideos.forEach(v => recommendedVideos.push(v));
            recommendedCursor = data.cursor;
            hasMoreRecommended = data.has_more;

            console.log('[loadRecommendedFeed] 总视频数:', recommendedVideos.length, '新增:', newVideos.length);

            // 如果播放器打开，更新播放器状态中的视频列表引用
            if (unifiedPlayerState.isOpen && unifiedPlayerState.source === 'recommended') {
                console.log('[loadRecommendedFeed] 播放器打开中，视频列表已自动更新，新总数:', unifiedPlayerState.videos.length);
            }

            // 只有在推荐视频界面可见时才显示卡片
            const section = document.getElementById('recommendedFeedSection');
            if (section && section.style.display === 'block' && !isPlayerOpen) {
                displayRecommendedVideos(newVideos);

                // 显示/隐藏加载更多按钮
                document.getElementById('loadMoreRecommended').style.display =
                    hasMoreRecommended ? 'block' : 'none';
            } else {
                console.log('[loadRecommendedFeed] 界面不可见或播放器模式，数据已缓存');
            }

            updateStatus('ready', '就绪');
        } else {
            console.error('[loadRecommendedFeed] 失败:', data.message);
            showToast(data.message || '加载失败', 'error');
            updateStatus('ready', '就绪');
        }
    } catch (error) {
        console.error('[loadRecommendedFeed] 错误:', error);
        showToast('加载推荐视频失败', 'error');
        updateStatus('ready', '就绪');
    } finally {
        isLoadingMore = false;
        // 重置连续下滑计数
        window.continuousScrollCount = 0;
    }
}

async function refreshRecommendedFeed() {
    recommendedVideos = [];
    recommendedCursor = 0;
    document.getElementById('recommendedFeedList').textContent = '';
    await loadRecommendedFeed(INITIAL_LOAD_COUNT);
}

async function loadMoreRecommendedFeed() {
    await loadRecommendedFeed(LOAD_MORE_COUNT);
}

function displayRecommendedVideos(videos) {
    const container = document.getElementById('recommendedFeedList');
    videos.forEach(video => {
        container.appendChild(createRecommendedVideoCard(video));
    });
}

function createRecommendedVideoCard(video) {
    const stats = video.statistics || {};
    const author = video.author || {};
    const videoData = video.video || {};
    const coverUrl = videoData.cover || '/static/default-cover.svg';
    const createTime = video.create_time ? new Date(video.create_time * 1000).toLocaleDateString() : '';
    const duration = videoData.duration > 0 ? formatDuration(videoData.duration / 1000) : '';

    const col = document.createElement('div');
    col.className = 'col-md-3 col-sm-6 mb-3';

    col.innerHTML =
        '<div class="card h-100 video-card" data-aweme-id="' + video.aweme_id + '">' +
        '<div class="position-relative video-cover-container" onclick="openUnifiedPlayer(\'' + video.aweme_id + '\')">' +
        '<img src="' + coverUrl + '" class="card-img-top video-cover" alt="封面" loading="lazy" onerror="this.src=\'/static/default-cover.svg\'">' +
        '<i class="bi bi-play-circle-fill video-play-icon"></i>' +
        '<div class="video-overlay"><div class="video-stats">' +
        '<div class="stat-item"><i class="bi bi-heart-fill"></i><span>' + formatNumber(stats.digg_count || 0) + '</span></div>' +
        '<div class="stat-item"><i class="bi bi-chat-fill"></i><span>' + formatNumber(stats.comment_count || 0) + '</span></div>' +
        '<div class="stat-item"><i class="bi bi-share-fill"></i><span>' + formatNumber(stats.share_count || 0) + '</span></div>' +
        '</div></div>' +
        (duration ? '<span class="badge bg-dark position-absolute bottom-0 start-0 m-2">' + duration + '</span>' : '') +
        '</div>' +
        '<div class="card-body video-card-body">' +
        '<p class="card-text video-desc">' + escapeHtml(video.desc || '无描述') + '</p>' +
        (author.nickname ? '<div class="text-muted small"><i class="bi bi-person-circle me-1"></i>' + escapeHtml(author.nickname) + '</div>' : '') +
        (createTime ? '<div class="text-muted small video-date">' + createTime + '</div>' : '') +
        '<div class="video-actions">' +
        '<button class="btn btn-sm btn-outline-primary video-btn" onclick="event.stopPropagation();downloadRecommendedVideo(\'' + video.aweme_id + '\')"><i class="bi bi-download"></i></button>' +
        '<button class="btn btn-sm btn-outline-success video-btn" onclick="event.stopPropagation();openUnifiedPlayer(\'' + video.aweme_id + '\')"><i class="bi bi-play-circle"></i></button>' +
        '</div></div></div>';

    return col;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════
// FULLSCREEN PLAYER - 全屏播放器
// ═══════════════════════════════════════════════

function openFullscreenPlayer(awemeId) {
    console.log('[openFullscreenPlayer] 打开播放器, awemeId:', awemeId);
    const index = recommendedVideos.findIndex(v => v.aweme_id === awemeId);
    console.log('[openFullscreenPlayer] 找到索引:', index, '总视频数:', recommendedVideos.length);

    if (index === -1) {
        console.error('[openFullscreenPlayer] 未找到视频');
        return;
    }

    currentPlayerIndex = index;
    isPlayerOpen = true;

    const player = document.getElementById('fullscreenPlayer');
    console.log('[openFullscreenPlayer] 播放器元素:', player);
    player.style.display = 'flex';

    renderCurrentVideo();
    setupPlayerGestures();
}

function closeFullscreenPlayer() {
    isPlayerOpen = false;

    // 停止并清理当前视频
    if (currentVideoElement) {
        currentVideoElement.pause();
        currentVideoElement.src = '';
        currentVideoElement.load();
        currentVideoElement = null;
    }

    // 清空视频容器
    const wrapper = document.getElementById('videoSlidesWrapper');
    if (wrapper) {
        wrapper.innerHTML = '';
    }

    document.getElementById('fullscreenPlayer').style.display = 'none';

    // 确保列表页面显示所有已加载的视频
    syncListWithLoadedVideos();
}

// 同步列表页面显示所有已加载的视频
function syncListWithLoadedVideos() {
    const container = document.getElementById('recommendedFeedList');
    if (!container) return;

    const existingCardCount = container.children.length;
    const loadedVideoCount = recommendedVideos.length;

    console.log('[syncListWithLoadedVideos] 列表现有卡片:', existingCardCount, '已加载视频:', loadedVideoCount);

    if (loadedVideoCount > existingCardCount) {
        // 添加缺失的视频卡片
        const missingVideos = recommendedVideos.slice(existingCardCount);
        console.log('[syncListWithLoadedVideos] 添加缺失视频:', missingVideos.length, '个');
        displayRecommendedVideos(missingVideos);
    }
}

function renderCurrentVideo() {
    console.log('[renderCurrentVideo] 开始渲染, 当前索引:', currentPlayerIndex);

    // 先停止并清理当前视频
    if (currentVideoElement) {
        console.log('[renderCurrentVideo] 清理旧视频');
        currentVideoElement.pause();
        currentVideoElement.src = '';
        currentVideoElement.load();
        currentVideoElement = null;
    }

    const wrapper = document.getElementById('videoSlidesWrapper');
    if (!wrapper) {
        console.error('[renderCurrentVideo] 未找到 videoSlidesWrapper');
        return;
    }

    // 清空所有内容
    wrapper.innerHTML = '';

    // 只渲染当前视频（不预加载）
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) {
        console.error('[renderCurrentVideo] 未找到视频');
        return;
    }

    console.log(`[renderCurrentVideo] 渲染视频 ${currentPlayerIndex}:`, video.aweme_id);
    const slide = createVideoSlide(video, currentPlayerIndex);
    wrapper.appendChild(slide);

    // 更新播放器位置
    updatePlayerPosition();

    // 延迟播放，确保DOM已更新
    setTimeout(() => {
        playCurrentVideo();
    }, 150);

    // 更新信息
    updatePlayerInfo();
}

function createVideoSlide(video, index) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.index = index;

    const videoData = video.video || {};
    const posterUrl = videoData.cover || videoData.dynamic_cover || '';

    console.log(`[createVideoSlide] 视频 ${index}:`, {
        aweme_id: video.aweme_id,
        posterUrl: posterUrl ? posterUrl.substring(0, 80) + '...' : '无',
        playAddr: videoData.play_addr ? videoData.play_addr.substring(0, 80) + '...' : '无'
    });

    // 封面图
    if (posterUrl) {
        const poster = document.createElement('img');
        poster.className = 'video-poster';
        poster.src = proxyUrl(posterUrl);  // 使用代理
        poster.alt = '封面';
        poster.onerror = () => {
            console.error('封面加载失败:', posterUrl.substring(0, 100));
        };
        slide.appendChild(poster);
    }

    // 视频元素
    const videoEl = document.createElement('video');
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    videoEl.poster = posterUrl ? proxyUrl(posterUrl) : '';

    const playAddr = videoData.play_addr || '';
    if (playAddr) {
        videoEl.src = proxyUrl(playAddr);  // 使用代理
    } else {
        console.warn(`视频 ${video.aweme_id} 没有播放地址`);
    }

    videoEl.onclick = () => toggleVideoPlay(videoEl);
    videoEl.onerror = (e) => {
        console.error('[createVideoSlide] 视频加载失败:', e);
        console.error('[createVideoSlide] 视频src:', videoEl.src);
    };

    videoEl.onloadedmetadata = () => {
        console.log(`[createVideoSlide] 视频 ${index} 元数据已加载, duration: ${videoEl.duration}`);
    };

    videoEl.onloadeddata = () => {
        console.log(`[createVideoSlide] 视频 ${index} 数据已加载`);
    };

    videoEl.oncanplay = () => {
        console.log(`[createVideoSlide] 视频 ${index} 可以播放`);
    };

    slide.appendChild(videoEl);

    console.log(`[createVideoSlide] 视频 ${index} 元素已添加到slide`);
    console.log(`[createVideoSlide] slide内容:`, slide.innerHTML.substring(0, 200));

    return slide;
}

function updatePlayerPosition() {
    // 现在只有一个slide，不需要位置更新
    console.log('[updatePlayerPosition] 单个slide，无需位置更新');
}

function playCurrentVideo() {
    console.log('[playCurrentVideo] 尝试播放视频，索引:', currentPlayerIndex);
    const currentSlide = document.querySelector(`.video-slide[data-index="${currentPlayerIndex}"]`);
    if (!currentSlide) {
        console.error('[playCurrentVideo] 未找到当前幻灯片');
        return;
    }

    const video = currentSlide.querySelector('video');
    if (!video) {
        console.error('[playCurrentVideo] 未找到视频元素');
        return;
    }

    console.log('[playCurrentVideo] 视频src:', video.src ? video.src.substring(0, 100) : '无');
    console.log('[playCurrentVideo] 视频readyState:', video.readyState);

    // 更新当前视频元素引用
    currentVideoElement = video;

    // 如果视频还没加载好，等待加载
    if (video.readyState < 2) {
        console.log('[playCurrentVideo] 视频未加载，等待...');
        video.addEventListener('loadeddata', () => {
            console.log('[playCurrentVideo] 视频加载完成，开始播放');
            startVideoPlayback(video, currentSlide);
        }, { once: true });

        video.addEventListener('error', (e) => {
            console.error('[playCurrentVideo] 视频加载失败:', e);
        }, { once: true });
    } else {
        startVideoPlayback(video, currentSlide);
    }
}

function startVideoPlayback(video, slide) {
    console.log('[startVideoPlayback] 开始播放');
    console.log('[startVideoPlayback] video元素:', video);
    console.log('[startVideoPlayback] slide元素:', slide);

    const poster = slide.querySelector('.video-poster');
    console.log('[startVideoPlayback] 封面元素:', poster);
    if (poster) {
        console.log('[startVideoPlayback] 封面当前display:', poster.style.display);
    }

    video.play().then(() => {
        console.log('[playCurrentVideo] 播放成功');
        // 播放成功，隐藏封面
        video.classList.add('playing');
        if (poster) {
            poster.style.display = 'none';
            console.log('[startVideoPlayback] 封面已隐藏，新display:', poster.style.display);
        }

        // 检查视频状态
        console.log('[startVideoPlayback] 视频paused:', video.paused);
        console.log('[startVideoPlayback] 视频currentTime:', video.currentTime);
        console.log('[startVideoPlayback] 视频duration:', video.duration);
        console.log('[startVideoPlayback] 视频videoWidth:', video.videoWidth);
        console.log('[startVideoPlayback] 视频videoHeight:', video.videoHeight);

        // 设置进度条更新
        setupVideoProgress(video);

        // 检查是否需要预加载更多视频
        checkAndLoadMore();
    }).catch(err => {
        console.error('[playCurrentVideo] 播放失败:', err);
    });
}

function setupVideoProgress(video) {
    const progressBar = document.getElementById('videoProgressBar');
    const progressFill = document.getElementById('videoProgressFill');
    const progressThumb = document.getElementById('videoProgressThumb');
    const currentTimeEl = document.getElementById('videoCurrentTime');
    const durationEl = document.getElementById('videoDuration');

    let isDragging = false;

    // 更新进度条
    video.addEventListener('timeupdate', () => {
        if (!isDragging) {
            const progress = (video.currentTime / video.duration) * 100;
            progressFill.style.width = progress + '%';
            progressThumb.style.left = progress + '%';
            currentTimeEl.textContent = formatVideoTime(video.currentTime);
        }
    });

    // 更新总时长
    video.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatVideoTime(video.duration);
    });

    // 辅助函数：根据鼠标位置计算进度
    function getProgressFromMouse(e) {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        return Math.max(0, Math.min(1, clickX / rect.width));
    }

    // 更新进度显示（拖动时）
    function updateProgressDisplay(progress) {
        progressFill.style.width = (progress * 100) + '%';
        progressThumb.style.left = (progress * 100) + '%';
        currentTimeEl.textContent = formatVideoTime(progress * video.duration);
    }

    // 鼠标按下
    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        const progress = getProgressFromMouse(e);
        updateProgressDisplay(progress);
        e.preventDefault();
    });

    // 鼠标移动
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const progress = getProgressFromMouse(e);
            updateProgressDisplay(progress);
        }
    });

    // 鼠标释放
    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            const progress = getProgressFromMouse(e);
            video.currentTime = progress * video.duration;
        }
    });

    // 触摸支持
    progressBar.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const clickX = touch.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, clickX / rect.width));
        updateProgressDisplay(progress);
        e.preventDefault();
    });

    progressBar.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const touch = e.touches[0];
            const rect = progressBar.getBoundingClientRect();
            const clickX = touch.clientX - rect.left;
            const progress = Math.max(0, Math.min(1, clickX / rect.width));
            updateProgressDisplay(progress);
        }
    });

    progressBar.addEventListener('touchend', (e) => {
        if (isDragging) {
            isDragging = false;
            const progress = parseFloat(progressFill.style.width) / 100;
            video.currentTime = progress * video.duration;
        }
    });
}

function formatVideoTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function checkAndLoadMore() {
    // 计算剩余视频数量
    const remainingVideos = recommendedVideos.length - currentPlayerIndex - 1;
    console.log('[checkAndLoadMore] 剩余视频数量:', remainingVideos, '当前索引:', currentPlayerIndex, '总数:', recommendedVideos.length);

    // 如果剩余视频少于阈值，预加载更多
    if (remainingVideos < PRELOAD_THRESHOLD && hasMoreRecommended && !isLoadingMore) {
        console.log('[checkAndLoadMore] 剩余视频不足，开始预加载');
        loadRecommendedFeedAndSyncList();
    }
}

// 加载更多视频并同步更新列表页面
async function loadRecommendedFeedAndSyncList() {
    if (isLoadingMore) return;

    const previousCount = recommendedVideos.length;

    await loadRecommendedFeed(LOAD_MORE_COUNT);

    // 如果在播放器模式，需要同步更新列表页面
    if (isPlayerOpen && recommendedVideos.length > previousCount) {
        const newVideos = recommendedVideos.slice(previousCount);
        console.log('[loadRecommendedFeedAndSyncList] 同步更新列表，新增:', newVideos.length, '个视频');
        displayRecommendedVideos(newVideos);
    }
}

function toggleVideoPlay(videoEl) {
    const slide = videoEl.closest('.video-slide');
    const poster = slide ? slide.querySelector('.video-poster') : null;

    if (videoEl.paused) {
        videoEl.play().then(() => {
            videoEl.classList.add('playing');
            if (poster) {
                poster.style.display = 'none';
            }
        }).catch(err => {
            console.error('播放失败:', err);
        });
    } else {
        videoEl.pause();
        videoEl.classList.remove('playing');
        if (poster) {
            poster.style.display = 'block';
        }
    }
}

function updatePlayerInfo() {
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) return;

    const author = video.author || {};
    const stats = video.statistics || {};
    const music = video.music || {};

    // 更新计数
    document.getElementById('playerVideoCount').textContent =
        `${currentPlayerIndex + 1}/${recommendedVideos.length}`;

    // 更新作者头像
    const avatarEl = document.getElementById('playerAuthorAvatar');
    if (author.avatar_thumb) {
        avatarEl.innerHTML = `<img src="${author.avatar_thumb}" alt="${author.nickname}">`;
    } else {
        avatarEl.textContent = (author.nickname || '用户')[0];
    }

    // 更新作者名
    document.getElementById('playerAuthorName').textContent = `@${author.nickname || '用户'}`;

    // 更新描述
    document.getElementById('playerVideoDesc').textContent = video.desc || '无描述';

    // 更新统计
    document.getElementById('playerLikeCount').textContent = formatNumber(stats.digg_count || 0);
    document.getElementById('playerCommentCount').textContent = formatNumber(stats.comment_count || 0);
    document.getElementById('playerShareCount').textContent = formatNumber(stats.share_count || 0);

    // 更新音乐
    const musicInfo = music.title || '原声';
    document.getElementById('playerMusicInfo').textContent = musicInfo;
}

function setupPlayerGestures() {
    const container = document.getElementById('playerContainer');

    // 触摸事件
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    // 鼠标滚轮
    container.addEventListener('wheel', handleWheel, { passive: false });

    // 键盘事件
    document.addEventListener('keydown', handleKeyDown);
}

function handleTouchStart(e) {
    touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
    touchEndY = e.changedTouches[0].clientY;
    handleSwipe();
}

function handleSwipe() {
    // 防止切换过程中重复触发
    if (isTransitioning) {
        console.log('[handleSwipe] 正在切换中，忽略');
        return;
    }

    const swipeDistance = touchStartY - touchEndY;
    const minSwipeDistance = 50;

    if (Math.abs(swipeDistance) < minSwipeDistance) return;

    isTransitioning = true;

    if (swipeDistance > 0) {
        // 向上滑动 - 下一个视频
        playNextVideo();
    } else {
        // 向下滑动 - 上一个视频
        playPrevVideo();
    }

    // 500ms 后解锁
    setTimeout(() => {
        isTransitioning = false;
    }, 500);
}

function handleWheel(e) {
    e.preventDefault();

    // 防抖：500ms 内只响应一次
    const now = Date.now();
    if (now - lastScrollTime < 500) {
        return;
    }

    // 防止切换过程中重复触发
    if (isTransitioning) {
        return;
    }

    lastScrollTime = now;
    isTransitioning = true;

    if (e.deltaY > 0) {
        playNextVideo();
    } else {
        playPrevVideo();
    }

    // 500ms 后解锁
    setTimeout(() => {
        isTransitioning = false;
    }, 500);
}

function handleKeyDown(e) {
    if (!isPlayerOpen) return;

    switch (e.key) {
        case 'ArrowUp':
            playPrevVideo();
            break;
        case 'ArrowDown':
            playNextVideo();
            break;
        case 'Escape':
            closeFullscreenPlayer();
            break;
        case ' ':
            const currentVideo = document.querySelector(`.video-slide[data-index="${currentPlayerIndex}"] video`);
            if (currentVideo) {
                toggleVideoPlay(currentVideo);
            }
            e.preventDefault();
            break;
    }
}

function playNextVideo() {
    console.log('[playNextVideo] 当前索引:', currentPlayerIndex, '总数:', recommendedVideos.length);

    if (currentPlayerIndex < recommendedVideos.length - 1) {
        currentPlayerIndex++;
        console.log('[playNextVideo] 切换到下一个视频，新索引:', currentPlayerIndex);
        renderCurrentVideo();
    } else if (hasMoreRecommended) {
        console.log('[playNextVideo] 到达底部，加载更多视频');
        showToast('加载更多视频...', 'info');

        // 异步加载，加载成功后自动切换并同步列表
        const previousCount = recommendedVideos.length;
        loadRecommendedFeed(LOAD_MORE_COUNT).then(() => {
            // 同步更新列表页面
            if (recommendedVideos.length > previousCount) {
                const newVideos = recommendedVideos.slice(previousCount);
                console.log('[playNextVideo] 同步更新列表，新增:', newVideos.length, '个视频');
                displayRecommendedVideos(newVideos);
            }

            // 切换到下一个视频
            if (currentPlayerIndex < recommendedVideos.length - 1) {
                currentPlayerIndex++;
                renderCurrentVideo();
            } else {
                showToast('没有更多视频了', 'info');
            }
        });
    } else {
        console.log('[playNextVideo] 已经是最后一个视频');
        showToast('已经是最后一个视频', 'info');
    }
}

function playPrevVideo() {
    console.log('[playPrevVideo] 当前索引:', currentPlayerIndex);
    if (currentPlayerIndex > 0) {
        currentPlayerIndex--;
        console.log('[playPrevVideo] 切换到上一个视频，新索引:', currentPlayerIndex);
        renderCurrentVideo();
    } else {
        console.log('[playPrevVideo] 已经是第一个视频');
        showToast('已经是第一个视频', 'info');
    }
}

// ═══════════════════════════════════════════════
// PLAYER ACTIONS - 播放器操作
// ═══════════════════════════════════════════════

function likeCurrentVideo() {
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) return;
    showToast('点赞功能开发中...', 'info');
}

function commentCurrentVideo() {
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) return;
    showToast('评论功能开发中...', 'info');
}

function shareCurrentVideo() {
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) return;
    showToast('分享功能开发中...', 'info');
}

async function downloadCurrentVideo() {
    const video = recommendedVideos[currentPlayerIndex];
    if (!video) {
        showToast('视频信息不存在', 'error');
        return;
    }

    const videoData = video.video || {};
    const playAddr = videoData.play_addr;

    if (!playAddr) {
        showToast('无法获取视频下载地址', 'error');
        return;
    }

    try {
        showToast('添加到下载队列...', 'info');

        // 使用统一的下载接口，直接传入视频信息
        const response = await fetch('/api/download_single_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aweme_id: video.aweme_id,
                desc: video.desc || '视频',
                media_urls: [playAddr],  // 视频URL列表
                raw_media_type: 'video',
                author_name: video.author?.nickname || '未知作者'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('已添加到下载队列', 'success');
        } else {
            showToast(data.message || '下载失败', 'error');
        }
    } catch (error) {
        console.error('下载视频失败:', error);
        showToast('下载失败', 'error');
    }
}

async function downloadRecommendedVideo(awemeId) {
    const video = recommendedVideos.find(v => v.aweme_id === awemeId);
    if (!video) {
        showToast('视频信息不存在', 'error');
        return;
    }

    const videoData = video.video || {};
    const playAddr = videoData.play_addr;

    if (!playAddr) {
        showToast('无法获取视频下载地址', 'error');
        return;
    }

    // 添加到下载队列
    try {
        showToast('添加到下载队列...', 'info');

        // 使用统一的下载接口，直接传入视频信息
        const response = await fetch('/api/download_single_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aweme_id: awemeId,
                desc: video.desc || '视频',
                media_urls: [playAddr],  // 视频URL列表
                raw_media_type: 'video',
                author_name: video.author?.nickname || '未知作者'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('已添加到下载队列', 'success');
        } else {
            showToast(data.message || '下载失败', 'error');
        }
    } catch (error) {
        console.error('下载视频失败:', error);
        showToast('下载失败', 'error');
    }
}

// 格式化数字
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

// ═══════════════════════════════════════════════
// Unified Video Player Core Logic
// ═══════════════════════════════════════════════

let unifiedPlayerState = {
    currentIndex: 0,
    isOpen: false,
    videos: [],
    currentVideo: null,
    videoElement: null,
    isMuted: false,
    volume: 1.0,
    playbackRate: 1.0,
    source: 'recommended',
    mediaIndex: 0  // 当前作品内的媒体索引
};

// Volume Control
// Volume Control - 悬停显示
function setupHoverPanels() {
    // 音量面板
    const volumeGroup = document.getElementById('volumeControlGroup');
    const volumePanel = document.getElementById('volumePanel');

    if (volumeGroup && volumePanel) {
        let volumeTimeout;
        volumeGroup.addEventListener('mouseenter', () => {
            clearTimeout(volumeTimeout);
            volumePanel.style.display = 'flex';
        });
        volumeGroup.addEventListener('mouseleave', () => {
            volumeTimeout = setTimeout(() => {
                volumePanel.style.display = 'none';
            }, 100);
        });
    }

    // 倍率面板
    const rateGroup = document.getElementById('rateControlGroup');
    const ratePanel = document.getElementById('ratePanel');

    if (rateGroup && ratePanel) {
        let rateTimeout;
        rateGroup.addEventListener('mouseenter', () => {
            clearTimeout(rateTimeout);
            ratePanel.style.display = 'flex';
        });
        rateGroup.addEventListener('mouseleave', () => {
            rateTimeout = setTimeout(() => {
                ratePanel.style.display = 'none';
            }, 100);
        });
    }

    // 音乐面板
    const musicGroup = document.getElementById('musicControlGroup');
    const musicPanel = document.getElementById('playerMusicPanel');

    if (musicGroup && musicPanel) {
        let musicTimeout;
        musicGroup.addEventListener('mouseenter', () => {
            clearTimeout(musicTimeout);
            musicPanel.style.display = 'block';
        });
        musicGroup.addEventListener('mouseleave', () => {
            musicTimeout = setTimeout(() => {
                musicPanel.style.display = 'none';
            }, 100);
        });
    }
}

function setVolume(value) {
    const video = unifiedPlayerState.videoElement;
    if (video) {
        video.volume = value / 100;
        unifiedPlayerState.volume = value / 100;

        const icon = document.querySelector('#volumeBtn i');
        if (icon) {
            if (value == 0) {
                icon.className = 'bi bi-volume-mute-fill';
            } else if (value < 50) {
                icon.className = 'bi bi-volume-down-fill';
            } else {
                icon.className = 'bi bi-volume-up-fill';
            }
        }
    }
}

function toggleMute() {
    const video = unifiedPlayerState.videoElement;
    if (video) {
        video.muted = !video.muted;
        unifiedPlayerState.isMuted = video.muted;

        const slider = document.getElementById('volumeSlider');
        const icon = document.querySelector('#volumeBtn i');

        if (video.muted) {
            if (icon) icon.className = 'bi bi-volume-mute-fill';
            if (slider) slider.value = 0;
        } else {
            if (icon) icon.className = 'bi bi-volume-up-fill';
            if (slider) slider.value = unifiedPlayerState.volume * 100;
        }
    }
}

// Playback Rate Control
function setPlaybackRate(rate) {
    const video = unifiedPlayerState.videoElement;
    if (video) {
        video.playbackRate = rate;
        unifiedPlayerState.playbackRate = rate;

        const currentRateEl = document.getElementById('currentRate');
        if (currentRateEl) currentRateEl.textContent = rate + 'x';

        document.querySelectorAll('#ratePanel button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent === rate + 'x') {
                btn.classList.add('active');
            }
        });
    }
}

// Info Panel Toggle
function toggleInfoPanel() {
    const panel = document.getElementById('playerDetailPanel');
    if (!panel) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.add('show'), 10);
        renderDetailPanel();
    } else {
        panel.classList.remove('show');
        setTimeout(() => panel.style.display = 'none', 300);
    }
}

function renderDetailPanel() {
    const video = unifiedPlayerState.currentVideo;
    if (!video) return;

    const mediaContainer = document.getElementById('unifiedMediaUrls');
    if (!mediaContainer) return;

    mediaContainer.innerHTML = '';

    const videoData = video.video || {};
    const mediaUrls = [];

    // 添加视频URL
    if (videoData.play_addr) {
        mediaUrls.push({ type: 'video', url: videoData.play_addr });
    }

    // 添加图片URL
    if (videoData.images && videoData.images.length > 0) {
        videoData.images.forEach((img, idx) => {
            mediaUrls.push({ type: 'image', url: img });
        });
    }

    if (mediaUrls.length > 0) {
        mediaUrls.forEach((media, index) => {
            const item = document.createElement('div');
            item.className = 'media-link-item';

            const badge = document.createElement('span');
            badge.className = `badge ${media.type === 'video' ? 'bg-primary' : 'bg-success'}`;
            badge.textContent = media.type === 'video' ? '视频' : '图片';

            const link = document.createElement('a');
            link.href = media.url;
            link.target = '_blank';
            link.className = 'media-link';
            link.textContent = `媒体 ${index + 1}`;

            item.appendChild(badge);
            item.appendChild(link);
            mediaContainer.appendChild(item);
        });
    } else {
        mediaContainer.textContent = '暂无媒体链接';
        mediaContainer.className = 'text-muted small';
    }

    // Render audio/BGM
    const audioSection = document.getElementById('unifiedAudioSection');
    const audioContainer = document.getElementById('unifiedAudioUrls');
    const music = video.music || {};
    const bgmUrl = music.play_url || video.bgm_url;

    if (audioSection && audioContainer) {
        if (bgmUrl) {
            audioSection.style.display = 'block';
            audioContainer.innerHTML = `
                <audio controls src="${bgmUrl}" style="width: 100%; margin-bottom: 8px;"></audio>
                <a href="${bgmUrl}" target="_blank" class="btn btn-sm btn-outline-light">
                    <i class="bi bi-download"></i> 下载音频
                </a>
            `;
        } else {
            audioSection.style.display = 'none';
        }
    }
}

// Update unified player info
function updateUnifiedPlayerInfo() {
    const video = unifiedPlayerState.currentVideo;
    if (!video) return;

    const author = video.author || {};
    const stats = video.statistics || {};
    const music = video.music || {};

    const countEl = document.getElementById('unifiedVideoCount');
    if (countEl) {
        countEl.textContent = `${unifiedPlayerState.currentIndex + 1}/${unifiedPlayerState.videos.length}`;
    }

    const avatarSmallEl = document.getElementById('unifiedAuthorAvatarSmall');
    if (avatarSmallEl) {
        avatarSmallEl.src = author.avatar_thumb || '/static/default-avatar.svg';
    }

    const nameEl = document.getElementById('unifiedAuthorName');
    if (nameEl) {
        nameEl.textContent = `@${author.nickname || '用户'}`;
    }

    const descEl = document.getElementById('unifiedVideoDesc');
    if (descEl) {
        descEl.textContent = video.desc || '无描述';
    }

    const likeCount = formatNumber(stats.digg_count || 0);
    const commentCount = formatNumber(stats.comment_count || 0);
    const shareCount = formatNumber(stats.share_count || 0);

    // 更新底部点赞收藏按钮的计数
    const likeCountEl = document.getElementById('likeCount');
    const favoriteCountEl = document.getElementById('favoriteCount');

    if (likeCountEl) likeCountEl.textContent = likeCount;
    if (favoriteCountEl) favoriteCountEl.textContent = likeCount; // 收藏数暂时用点赞数

    // 重置点赞收藏状态
    const likeBtn = document.getElementById('likeBtn');
    const favoriteBtn = document.getElementById('favoriteBtn');

    if (likeBtn) likeBtn.classList.remove('liked');
    if (favoriteBtn) favoriteBtn.classList.remove('favorited');

    const musicEl = document.getElementById('unifiedMusicInfo');
    if (musicEl) {
        musicEl.textContent = music.title || '原声';
    }

    // 更新音乐面板信息
    const musicTitleEl = document.getElementById('unifiedMusicTitle');
    const musicAuthorEl = document.getElementById('unifiedMusicAuthor');
    const musicPlayerEl = document.getElementById('musicPlayer');
    const musicUnavailableHint = document.getElementById('musicUnavailableHint');
    const musicDownloadBtn = document.querySelector('.music-actions button');

    const musicUrl = music.play_url || video.bgm_url;

    if (musicTitleEl) {
        musicTitleEl.textContent = music.title || '背景音乐';
    }
    if (musicAuthorEl) {
        musicAuthorEl.textContent = music.author || '';
    }

    if (musicPlayerEl) {
        if (musicUrl) {
            musicPlayerEl.src = '/api/media/proxy?url=' + encodeURIComponent(musicUrl);
            musicPlayerEl.style.display = 'block';
        } else {
            musicPlayerEl.style.display = 'none';
        }
    }

    // 显示/隐藏不可用提示
    if (musicUnavailableHint) {
        musicUnavailableHint.style.display = musicUrl ? 'none' : 'block';
    }

    // 如果没有音乐URL，隐藏下载按钮
    if (musicDownloadBtn) {
        musicDownloadBtn.style.display = musicUrl ? 'inline-block' : 'none';
    }
}

// 下载音乐
function downloadMusic() {
    const video = unifiedPlayerState.currentVideo;
    if (!video) return;

    const music = video.music || {};
    const bgmUrl = music.play_url || video.bgm_url;

    if (!bgmUrl) {
        showToast('没有可下载的音乐', 'warning');
        return;
    }

    // 创建下载链接
    const link = document.createElement('a');
    link.href = '/api/media/proxy?url=' + encodeURIComponent(bgmUrl);
    link.download = `music_${video.aweme_id}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('开始下载音乐', 'success');
}

// 切换点赞状态
function toggleLike() {
    const likeBtn = document.getElementById('likeBtn');
    const likeCountEl = document.getElementById('likeCount');

    if (!likeBtn || !likeCountEl) return;

    const isLiked = likeBtn.classList.contains('liked');

    if (isLiked) {
        // 取消点赞
        likeBtn.classList.remove('liked');
        const currentCount = parseInt(likeCountEl.textContent.replace(/[^\d]/g, '')) || 0;
        likeCountEl.textContent = formatNumber(Math.max(0, currentCount - 1));
        showToast('已取消点赞', 'info');
    } else {
        // 点赞
        likeBtn.classList.add('liked');
        const currentCount = parseInt(likeCountEl.textContent.replace(/[^\d]/g, '')) || 0;
        likeCountEl.textContent = formatNumber(currentCount + 1);
        showToast('已点赞', 'success');
    }
}

// 切换收藏状态
function toggleFavorite() {
    const favoriteBtn = document.getElementById('favoriteBtn');
    const favoriteCountEl = document.getElementById('favoriteCount');

    if (!favoriteBtn || !favoriteCountEl) return;

    const isFavorited = favoriteBtn.classList.contains('favorited');

    if (isFavorited) {
        // 取消收藏
        favoriteBtn.classList.remove('favorited');
        const currentCount = parseInt(favoriteCountEl.textContent.replace(/[^\d]/g, '')) || 0;
        favoriteCountEl.textContent = formatNumber(Math.max(0, currentCount - 1));
        showToast('已取消收藏', 'info');
    } else {
        // 收藏
        favoriteBtn.classList.add('favorited');
        const currentCount = parseInt(favoriteCountEl.textContent.replace(/[^\d]/g, '')) || 0;
        favoriteCountEl.textContent = formatNumber(currentCount + 1);
        showToast('已收藏', 'success');
    }
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString();
}

// Open unified player
function openUnifiedPlayer(awemeId) {
    const index = recommendedVideos.findIndex(v => v.aweme_id === awemeId);
    if (index === -1) {
        showToast('未找到视频', 'error');
        return;
    }

    // 如果播放器已经打开，直接切换视频
    if (unifiedPlayerState.isOpen) {
        console.log('[openUnifiedPlayer] 播放器已打开，直接切换到视频', index);
        unifiedPlayerState.currentIndex = index;
        unifiedPlayerState.currentVideo = recommendedVideos[index];
        unifiedPlayerState.videos = recommendedVideos;
        renderUnifiedCurrentVideo();
        return;
    }

    // 首次打开播放器
    unifiedPlayerState = {
        currentIndex: index,
        isOpen: true,
        videos: recommendedVideos,
        currentVideo: recommendedVideos[index],
        videoElement: null,
        isMuted: false,
        volume: 1.0,
        playbackRate: 1.0,
        source: 'recommended',
        mediaIndex: 0
    };

    const player = document.getElementById('unifiedPlayer');
    if (player) {
        player.style.display = 'flex';
    }

    renderUnifiedCurrentVideo();
    setupUnifiedPlayerGestures();
    setupHoverPanels();
}

// Close unified player
function closeUnifiedPlayer() {
    unifiedPlayerState.isOpen = false;

    // 停止并清理视频元素
    if (unifiedPlayerState.videoElement) {
        unifiedPlayerState.videoElement.pause();
        unifiedPlayerState.videoElement.src = '';
        unifiedPlayerState.videoElement = null;
    }

    // 停止音乐播放器
    const musicPlayer = document.getElementById('musicPlayer');
    if (musicPlayer) {
        musicPlayer.pause();
        musicPlayer.src = '';
    }

    // 清空视频容器中的所有内容
    const wrapper = document.getElementById('unifiedVideoSlidesWrapper');
    if (wrapper) {
        // 停止所有视频元素
        wrapper.querySelectorAll('video').forEach(v => {
            v.pause();
            v.src = '';
        });
        wrapper.innerHTML = '';
    }

    // 移除键盘事件监听
    document.removeEventListener('keydown', handleUnifiedKeydown);

    const volumePanel = document.getElementById('volumePanel');
    const ratePanel = document.getElementById('ratePanel');
    const detailPanel = document.getElementById('playerDetailPanel');
    const musicPanel = document.getElementById('playerMusicPanel');
    const player = document.getElementById('unifiedPlayer');

    if (volumePanel) volumePanel.style.display = 'none';
    if (ratePanel) ratePanel.style.display = 'none';
    if (detailPanel) detailPanel.style.display = 'none';
    if (musicPanel) {
        musicPanel.classList.remove('show');
        musicPanel.style.display = 'none';
    }
    if (player) player.style.display = 'none';
}

// Render current video in unified player
function renderUnifiedCurrentVideo() {
    const wrapper = document.getElementById('unifiedVideoSlidesWrapper');
    if (!wrapper) {
        console.error('[renderUnifiedCurrentVideo] 找不到wrapper元素');
        return;
    }

    // 先停止并移除所有现有的视频元素
    wrapper.querySelectorAll('video').forEach(v => {
        v.pause();
        v.removeAttribute('src'); // 使用removeAttribute而不是直接设置src=''
        v.load(); // 重置视频元素
    });

    // 停止状态中的视频元素
    if (unifiedPlayerState.videoElement) {
        try {
            unifiedPlayerState.videoElement.pause();
        } catch (e) {}
        unifiedPlayerState.videoElement = null;
    }

    // 清空容器
    wrapper.innerHTML = '';

    const video = unifiedPlayerState.currentVideo;
    if (!video) {
        console.error('[renderUnifiedCurrentVideo] 当前视频为空');
        return;
    }

    // 重置媒体索引
    unifiedPlayerState.mediaIndex = 0;

    const videoData = video.video || {};
    const playAddr = videoData.play_addr;

    console.log('[renderUnifiedCurrentVideo] 视频ID:', video.aweme_id);
    console.log('[renderUnifiedCurrentVideo] 播放地址:', playAddr);

    if (!playAddr) {
        wrapper.innerHTML = '<div class="player-loading"><i class="bi bi-exclamation-circle"></i><p>视频不可用</p></div>';
        return;
    }

    const slide = document.createElement('div');
    slide.className = 'video-slide active';

    const videoEl = document.createElement('video');
    videoEl.className = 'video-element';

    // 使用代理URL避免CORS问题
    videoEl.src = '/api/media/proxy?url=' + encodeURIComponent(playAddr);
    videoEl.poster = videoData.cover ? '/api/media/proxy?url=' + encodeURIComponent(videoData.cover) : '';
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.muted = unifiedPlayerState.isMuted;
    videoEl.volume = unifiedPlayerState.volume;
    videoEl.playbackRate = unifiedPlayerState.playbackRate;

    videoEl.addEventListener('loadedmetadata', () => {
        console.log('[renderUnifiedCurrentVideo] 视频元数据加载成功');
        unifiedPlayerState.videoElement = videoEl;
        setupUnifiedVideoProgress(videoEl);

        // 尝试自动播放，如果失败则显示播放按钮
        videoEl.play().catch(e => {
            console.log('Autoplay prevented, user interaction required:', e);
            // 如果自动播放失败，添加点击播放提示
            const playHint = document.createElement('div');
            playHint.className = 'player-play-hint';
            playHint.innerHTML = '<i class="bi bi-play-circle-fill"></i><p>点击播放</p>';
            playHint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:48px;cursor:pointer;z-index:10;';
            playHint.onclick = () => {
                videoEl.play();
                playHint.remove();
            };
            slide.appendChild(playHint);
        });
    });

    videoEl.addEventListener('error', (e) => {
        console.error('[renderUnifiedCurrentVideo] 视频加载失败:', e);
        console.error('[renderUnifiedCurrentVideo] 错误详情:', videoEl.error);
        slide.innerHTML = '<div class="player-loading"><i class="bi bi-exclamation-circle"></i><p>视频加载失败</p><p class="small text-muted">请检查网络连接或CORS设置</p></div>';
    });

    slide.appendChild(videoEl);

    // 添加点击事件：暂停/播放
    slide.onclick = (e) => {
        // 避免点击播放提示时触发
        if (e.target.closest('.player-play-hint')) return;

        if (unifiedPlayerState.videoElement) {
            toggleUnifiedVideoPlay();
        }
    };

    wrapper.appendChild(slide);
    updateUnifiedPlayerInfo();
}

// Setup video progress bar for unified player
function setupUnifiedVideoProgress(video) {
    const progressBar = document.getElementById('unifiedProgressBar');
    const progressFill = document.getElementById('unifiedProgressFill');
    const progressThumb = document.getElementById('unifiedProgressThumb');
    const currentTimeEl = document.getElementById('unifiedCurrentTime');
    const durationEl = document.getElementById('unifiedDuration');

    if (!progressBar || !progressFill || !video) return;

    let isDragging = false;

    // 更新进度条
    video.addEventListener('timeupdate', () => {
        if (!isDragging) {
            const percent = (video.currentTime / video.duration) * 100;
            progressFill.style.width = percent + '%';
            progressThumb.style.left = percent + '%';

            if (currentTimeEl) currentTimeEl.textContent = formatVideoTime(video.currentTime);
            if (durationEl) durationEl.textContent = formatVideoTime(video.duration);
        }
    });

    // 辅助函数：根据鼠标位置计算进度
    function getProgressFromMouse(e) {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        return Math.max(0, Math.min(1, clickX / rect.width));
    }

    // 辅助函数：更新进度显示（拖动时）
    function updateProgressDisplay(progress) {
        progressFill.style.width = (progress * 100) + '%';
        progressThumb.style.left = (progress * 100) + '%';
        if (currentTimeEl) {
            currentTimeEl.textContent = formatVideoTime(progress * video.duration);
        }
    }

    // Click to seek
    progressBar.addEventListener('click', (e) => {
        const progress = getProgressFromMouse(e);
        video.currentTime = progress * video.duration;
    });

    // Drag to seek
    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        const progress = getProgressFromMouse(e);
        updateProgressDisplay(progress);
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const progress = getProgressFromMouse(e);
        updateProgressDisplay(progress);
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            const progress = getProgressFromMouse(e);
            video.currentTime = progress * video.duration;
        }
    });

    // 触摸支持
    progressBar.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const clickX = touch.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, clickX / rect.width));
        updateProgressDisplay(progress);
        e.preventDefault();
    });

    progressBar.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const touch = e.touches[0];
            const rect = progressBar.getBoundingClientRect();
            const clickX = touch.clientX - rect.left;
            const progress = Math.max(0, Math.min(1, clickX / rect.width));
            updateProgressDisplay(progress);
        }
    });

    progressBar.addEventListener('touchend', (e) => {
        if (isDragging) {
            isDragging = false;
            const progress = parseFloat(progressFill.style.width) / 100;
            video.currentTime = progress * video.duration;
        }
    });
}

function formatVideoTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Setup gestures for unified player
function setupUnifiedPlayerGestures() {
    const container = document.getElementById('unifiedPlayerContainer');
    if (!container) return;

    let touchStartY = 0;
    let touchEndY = 0;

    container.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;

        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                playNextUnifiedVideo();
            } else {
                playPrevUnifiedVideo();
            }
        }
    }, { passive: true });

    // Mouse wheel - 添加防抖
    let lastWheelTime = 0;
    const WHEEL_THROTTLE = 500; // 500ms内的滚轮事件只响应一次

    container.addEventListener('wheel', (e) => {
        const now = Date.now();

        // 防抖：如果在冷却时间内，忽略滚轮事件
        if (now - lastWheelTime < WHEEL_THROTTLE) {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        lastWheelTime = now;

        if (e.deltaY > 0) {
            playNextUnifiedVideo();
        } else {
            playPrevUnifiedVideo();
        }
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', handleUnifiedKeydown);
}

function handleUnifiedKeydown(e) {
    if (!unifiedPlayerState.isOpen) return;

    // 完全参考沉浸式播放器的实现
    if (e.key === 'Escape') closeUnifiedPlayer();
    if (e.key === 'ArrowLeft') { e.preventDefault(); playPrevMedia(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); playNextMedia(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); playPrevUnifiedVideo(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); playNextUnifiedVideo(); }
    if (e.key === ' ') { e.preventDefault(); toggleUnifiedVideoPlay(); }
}

// 切换暂停/播放
function toggleUnifiedVideoPlay() {
    const video = unifiedPlayerState.videoElement;
    if (video) {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }
}

// 切换到下一个媒体（如果当前作品有多个图片/视频）
function playNextMedia() {
    const video = unifiedPlayerState.currentVideo;
    if (!video) return;

    // 收集当前作品的所有媒体
    const mediaUrls = [];
    const videoData = video.video || {};

    if (videoData.play_addr) {
        mediaUrls.push({ type: 'video', url: videoData.play_addr });
    }
    if (videoData.images && videoData.images.length > 0) {
        videoData.images.forEach(img => {
            mediaUrls.push({ type: 'image', url: img });
        });
    }

    // 如果只有一个媒体或没有媒体，切换到下一个作品
    if (mediaUrls.length <= 1) {
        playNextUnifiedVideo();
        return;
    }

    // 切换到下一个媒体
    const currentMediaIndex = unifiedPlayerState.mediaIndex || 0;
    if (currentMediaIndex < mediaUrls.length - 1) {
        unifiedPlayerState.mediaIndex = currentMediaIndex + 1;
        renderCurrentMedia(mediaUrls[unifiedPlayerState.mediaIndex]);
        showToast(`媒体 ${unifiedPlayerState.mediaIndex + 1}/${mediaUrls.length}`, 'info');
    } else {
        // 已经是最后一个媒体，切换到下一个作品
        playNextUnifiedVideo();
    }
}

// 切换到上一个媒体
function playPrevMedia() {
    const video = unifiedPlayerState.currentVideo;
    if (!video) return;

    // 收集当前作品的所有媒体
    const mediaUrls = [];
    const videoData = video.video || {};

    if (videoData.play_addr) {
        mediaUrls.push({ type: 'video', url: videoData.play_addr });
    }
    if (videoData.images && videoData.images.length > 0) {
        videoData.images.forEach(img => {
            mediaUrls.push({ type: 'image', url: img });
        });
    }

    // 如果只有一个媒体或没有媒体，切换到上一个作品
    if (mediaUrls.length <= 1) {
        playPrevUnifiedVideo();
        return;
    }

    // 切换到上一个媒体
    const currentMediaIndex = unifiedPlayerState.mediaIndex || 0;
    if (currentMediaIndex > 0) {
        unifiedPlayerState.mediaIndex = currentMediaIndex - 1;
        renderCurrentMedia(mediaUrls[unifiedPlayerState.mediaIndex]);
        showToast(`媒体 ${unifiedPlayerState.mediaIndex + 1}/${mediaUrls.length}`, 'info');
    } else {
        // 已经是第一个媒体，切换到上一个作品
        playPrevUnifiedVideo();
    }
}

// 渲染当前媒体
function renderCurrentMedia(media) {
    const wrapper = document.getElementById('unifiedVideoSlidesWrapper');
    if (!wrapper) return;

    // 停止并移除所有现有的视频元素
    wrapper.querySelectorAll('video').forEach(v => {
        v.pause();
        v.removeAttribute('src');
        v.load();
    });

    if (unifiedPlayerState.videoElement) {
        try {
            unifiedPlayerState.videoElement.pause();
        } catch (e) {}
        unifiedPlayerState.videoElement = null;
    }

    wrapper.innerHTML = '';

    const slide = document.createElement('div');
    slide.className = 'video-slide active';

    if (media.type === 'video') {
        const videoEl = document.createElement('video');
        videoEl.className = 'video-element';
        videoEl.src = '/api/media/proxy?url=' + encodeURIComponent(media.url);
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.muted = unifiedPlayerState.isMuted;
        videoEl.volume = unifiedPlayerState.volume;
        videoEl.playbackRate = unifiedPlayerState.playbackRate;

        videoEl.addEventListener('loadedmetadata', () => {
            unifiedPlayerState.videoElement = videoEl;
            setupUnifiedVideoProgress(videoEl);
            videoEl.play().catch(e => {
                const playHint = document.createElement('div');
                playHint.className = 'player-play-hint';
                playHint.innerHTML = '<i class="bi bi-play-circle-fill"></i><p>点击播放</p>';
                playHint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:48px;cursor:pointer;z-index:10;';
                playHint.onclick = () => {
                    videoEl.play();
                    playHint.remove();
                };
                slide.appendChild(playHint);
            });
        });

        videoEl.addEventListener('error', (e) => {
            console.error('视频加载失败:', e);
        });

        slide.appendChild(videoEl);
    } else if (media.type === 'image') {
        const img = document.createElement('img');
        img.className = 'video-element';
        img.src = '/api/media/proxy?url=' + encodeURIComponent(media.url);
        img.alt = '图片';
        img.style.cssText = 'max-width:100%;max-height:100vh;object-fit:contain;';

        slide.appendChild(img);
        unifiedPlayerState.videoElement = null;
    }

    wrapper.appendChild(slide);

    // 添加点击事件
    slide.onclick = () => {
        if (unifiedPlayerState.videoElement) {
            toggleUnifiedVideoPlay();
        }
    };
}

function playNextUnifiedVideo() {
    // 如果接近最后一个视频（剩余3个或更少），自动加载更多
    const remaining = unifiedPlayerState.videos.length - unifiedPlayerState.currentIndex - 1;

    // 只在还有视频可切换时才考虑预加载
    if (remaining <= 3 && remaining > 0 && unifiedPlayerState.source === 'recommended' && hasMoreRecommended && !isLoadingMore) {
        console.log('[playNextUnifiedVideo] 自动加载更多视频, 当前剩余:', remaining, '总视频数:', unifiedPlayerState.videos.length);
        loadMoreRecommendedFeed();
    }

    if (unifiedPlayerState.currentIndex < unifiedPlayerState.videos.length - 1) {
        unifiedPlayerState.currentIndex++;
        unifiedPlayerState.currentVideo = unifiedPlayerState.videos[unifiedPlayerState.currentIndex];
        renderUnifiedCurrentVideo();
        // 重置连续下滑计数
        if (typeof window.continuousScrollCount !== 'undefined') {
            window.continuousScrollCount = 0;
        }
    } else {
        // 已经在最后一个视频
        if (!hasMoreRecommended) {
            showToast('已经是最后一个视频', 'info');
        } else if (isLoadingMore) {
            // 用户在最后一个视频还继续下滑，才提示正在加载
            window.continuousScrollCount = (window.continuousScrollCount || 0) + 1;
            if (window.continuousScrollCount === 1) {
                showToast('正在加载更多视频，请稍候...', 'info');
            }
        }
    }
}

function playPrevUnifiedVideo() {
    if (unifiedPlayerState.currentIndex > 0) {
        unifiedPlayerState.currentIndex--;
        unifiedPlayerState.currentVideo = unifiedPlayerState.videos[unifiedPlayerState.currentIndex];
        renderUnifiedCurrentVideo();
    } else {
        showToast('已经是第一个视频', 'info');
    }
}

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.player-control-group')) {
        const volumePanel = document.getElementById('volumePanel');
        const ratePanel = document.getElementById('ratePanel');
        if (volumePanel) volumePanel.style.display = 'none';
        if (ratePanel) ratePanel.style.display = 'none';
    }
});
