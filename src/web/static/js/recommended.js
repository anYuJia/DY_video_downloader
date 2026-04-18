// ═══════════════════════════════════════════════
// RECOMMENDED FEED - 推荐视频流
// ═══════════════════════════════════════════════

let recommendedVideos = [];
let recommendedCursor = 0;
let hasMoreRecommended = false;

async function showRecommendedFeed() {
    // 隐藏其他区域
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('linkParseResult').style.display = 'none';
    document.getElementById('userDetailSection').style.display = 'none';

    // 显示推荐视频区域
    document.getElementById('recommendedFeedSection').style.display = 'block';

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
    try {
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

        if (data.success) {
            recommendedVideos = recommendedVideos.concat(data.videos);
            recommendedCursor = data.cursor;
            hasMoreRecommended = data.has_more;

            displayRecommendedVideos(data.videos);

            // 显示/隐藏加载更多按钮
            document.getElementById('loadMoreRecommended').style.display =
                hasMoreRecommended ? 'block' : 'none';

            updateStatus('ready', '就绪');
        } else {
            showToast(data.message || '加载失败', 'error');
            updateStatus('ready', '就绪');
        }
    } catch (error) {
        console.error('加载推荐视频失败:', error);
        showToast('加载推荐视频失败', 'error');
        updateStatus('ready', '就绪');
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

    videos.forEach(video => {
        const card = createRecommendedVideoCard(video);
        container.appendChild(card);
    });
}

function createRecommendedVideoCard(video) {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';

    const stats = video.statistics || {};
    const author = video.author || {};
    const videoData = video.video || {};

    // 创建卡片元素
    const card = document.createElement('div');
    card.className = 'video-card';
    card.onclick = () => showRecommendedVideoDetail(video.aweme_id);

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

async function showRecommendedVideoDetail(awemeId) {
    // 显示视频详情
    const video = recommendedVideos.find(v => v.aweme_id === awemeId);
    if (!video) return;

    // TODO: 实现视频详情模态框
    showToast('视频详情功能开发中...', 'info');
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
