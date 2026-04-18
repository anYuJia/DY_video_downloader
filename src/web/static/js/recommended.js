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
    await loadRecommendedFeed();
}

function closeRecommendedFeed() {
    document.getElementById('recommendedFeedSection').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    recommendedVideos = [];
    recommendedCursor = 0;
}

async function loadRecommendedFeed() {
    // 防止重复加载
    if (isLoadingMore) {
        console.log('[loadRecommendedFeed] 正在加载中，跳过');
        return;
    }

    try {
        isLoadingMore = true;
        console.log('[loadRecommendedFeed] 开始请求 API');
        updateStatus('working', '加载中...');

        const response = await fetch('/api/recommended_feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: 20,
                cursor: recommendedCursor
            })
        });

        const data = await response.json();
        console.log('[loadRecommendedFeed] API 响应:', data.success, '视频数:', data.videos?.length);

        if (data.success) {
            const previousCount = recommendedVideos.length;
            recommendedVideos = recommendedVideos.concat(data.videos);
            recommendedCursor = data.cursor;
            hasMoreRecommended = data.has_more;

            console.log('[loadRecommendedFeed] 总视频数:', recommendedVideos.length);

            // 如果是从推荐卡片页面加载，显示卡片
            if (!isPlayerOpen) {
                displayRecommendedVideos(data.videos);

                // 显示/隐藏加载更多按钮
                document.getElementById('loadMoreRecommended').style.display =
                    hasMoreRecommended ? 'block' : 'none';
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
    await loadRecommendedFeed();
}

async function loadMoreRecommendedFeed() {
    await loadRecommendedFeed();
}

function displayRecommendedVideos(videos) {
    const container = document.getElementById('recommendedFeedList');
    console.log('[displayRecommendedVideos] 容器:', container);
    console.log('[displayRecommendedVideos] 容器位置:', container?.getBoundingClientRect());

    videos.forEach(video => {
        const card = createRecommendedVideoCard(video);
        console.log('[displayRecommendedVideos] 添加卡片到容器');
        container.appendChild(card);
    });

    console.log('[displayRecommendedVideos] 容器子元素数:', container.children.length);
}

function createRecommendedVideoCard(video) {
    console.log('[createRecommendedVideoCard] 创建卡片:', video.aweme_id);

    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';

    const stats = video.statistics || {};
    const author = video.author || {};
    const videoData = video.video || {};

    // 创建卡片元素
    const card = document.createElement('div');
    card.className = 'video-card';

    // 添加点击事件
    card.onclick = () => {
        console.log('[Card Click] 点击卡片:', video.aweme_id);
        openFullscreenPlayer(video.aweme_id);
    };

    // 封面容器
    const coverContainer = document.createElement('div');
    coverContainer.className = 'video-cover-container';

    const cover = document.createElement('img');
    cover.src = videoData.cover || '';
    cover.className = 'video-cover';
    cover.alt = '视频封面';
    cover.loading = 'lazy';

    const playIcon = document.createElement('div');
    playIcon.className = 'video-play-icon';
    playIcon.innerHTML = '<i class="bi bi-play-circle-fill"></i>';

    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';

    const statsDiv = document.createElement('div');
    statsDiv.className = 'video-stats';

    // 点赞
    const likeStat = createStatItem('bi-heart-fill', formatNumber(stats.digg_count || 0));
    // 评论
    const commentStat = createStatItem('bi-chat-fill', formatNumber(stats.comment_count || 0));
    // 分享
    const shareStat = createStatItem('bi-share-fill', formatNumber(stats.share_count || 0));

    statsDiv.appendChild(likeStat);
    statsDiv.appendChild(commentStat);
    statsDiv.appendChild(shareStat);

    overlay.appendChild(statsDiv);
    coverContainer.appendChild(cover);
    coverContainer.appendChild(playIcon);
    coverContainer.appendChild(overlay);

    // 卡片主体
    const cardBody = document.createElement('div');
    cardBody.className = 'video-card-body';

    const desc = document.createElement('div');
    desc.className = 'video-desc';
    desc.textContent = video.desc || '无描述';

    const authorDiv = document.createElement('div');
    authorDiv.className = 'video-author';

    const authorIcon = document.createElement('i');
    authorIcon.className = 'bi bi-person-circle';

    const authorName = document.createElement('span');
    authorName.textContent = author.nickname || '未知用户';

    authorDiv.appendChild(authorIcon);
    authorDiv.appendChild(authorName);

    const actions = document.createElement('div');
    actions.className = 'video-actions';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'video-btn btn-primary';
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        downloadRecommendedVideo(video.aweme_id);
    };

    const downloadIcon = document.createElement('i');
    downloadIcon.className = 'bi bi-download';
    downloadBtn.appendChild(downloadIcon);

    actions.appendChild(downloadBtn);

    cardBody.appendChild(desc);
    cardBody.appendChild(authorDiv);
    cardBody.appendChild(actions);

    card.appendChild(coverContainer);
    card.appendChild(cardBody);

    col.appendChild(card);

    console.log('[createRecommendedVideoCard] 卡片元素:', col);
    console.log('[createRecommendedVideoCard] 卡片位置:', col.getBoundingClientRect());

    return col;
}

function createStatItem(iconClass, value) {
    const stat = document.createElement('div');
    stat.className = 'stat-item';

    const icon = document.createElement('i');
    icon.className = iconClass;

    const span = document.createElement('span');
    span.textContent = value;

    stat.appendChild(icon);
    stat.appendChild(span);

    return stat;
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
    // 如果当前播放到倒数第二个视频，开始预加载
    if (currentPlayerIndex >= recommendedVideos.length - 2 && hasMoreRecommended && !isLoadingMore) {
        console.log('[checkAndLoadMore] 预加载更多视频');
        loadRecommendedFeed();
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

        // 异步加载，加载成功后自动切换
        loadRecommendedFeed().then(() => {
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
        showToast('开始下载...', 'info');

        // 使用代理URL下载
        const proxyPlayAddr = proxyUrl(playAddr);
        const link = document.createElement('a');
        link.href = proxyPlayAddr;
        link.download = `${video.author?.nickname || '视频'}_${video.aweme_id}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('下载已开始', 'success');
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

    // 添加到下载队列
    try {
        const response = await fetch('/api/download_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aweme_id: awemeId
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
