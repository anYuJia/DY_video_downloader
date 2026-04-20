// ═══════════════════════════════════════════════
// DY Downloader — Storage (VideoStorage + LikedDataCache)
// ═══════════════════════════════════════════════

const VideoStorage = {
    MEDIA_URL_MAX_AGE: 30 * 60 * 1000,
    _cachedSize: -1,
    _cacheDirty: true,

    saveVideo: function (videoData) {
        try {
            const videos = this.getAllVideos();
            const awemeId = videoData.aweme_id;

            if (!awemeId) {
                console.warn('视频数据缺少aweme_id，无法存储');
                return false;
            }

            videoData.stored_at = Date.now();
            videoData = this.enhanceVideoData(videoData);
            videos[awemeId] = videoData;

            localStorage.setItem('dy_video_storage', JSON.stringify(videos));
            this._cacheDirty = true;
            _log(`视频 ${awemeId} 已存储到本地，媒体类型: ${videoData.media_analysis?.media_type || '未知'}，媒体数量: ${videoData.media_analysis?.media_count || 0}`);
            return true;
        } catch (error) {
            console.error('[VideoStorage.saveVideo] 存储失败:', error);
            return false;
        }
    },

    enhanceVideoData: function (videoData) {
        const enhanced = {
            aweme_id: videoData.aweme_id,
            author: {
                nickname: videoData.author?.nickname,
                avatar_thumb: videoData.author?.avatar_thumb,
                unique_id: videoData.author?.unique_id,
                sec_uid: videoData.author?.sec_uid
            },
            desc: videoData.desc,
            create_time: videoData.create_time,
            digg_count: videoData.digg_count,
            comment_count: videoData.comment_count,
            share_count: videoData.share_count,
            media_type: videoData.media_type,
            media_urls: videoData.media_urls,
            raw_media_type: videoData.raw_media_type,
            cover_url: videoData.cover_url,
            bgm_url: videoData.bgm_url,
            duration: videoData.duration,
            music: videoData.music,
            music_title: videoData.music_title || videoData.music?.title,
            music_author: videoData.music_author || videoData.music?.author,
            music_url: videoData.music_url || videoData.music?.play_url || videoData.bgm_url,
            music_duration: videoData.music_duration || videoData.music?.duration,
            media_fetched_at: videoData.media_fetched_at || videoData.stored_at || Date.now(),
            videos: videoData.videos,
            images: videoData.images
        };
        const mediaAnalysis = this.analyzeMediaData(videoData);
        enhanced.media_analysis = mediaAnalysis;
        enhanced.statistics = {
            comment_count: videoData.comment_count || 0,
            digg_count: videoData.digg_count || 0,
            share_count: videoData.share_count || 0,
            play_count: videoData.statistics?.play_count || 0
        };

        if (videoData.comment_count !== undefined || videoData.digg_count !== undefined || videoData.share_count !== undefined) {
            enhanced.statistics = {
                comment_count: videoData.comment_count || 0,
                digg_count: videoData.digg_count || 0,
                share_count: videoData.share_count || 0
            };
        }

        if (videoData.cover_url) enhanced.cover = videoData.cover_url;
        if (videoData.create_time) enhanced.create_time = videoData.create_time;
        if (videoData.desc) enhanced.desc = videoData.desc;
        if (videoData.media_type) enhanced.raw_media_type = videoData.media_type;

        return enhanced;
    },

    isMediaExpired: function (timestamp, maxAge) {
        const ts = Number(timestamp || 0);
        const ttl = Number(maxAge || this.MEDIA_URL_MAX_AGE);
        if (!ts || !ttl) return false;
        return Date.now() - ts > ttl;
    },

    stripTransientMedia: function (videoData) {
        if (!videoData || typeof videoData !== 'object') return videoData;

        const stripped = Object.assign({}, videoData, {
            media_urls: [],
            bgm_url: '',
            videos: [],
            images: []
        });

        if (stripped.music && typeof stripped.music === 'object') {
            stripped.music = Object.assign({}, stripped.music, { play_url: '' });
        }
        if (stripped.music_url) stripped.music_url = '';
        if (stripped.cover_url) stripped.cover_url = stripped.cover_url;
        stripped.media_expired = true;
        return stripped;
    },

    sanitizeVideoRecord: function (videoData) {
        if (!videoData || typeof videoData !== 'object') return videoData;
        if (!this.isMediaExpired(videoData.media_fetched_at || videoData.stored_at)) return videoData;
        return this.stripTransientMedia(videoData);
    },

    sanitizeVideoMap: function (videos) {
        let changed = false;
        const sanitized = {};

        Object.keys(videos || {}).forEach(awemeId => {
            const original = videos[awemeId];
            const next = this.sanitizeVideoRecord(original);
            sanitized[awemeId] = next;
            if (next !== original) changed = true;
        });

        return { sanitized, changed };
    },

    analyzeMediaData: function (videoData) {
        const analysis = {
            media_type: 'unknown',
            media_count: 0,
            has_videos: false,
            has_images: false,
            video_urls: [],
            image_urls: [],
            live_photo_urls: [],
            original_urls: []
        };

        if (videoData.media_urls && Array.isArray(videoData.media_urls)) {
            analysis.media_count = videoData.media_urls.length;
            analysis.original_urls = [...videoData.media_urls];

            videoData.media_urls.forEach(media => {
                if (media.type === 'video') {
                    analysis.has_videos = true;
                    analysis.video_urls.push(media.url);
                } else if (media.type === 'image') {
                    analysis.has_images = true;
                    analysis.image_urls.push(media.url);
                } else if (media.type === 'live_photo') {
                    analysis.has_videos = true;
                    analysis.live_photo_urls.push(media.url);
                }
            });

            if (analysis.has_videos && analysis.has_images) {
                analysis.media_type = 'mixed';
            } else if (analysis.live_photo_urls.length > 0) {
                analysis.media_type = 'live_photo';
            } else if (analysis.has_videos) {
                analysis.media_type = 'video';
            } else if (analysis.has_images) {
                analysis.media_type = 'image';
            }
        }

        analysis.has_images_field = videoData.hasOwnProperty('images') && videoData.images;
        analysis.has_videos_field = videoData.hasOwnProperty('videos') && videoData.videos;

        if (analysis.has_images_field && Array.isArray(videoData.images)) {
            analysis.images_field_count = videoData.images.length;
            analysis.has_images = true;
            if (analysis.media_type === 'unknown') analysis.media_type = 'image';
        }

        if (analysis.has_videos_field && Array.isArray(videoData.videos)) {
            analysis.videos_field_count = videoData.videos.length;
            analysis.has_videos = true;
            if (analysis.media_type === 'unknown') analysis.media_type = 'video';
        }

        if (videoData.media_type) {
            analysis.original_media_type = videoData.media_type;
            if (analysis.media_type === 'unknown') analysis.media_type = videoData.media_type;
        }

        return analysis;
    },

    saveVideos: function (videoList) {
        let successCount = 0;
        videoList.forEach(video => {
            if (this.saveVideo(video)) successCount++;
        });
        _log(`批量存储完成: ${successCount}/${videoList.length} 个视频`);
        return successCount;
    },

    getVideo: function (awemeId) {
        try {
            const videos = this.getAllVideos();
            return videos[awemeId] || null;
        } catch (error) {
            console.error('获取视频数据失败:', error);
            return null;
        }
    },

    getAllVideos: function () {
        try {
            const stored = localStorage.getItem('dy_video_storage');
            const videos = stored ? JSON.parse(stored) : {};
            const result = this.sanitizeVideoMap(videos);
            if (result.changed) {
                localStorage.setItem('dy_video_storage', JSON.stringify(result.sanitized));
                this._cacheDirty = true;
            }
            return result.sanitized;
        } catch (error) {
            console.error('获取存储数据失败:', error);
            return {};
        }
    },

    removeVideo: function (awemeId) {
        try {
            const videos = this.getAllVideos();
            if (videos[awemeId]) {
                delete videos[awemeId];
                localStorage.setItem('dy_video_storage', JSON.stringify(videos));
                this._cacheDirty = true;
                _log(`视频 ${awemeId} 已从存储中删除`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('删除视频数据失败:', error);
            return false;
        }
    },

    clearAll: function () {
        try {
            localStorage.removeItem('dy_video_storage');
            this._cacheDirty = true;
            this._cachedSize = 0;
            _log('所有视频数据已清空');
            return true;
        } catch (error) {
            console.error('清空视频数据失败:', error);
            return false;
        }
    },

    clear: function () {
        return this.clearAll();
    },

    getStats: function () {
        const videos = this.getAllVideos();
        const videoList = Object.values(videos);
        const count = videoList.length;

        if (this._cacheDirty) {
            try {
                this._cachedSize = JSON.stringify(videos).length;
            } catch (error) {
                console.error('计算存储大小失败:', error);
                this._cachedSize = 0;
            }
            this._cacheDirty = false;
        }

        const authorSet = new Set();
        let oldestDate = null;
        videoList.forEach(v => {
            if (v.author && v.author.nickname) authorSet.add(v.author.nickname);
            if (v.stored_at) {
                if (!oldestDate || v.stored_at < oldestDate) oldestDate = v.stored_at;
            }
        });

        return {
            count: count,
            totalVideos: count,
            size: this._cachedSize,
            totalSize: this._cachedSize,
            sizeFormatted: this.formatBytes(this._cachedSize),
            uniqueAuthors: authorSet.size,
            oldestDate: oldestDate
        };
    },

    formatBytes: function (bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    exportData: function () {
        return this.getAllVideos();
    },

    importData: function (data) {
        const existing = this.getAllVideos();
        let imported = 0;
        let skipped = 0;

        const entries = (typeof data === 'object' && !Array.isArray(data)) ? data : {};
        Object.keys(entries).forEach(key => {
            if (!existing[key]) {
                existing[key] = entries[key];
                imported++;
            } else {
                skipped++;
            }
        });

        localStorage.setItem('dy_video_storage', JSON.stringify(existing));
        this._cacheDirty = true;
        return { imported, skipped };
    }
};

// ═══════════════════════════════════════════════
// LIKED DATA CACHE
// ═══════════════════════════════════════════════
const LikedDataCache = {
    LIKED_VIDEOS_KEY: 'liked_videos_cache',
    LIKED_AUTHORS_KEY: 'liked_authors_cache',
    CACHE_VERSION: 3,
    currentDisplayType: null,

    saveLikedVideos: function(videos, count) {
        const timestamp = Date.now();
        const normalizedVideos = Array.isArray(videos)
            ? videos.map(video => Object.assign({}, video, { media_fetched_at: video.media_fetched_at || timestamp }))
            : [];
        const cacheData = { version: this.CACHE_VERSION, data: normalizedVideos, count: count, timestamp: timestamp };
        localStorage.setItem(this.LIKED_VIDEOS_KEY, JSON.stringify(cacheData));
        _log(`已缓存 ${normalizedVideos.length} 个点赞视频`);
    },

    saveLikedAuthors: function(authors, count) {
        const cacheData = { version: this.CACHE_VERSION, data: authors, count: count, timestamp: Date.now() };
        localStorage.setItem(this.LIKED_AUTHORS_KEY, JSON.stringify(cacheData));
        _log(`已缓存 ${authors.length} 个点赞作者`);
    },

    getLikedVideos: function() {
        try {
            const cached = localStorage.getItem(this.LIKED_VIDEOS_KEY);
            if (cached) {
                const cacheData = JSON.parse(cached);
                if (cacheData.version !== this.CACHE_VERSION) {
                    localStorage.removeItem(this.LIKED_VIDEOS_KEY);
                    _log('点赞视频缓存版本已过期，已自动清理');
                    return null;
                }
                if (VideoStorage.isMediaExpired(cacheData.timestamp)) {
                    localStorage.removeItem(this.LIKED_VIDEOS_KEY);
                    _log('点赞视频缓存中的媒体地址已过期，已自动清理');
                    return null;
                }
                _log(`从缓存获取到 ${cacheData.data.length} 个点赞视频`);
                return cacheData;
            }
        } catch (error) {
            console.error('获取点赞视频缓存失败:', error);
        }
        return null;
    },

    getLikedAuthors: function() {
        try {
            const cached = localStorage.getItem(this.LIKED_AUTHORS_KEY);
            if (cached) {
                const cacheData = JSON.parse(cached);
                if (cacheData.version !== this.CACHE_VERSION) {
                    localStorage.removeItem(this.LIKED_AUTHORS_KEY);
                    _log('点赞作者缓存版本已过期，已自动清理');
                    return null;
                }
                _log(`从缓存获取到 ${cacheData.data.length} 个点赞作者`);
                return cacheData;
            }
        } catch (error) {
            console.error('获取点赞作者缓存失败:', error);
        }
        return null;
    },

    clearAll: function() {
        localStorage.removeItem(this.LIKED_VIDEOS_KEY);
        localStorage.removeItem(this.LIKED_AUTHORS_KEY);
        _log('已清除所有点赞数据缓存');
    },

    isCacheExpired: function(timestamp, maxAge) {
        maxAge = maxAge || (24 * 60 * 60 * 1000);
        return Date.now() - timestamp > maxAge;
    }
};
