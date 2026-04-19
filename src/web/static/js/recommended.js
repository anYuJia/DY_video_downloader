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

// 智能预加载配置
const PRELOAD_THRESHOLD = 10;  // 剩余视频少于10条时预加载
const INITIAL_LOAD_COUNT = 20; // 首次加载数量
const LOAD_MORE_COUNT = 20;    // 每次加载更多数量

async function showRecommendedFeed() {
    console.log('[showRecommendedFeed] 开始加载推荐视频');

    // 隐藏其他区域
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('linkParseResult').style.display = 'none';
    document.getElementById('userDetailSection').style.display = 'none';

    // 显示推荐视频区域
    const section = document.getElementById('recommendedFeedSection');
    section.style.display = 'block';
    console.log('[showRecommendedFeed] 区域显示状态:', section.style.display);
    console.log('[showRecommendedFeed] 区域位置:', section.getBoundingClientRect());

    // 清空现有视频
    recommendedVideos = [];
    recommendedCursor = 0;
    document.getElementById('recommendedFeedList').textContent = '';

    // 加载视频
    await loadRecommendedFeed(INITIAL_LOAD_COUNT);
}

function closeRecommendedFeed() {
    document.getElementById('recommendedFeedSection').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    recommendedVideos = [];
    recommendedCursor = 0;
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

            // 合并新视频
            recommendedVideos = recommendedVideos.concat(newVideos);
            recommendedCursor = data.cursor;
            hasMoreRecommended = data.has_more;

            console.log('[loadRecommendedFeed] 总视频数:', recommendedVideos.length, '新增:', newVideos.length);

            // 如果是从推荐卡片页面加载，显示卡片
            if (!isPlayerOpen) {
                displayRecommendedVideos(newVideos);

                // 显示/隐藏加载更多按钮
                document.getElementById('loadMoreRecommended').style.display =
                    hasMoreRecommended ? 'block' : 'none';
            } else {
                console.log('[loadRecommendedFeed] 播放器模式，暂不更新列表页面');
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
        '<div class="position-relative video-cover-container" onclick="openFullscreenPlayer(\'' + video.aweme_id + '\')">' +
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
        '<button class="btn btn-sm btn-outline-success video-btn" onclick="event.stopPropagation();openFullscreenPlayer(\'' + video.aweme_id + '\')"><i class="bi bi-play-circle"></i></button>' +
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
