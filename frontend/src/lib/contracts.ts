// Shared frontend/backend response contracts for the Python and Rust frontends.
// Keep this file byte-for-byte aligned in both apps until it moves into a real shared package.

export interface AppConfig {
  download_path: string;
  download_dir?: string;
  filename_template: string;
  max_concurrent: number;
  download_quality: string;
  auto_create_folder: boolean;
  folder_name_template: string;
  save_metadata: boolean;
  proxy: string | null;
  cookie: string;
  theme: string;
  language: string;
  cookie_set?: boolean;
}

export interface AuthorInfo {
  uid: string;
  sec_uid: string;
  nickname: string;
  avatar_thumb: string;
  avatar_medium: string;
  signature: string;
  follower_count: number;
  following_count: number;
  aweme_count: number;
  favoriting_count: number;
  is_follow: boolean;
  verify_status: number;
  unique_id: string;
}

export interface VideoData {
  preview_addr: string | null;
  play_addr: string;
  play_addr_h264: string | null;
  play_addr_lowbr: string | null;
  download_addr: string | null;
  cover: string;
  dynamic_cover: string;
  origin_cover: string;
  width: number;
  height: number;
  duration: number;
  duration_unit?: "seconds" | "milliseconds" | string | null;
  ratio: string;
  bit_rate?: BitRateInfo[] | null;
}

export interface BitRateInfo {
  gear_name: string;
  bit_rate: number;
  quality_type: number;
  is_h265: boolean;
  data_size: number;
  width: number;
  height: number;
  play_addr: string | null;
  play_addr_h264: string | null;
}

export interface Statistics {
  play_count: number;
  digg_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  forward_count: number;
}

export interface VideoStatus {
  is_delete?: boolean;
  private_status?: number;
  review_status?: number;
  with_goods?: boolean;
  is_prohibited?: boolean;
}

export interface MusicInfo {
  title: string;
  author: string;
  play_url: string;
  cover: string;
  duration: number;
}

export interface VideoMediaUrl {
  type?: string;
  url: string;
}

export interface VideoInfo {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: AuthorInfo;
  video: VideoData;
  statistics: Statistics;
  media_urls?: VideoMediaUrl[] | null;
  image_urls: string[] | null;
  images?: string[] | null;
  live_photo_urls?: string[] | null;
  live_photos?: string[] | null;
  has_live_photo?: boolean;
  is_liked?: boolean;
  is_collected?: boolean;
  is_image: boolean;
  media_type: string;
  raw_media_type?: string | number | null;
  status?: VideoStatus | null;
  bgm_url?: string | null;
  cover_url?: string | null;
  music: MusicInfo | null;
}

export type VideoItem = VideoInfo;

export interface UserInfo {
  uid: string;
  nickname: string;
  avatar_thumb: string;
  avatar_medium: string;
  avatar_larger: string;
  signature: string;
  follower_count: number;
  following_count: number;
  total_favorited: number;
  aweme_count: number;
  favoriting_count: number;
  is_follow: boolean;
  sec_uid: string;
  unique_id: string;
  verify_status: number;
}

export interface SearchResult {
  users: UserInfo[];
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  need_verify?: boolean;
  need_login?: boolean;
  verify_url?: string;
}

export interface SearchUserResponse extends ApiResponse {
  type?: "single" | "multiple";
  user?: UserInfo;
  users?: UserInfo[];
}

export interface UserDetailResponse extends ApiResponse {
  user?: UserInfo;
}

export interface UserVideosResponse extends ApiResponse {
  videos?: VideoInfo[];
  has_more?: boolean;
  cursor?: number;
  total_count?: number;
}

export interface VideoDetailResponse extends ApiResponse {
  video?: VideoInfo;
}

export interface LinkParseResponse extends ApiResponse {
  type?: string;
  user?: UserInfo;
  video?: VideoInfo;
  videos?: VideoInfo[];
}

export interface VideoRelationResponse extends ApiResponse {
  aweme_id?: string;
  is_liked?: boolean;
  is_collected?: boolean;
}

export interface RecommendedResponse extends ApiResponse {
  videos?: VideoInfo[];
  cursor?: number;
  has_more?: boolean;
}

export interface LikedVideosResponse extends ApiResponse {
  data?: VideoInfo[];
  count?: number;
  cursor?: number;
  has_more?: boolean;
}

export interface LikedAuthorsResponse extends ApiResponse {
  data?: UserInfo[];
  count?: number;
}

export interface CollectedVideosResponse extends ApiResponse {
  data?: VideoInfo[];
  count?: number;
  cursor?: number;
  has_more?: boolean;
}

export interface CollectedMixAuthor {
  nickname: string;
  sec_uid: string;
  avatar_thumb: string;
}

export interface CollectedMixStats {
  collect_vv: number;
  play_vv: number;
  updated_to_episode: number;
}

export interface CollectedMixItem {
  mix_id: string;
  mix_name: string;
  desc: string;
  cover_url: string;
  author: CollectedMixAuthor;
  statis: CollectedMixStats;
  create_time: number;
  update_time: number;
  mix_type: number;
}

export interface CollectedMixesResponse extends ApiResponse {
  data?: CollectedMixItem[];
  count?: number;
  cursor?: number;
  has_more?: boolean;
}

export interface MixVideosResponse extends ApiResponse {
  data?: VideoInfo[];
  count?: number;
  cursor?: number;
  has_more?: boolean;
}

export interface DownloadProgress {
  task_id: string;
  desc?: string;
  display_name?: string;
  progress: number;
  completed?: number;
  total?: number;
  status: string;
  error?: string;
  message?: string;
}

export interface HistoryItem {
  id: string;
  aweme_id?: string;
  filename: string;
  title?: string;
  path: string;
  file_path?: string;
  author: string;
  desc: string;
  size: number;
  file_size?: number;
  timestamp: number;
  create_time?: number;
  file_type: string;
  media_type?: string;
  cover?: string;
  author_id?: string;
}

export interface CookieStatus {
  valid: boolean;
  user_name: string | null;
  user_id: string | null;
  expires_at: number | null;
  need_login?: boolean;
  need_verify?: boolean;
  message: string;
}

export interface DownloadFilesResult {
  items: HistoryItem[];
  total: number;
  totalSize: number;
  latest: HistoryItem | null;
}
