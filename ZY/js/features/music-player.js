/**
 * music-player.js - 一起听歌 + 灵动岛悬浮歌词模块
 * 依赖：localforage、JSZip、APP_PREFIX、homeShowModal/homeHideModal
 * 存储键：APP_PREFIX + 'music_playlist' (localforage)
 *
 * ★ [参考通话弹窗] 音乐弹窗 #music-player-overlay 挂载在 <body> 直接子级
 *   使用 position: fixed 全屏定位，与通话窗口 (#call-window) 同级
 *   最小化按钮：隐藏弹窗 → 显示灵动岛（类似 call-mini-pill）
 *   灵动岛点击恢复弹窗（类似 call mini pill 恢复）
 *
 * ★ [灵动岛居中] 初始 CSS 居中（left:50%; translateX(-50%)），拖拽后 JS 接管
 *   不再出现 left:0 导致岛屿在屏幕最左边不可见的问题
 *
 * 功能：
 *   - 多选批量上传 .mp3 + .lrc，按文件名自动配对
 *   - ZIP 压缩包一键导入（≤40MB），JSZip 解析自动配对
 *   - 存储空间检测，超限弹窗提醒批量删除
 *   - 批量删除歌曲、导出歌单 ZIP 备份
 *   - 本地文件夹读取 API（仅存索引，不存文件）
 *   - 灵动岛悬浮歌词、随机邀约弹窗、主题自适应
 *   - 最小化/恢复：弹窗 ↔ 灵动岛切换
 */
(function(global) {
    'use strict';

    // ======================== 常量 ========================
    var ZIP_MAX_SIZE = 40 * 1024 * 1024;
    var STORAGE_WARN_PCT = 0.75;
    var STORAGE_DANGER_PCT = 0.90;
    var ESTIMATED_MAX = 50 * 1024 * 1024;

    var MUSIC_KEY = '';
    function getMusicKey() {
        if (!MUSIC_KEY && global.APP_PREFIX) {
            MUSIC_KEY = global.APP_PREFIX + 'music_playlist';
        }
        return MUSIC_KEY || 'CHAT_APP_V3_music_playlist';
    }

    // ======================== 全局状态 ========================
    var playlist = [];
    var currentIndex = -1;
    var isPlaying = false;
    var currentVolume = 0.8;
    var audioEl = null;
    var progressInterval = null;
    var islandVisible = false;
    var islandDragging = false;
    // ★ [居中] 初始不设置 x, 让 CSS left:50%; translateX(-50%) 居中
    //   y=88 对应 CSS 的 top:88px，避让 header
    //   拖拽后 _hasDragged=true，使用绝对坐标
    var islandPos = { x: 0, y: 88, _hasDragged: false };
    var inviteProbability = 5;
    var inviteCooldown = 0;
    var selectMode = false;
    var selectedSet = {};
    var folderHandle = null;
    var _minimized = false; // ★ [最小化] 弹窗已最小化到灵动岛

    var ISLAND_MIN_Y = 60;

    // ★ 播放模式
    var PLAY_MODE_SEQUENTIAL = 'sequential';
    var PLAY_MODE_SHUFFLE = 'shuffle';
    var PLAY_MODE_REPEAT_ONE = 'repeat-one';
    var playMode = PLAY_MODE_SEQUENTIAL;
    var shuffleOrder = [];

    // ★ 一起听模式
    var togetherMode = false;          // 是否正在一起听
    var soloListener = 'me';           // ★ 独自听歌时谁在听: 'me' | 'partner'
    var partnerInviteTimeout = null;   // 邀请超时计时器
    var partnerActionTimer = null;     // 梦角行为计时器
    var PARTNER_ACTION_MIN = 60000;     // 梦角行为最小间隔 1分钟
    var PARTNER_ACTION_MAX = 600000;    // 梦角行为最大间隔 10分钟
    var INVITE_TIMEOUT = 30000;        // 邀请超时 30秒

    // ★ 排行榜数据
    var leaderboardData = {
        myTop: {},           // { songId: count }
        togetherTop: {},     // 一起听排行
        partnerTop: {},      // 梦角听歌排行
        totalListenTime: 0,  // 总听歌时长（秒）
        myTotalTime: 0,
        togetherTotalTime: 0,
        partnerTotalTime: 0,
        listenStartTime: 0   // 当前歌曲开始播放时间
    };

    // ★ 梦角虚拟听歌记录
    var partnerListenHistory = [];

    // ======================== DOM 引用 ========================
    var $overlay, $panel, $closeBtn, $minimizeBtn, $uploadArea, $uploadInput, $zipInput;
    var $nowTitle, $nowArtist, $playBtn, $prevBtn, $nextBtn;
    var $modeBtn, $modeText;
    var $volumeSlider, $progressBar, $curTime, $durTime;
    var $lyricsPreview, $playlistEl;
    var $island, $islandIcon, $islandTitle, $islandLyric, $islandClose;
    var $inviteOverlay, $inviteSong, $inviteAccept, $inviteDecline;
    var $toolbar, $batchBar, $batchCount;
    var $selectAllBtn, $deselectAllBtn, $deleteSelectedBtn;
    var $exportBtn, $batchDeleteBtn, $folderBtn, $zipBtn;
    var $storageBar, $storageText;
    // ★ 新增元素
    var $urlInput, $urlAddBtn;
    var $inviteBtn, $leaderboardBtn;
    var $modeStatus, $modeStatusText;
    var $lbOverlay, $lbClose, $lbList;
    var $partnerActionOverlay, $partnerActionIcon, $partnerActionTitle, $partnerActionSubtitle, $partnerActionOk;

    function cacheDOM() {
        $overlay        = document.getElementById('music-player-overlay');
        $panel          = document.getElementById('music-player-panel');
        $closeBtn       = document.getElementById('music-panel-close');
        $minimizeBtn    = document.getElementById('music-panel-minimize');
        $uploadArea     = document.getElementById('music-upload-area');
        $uploadInput    = document.getElementById('music-file-input');
        $zipInput       = document.getElementById('music-zip-input');
        $nowTitle       = document.getElementById('music-now-title');
        $nowArtist      = document.getElementById('music-now-artist');
        $playBtn        = document.getElementById('music-btn-play');
        $prevBtn        = document.getElementById('music-btn-prev');
        $nextBtn        = document.getElementById('music-btn-next');
        $modeBtn        = document.getElementById('music-btn-mode');
        $modeText       = document.getElementById('music-play-mode-text');
        $volumeSlider   = document.getElementById('music-volume-slider');
        $progressBar    = document.getElementById('music-progress-bar');
        $curTime        = document.getElementById('music-cur-time');
        $durTime        = document.getElementById('music-dur-time');
        $lyricsPreview  = document.getElementById('music-lyrics-preview');
        $playlistEl     = document.getElementById('music-playlist');
        $island         = document.getElementById('dynamic-island');
        $islandIcon     = document.getElementById('di-music-icon');
        $islandTitle    = document.getElementById('di-song-title');
        $islandLyric    = document.getElementById('di-lyric-line');
        $islandClose    = document.getElementById('di-close-btn');
        $inviteOverlay  = document.getElementById('music-invite-overlay');
        $inviteSong     = document.getElementById('invite-song-name');
        $inviteAccept   = document.getElementById('invite-accept');
        $inviteDecline  = document.getElementById('invite-decline');
        $toolbar        = document.getElementById('music-toolbar');
        $batchBar       = document.getElementById('music-batch-bar');
        $batchCount     = document.getElementById('music-batch-count');
        $selectAllBtn   = document.getElementById('music-btn-select-all');
        $deselectAllBtn = document.getElementById('music-btn-deselect-all');
        $deleteSelectedBtn = document.getElementById('music-btn-delete-selected');
        $exportBtn      = document.getElementById('music-btn-export');
        $batchDeleteBtn = document.getElementById('music-btn-batch-delete');
        $folderBtn      = document.getElementById('music-btn-folder');
        $zipBtn         = document.getElementById('music-btn-zip');
        $storageBar     = document.getElementById('music-storage-bar');
        $storageText    = document.getElementById('music-storage-text');
        // ★ 新增
        $urlInput       = document.getElementById('music-url-input');
        $urlAddBtn      = document.getElementById('music-btn-url-add');
        $inviteBtn      = document.getElementById('music-btn-invite');
        $leaderboardBtn = document.getElementById('music-btn-leaderboard');
        $modeStatus     = document.getElementById('music-mode-status');
        $modeStatusText = document.getElementById('music-mode-text');
        $lbOverlay      = document.getElementById('music-leaderboard-overlay');
        $lbClose        = document.getElementById('music-leaderboard-close');
        $lbList         = document.getElementById('music-leaderboard-list');
        $partnerActionOverlay    = document.getElementById('music-partner-action-overlay');
        $partnerActionIcon       = document.getElementById('partner-action-icon');
        $partnerActionTitle      = document.getElementById('partner-action-title');
        $partnerActionSubtitle   = document.getElementById('partner-action-subtitle');
        $partnerActionOk         = document.getElementById('partner-action-ok');
    }

    // ======================== LRC 解析 ========================
    function parseLRC(lrcText) {
        var lines = String(lrcText).split(/\r?\n/);
        var parsed = [];
        var artist = '';
        var title = '';
        var tiRe = /\[ti:\s*(.+?)\]/i;
        var arRe = /\[ar:\s*(.+?)\]/i;
        var timeRe = /\[(\d{1,3}):(\d{2})(?:\.(\d{2,3}))?\]/g;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            var tiM = line.match(tiRe);
            if (tiM) { title = tiM[1]; continue; }
            var arM = line.match(arRe);
            if (arM) { artist = arM[1]; continue; }

            var timeTags = [];
            var match;
            timeRe.lastIndex = 0;
            while ((match = timeRe.exec(line)) !== null) {
                var min = parseInt(match[1], 10);
                var sec = parseInt(match[2], 10);
                var ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
                timeTags.push(min * 60 + sec + ms / 1000);
            }
            if (timeTags.length > 0) {
                var text = line.replace(/\[.*?\]/g, '').trim();
                for (var t = 0; t < timeTags.length; t++) {
                    parsed.push({ time: timeTags[t], text: text });
                }
            }
        }
        parsed.sort(function(a, b) { return a.time - b.time; });
        return { lyrics: parsed, title: title, artist: artist };
    }

    // ======================== 存储操作 ========================
    function loadPlaylist() {
        return new Promise(function(resolve) {
            if (typeof localforage === 'undefined') {
                try {
                    var raw = localStorage.getItem(getMusicKey());
                    playlist = raw ? JSON.parse(raw) : [];
                } catch (e) { playlist = []; }
                resolve(playlist);
                return;
            }
            localforage.getItem(getMusicKey()).then(function(data) {
                playlist = data || [];
                resolve(playlist);
            }).catch(function() {
                playlist = [];
                resolve(playlist);
            });
        });
    }

    function savePlaylist() {
        var key = getMusicKey();
        if (typeof localforage !== 'undefined') {
            localforage.setItem(key, playlist).catch(function(e) {
                console.warn('[MusicPlayer] localforage 保存失败，回退 localStorage', e);
                try { localStorage.setItem(key, JSON.stringify(playlist)); } catch(e2) {}
            });
        } else {
            try { localStorage.setItem(key, JSON.stringify(playlist)); } catch(e) {}
        }
        try {
            global.dispatchEvent(new CustomEvent('musicPlaylistUpdated', { detail: { count: playlist.length } }));
        } catch(e) {}
    }

    function loadSettings() {
        try {
            var raw = typeof window.settings !== 'undefined' ? window.settings.musicInviteProbability : null;
            if (raw !== undefined && raw !== null) {
                inviteProbability = parseInt(raw, 10) || 0;
            } else {
                var stored = localStorage.getItem('CHAT_APP_V3_music_invite_prob');
                if (stored !== null) inviteProbability = parseInt(stored, 10) || 0;
            }
            // ★ 加载播放模式
            var modeStored = localStorage.getItem('CHAT_APP_V3_music_play_mode');
            if (modeStored && (modeStored === PLAY_MODE_SEQUENTIAL || modeStored === PLAY_MODE_SHUFFLE || modeStored === PLAY_MODE_REPEAT_ONE)) {
                playMode = modeStored;
            }
        } catch(e) {}
    }

    function savePlayMode() {
        try {
            localStorage.setItem('CHAT_APP_V3_music_play_mode', playMode);
        } catch(e) {}
    }

    function saveSettings() {
        try {
            if (typeof window.settings !== 'undefined') {
                window.settings.musicInviteProbability = inviteProbability;
            }
            localStorage.setItem('CHAT_APP_V3_music_invite_prob', String(inviteProbability));
        } catch(e) {}
    }

    // ★ 加载灵动岛位置，含拖拽标记
    function loadIslandPos() {
        try {
            var stored = localStorage.getItem('CHAT_APP_V3_island_pos');
            if (stored) {
                var pos = JSON.parse(stored);
                if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
                    islandPos.x = Math.max(0, pos.x);
                    islandPos.y = Math.max(ISLAND_MIN_Y, pos.y);
                    islandPos._hasDragged = !!pos._hasDragged;
                }
            }
        } catch(e) {}
    }

    function saveIslandPos() {
        try {
            localStorage.setItem('CHAT_APP_V3_island_pos', JSON.stringify({
                x: islandPos.x,
                y: islandPos.y,
                _hasDragged: islandPos._hasDragged
            }));
        } catch(e) {}
    }

    // ======================== 存储空间检测 ========================
    function calcStorageUsage() {
        var totalBytes = 0;
        for (var i = 0; i < playlist.length; i++) {
            var s = playlist[i];
            if (s.audioData) totalBytes += s.audioData.length;
            if (s.lrcData) totalBytes += s.lrcData.length;
        }
        return totalBytes;
    }

    function updateStorageBar() {
        if (!$storageBar || !$storageText) return;
        var used = calcStorageUsage();
        var usedMB = (used / (1024 * 1024)).toFixed(1);
        var pct = used / ESTIMATED_MAX;

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function(est) {
                var realMax = est.quota || ESTIMATED_MAX;
                var realPct = used / realMax;
                var realUsedMB = (used / (1024 * 1024)).toFixed(1);
                var realMaxMB = (realMax / (1024 * 1024)).toFixed(0);
                renderStorageText(realUsedMB, realMaxMB, realPct);
            }).catch(function() {
                renderStorageText(usedMB, (ESTIMATED_MAX / (1024 * 1024)).toFixed(0), pct);
            });
        } else {
            renderStorageText(usedMB, (ESTIMATED_MAX / (1024 * 1024)).toFixed(0), pct);
        }
    }

    function renderStorageText(usedMB, maxMB, pct) {
        $storageBar.className = 'music-storage-bar';
        if (pct > STORAGE_DANGER_PCT) {
            $storageBar.classList.add('danger');
            $storageText.innerHTML = '⚠ 存储空间紧张：' + usedMB + 'MB / ~' + maxMB + 'MB，建议清理旧歌曲';
        } else if (pct > STORAGE_WARN_PCT) {
            $storageBar.classList.add('warning');
            $storageText.textContent = '存储用量：' + usedMB + 'MB / ~' + maxMB + 'MB';
        } else {
            $storageText.textContent = '存储用量：' + usedMB + 'MB / ~' + maxMB + 'MB';
        }
    }

    function checkStorageBeforeImport(filesCount, estimatedSize) {
        var current = calcStorageUsage();
        var after = current + estimatedSize;
        if (after > ESTIMATED_MAX * STORAGE_DANGER_PCT) {
            var currentMB = (current / (1024 * 1024)).toFixed(1);
            var afterMB = (after / (1024 * 1024)).toFixed(1);
            var msg = '当前已用 ' + currentMB + 'MB，导入后将达 ' + afterMB + 'MB（可能超过存储上限）。\n\n建议先清理旧歌曲或使用「打开文件夹」索引模式。\n\n确定要继续导入吗？';
            return confirm(msg);
        }
        return true;
    }

    // ======================== 音频播放器 ========================
    function ensureAudio() {
        if (!audioEl) {
            audioEl = new Audio();
            audioEl.volume = currentVolume;
            audioEl.addEventListener('timeupdate', onAudioTimeUpdate);
            audioEl.addEventListener('ended', onAudioEnded);
            audioEl.addEventListener('loadedmetadata', onAudioLoaded);
            audioEl.addEventListener('error', onAudioError);
        }
        return audioEl;
    }

    function onAudioTimeUpdate() {
        if (!audioEl || !isPlaying) return;
        updateProgressUI();
        updateLyricsUI();
    }

    function onAudioEnded() {
        if (playMode === PLAY_MODE_REPEAT_ONE) {
            // ★ 单曲循环：重新播放当前歌曲
            if (audioEl) {
                recordListenDuration();
                leaderboardData.listenStartTime = Date.now();
                audioEl.currentTime = 0;
                audioEl.play().then(function() {
                    isPlaying = true;
                    updatePlayButton();
                    recordPlayCount(playlist[currentIndex]);
                }).catch(function() {});
            }
        } else {
            playNext();
        }
    }

    function onAudioLoaded() {
        if (!audioEl) return;
        if ($durTime) $durTime.textContent = formatTime(audioEl.duration || 0);
        if (currentIndex >= 0 && currentIndex < playlist.length) {
            playlist[currentIndex].duration = audioEl.duration || 0;
        }
    }

    function onAudioError() {
        console.warn('[MusicPlayer] 音频加载失败');
        notify('歌曲加载失败，请检查文件', 'error', 2500);
        playNext();
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateProgressUI() {
        if (!audioEl || !$progressBar || !$curTime) return;
        var dur = audioEl.duration || 0;
        if (dur > 0) $progressBar.value = (audioEl.currentTime / dur) * 1000;
        $curTime.textContent = formatTime(audioEl.currentTime);
    }

    function updateLyricsUI() {
        if (!audioEl) return;
        var song = playlist[currentIndex];
        if (!song || !song.lrcParsed || song.lrcParsed.length === 0) return;

        var ct = audioEl.currentTime || 0;
        var currentLineIdx = -1;
        for (var i = song.lrcParsed.length - 1; i >= 0; i--) {
            if (ct >= song.lrcParsed[i].time) { currentLineIdx = i; break; }
        }

        if ($lyricsPreview) {
            var html = '';
            for (var li = 0; li < song.lrcParsed.length; li++) {
                var cls = li === currentLineIdx ? ' class="lrc-current"' : '';
                html += '<div' + cls + '>' + escapeHTML(song.lrcParsed[li].text) + '</div>';
            }
            $lyricsPreview.innerHTML = html;
            if (currentLineIdx >= 0) {
                var currentEl = $lyricsPreview.querySelector('.lrc-current');
                if (currentEl) currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }

        // ★ 灵动岛歌词显示（独立于弹窗，在最小化或关闭弹窗后依然有效）
        if (islandVisible && $island && $islandLyric) {
            if (currentLineIdx >= 0) {
                $islandLyric.textContent = song.lrcParsed[currentLineIdx].text;
            } else if (song.lrcParsed.length > 0) {
                $islandLyric.textContent = song.lrcParsed[0].text;
            }
        }
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ======================== 歌曲播放控制 ========================
    function playSong(index) {
        if (index < 0 || index >= playlist.length) return;
        // ★ 记录上一首听歌时长
        recordListenDuration();
        currentIndex = index;
        var song = playlist[index];

        if (song._folderHandle && song._fileName) {
            playFromFolderHandle(song, index);
            return;
        }

        var audio = ensureAudio();
        if (song.audioData) {
            audio.src = song.audioData;
        } else {
            audio.src = '';
        }
        audio.volume = currentVolume;
        audio.play().then(function() {
            isPlaying = true;
            leaderboardData.listenStartTime = Date.now();
            updatePlayButton();
            renderPlaylist();
            renderNowPlaying();
            updateModeStatus();
            showDynamicIsland();
            if ($progressBar) $progressBar.value = 0;
            if ($curTime) $curTime.textContent = '0:00';
            updateLyricsUI();
            // ★ 记录播放排行
            recordPlayCount(song);
        }).catch(function(e) {
            console.warn('[MusicPlayer] 播放失败', e);
            notify('播放失败，请重试', 'error', 2000);
        });
    }

    function playFromFolderHandle(song, index) {
        song._folderHandle.getFileHandle(song._fileName).then(function(fileHandle) {
            return fileHandle.getFile();
        }).then(function(file) {
            var url = URL.createObjectURL(file);
            var audio = ensureAudio();
            audio.src = url;
            audio.volume = currentVolume;
            return audio.play();
        }).then(function() {
            isPlaying = true;
            leaderboardData.listenStartTime = Date.now();
            updatePlayButton();
            renderPlaylist();
            renderNowPlaying();
            updateModeStatus();
            showDynamicIsland();
            if ($progressBar) $progressBar.value = 0;
            if ($curTime) $curTime.textContent = '0:00';
            updateLyricsUI();
            // ★ 记录播放排行
            recordPlayCount(song);
        }).catch(function(e) {
            console.warn('[MusicPlayer] 文件夹索引播放失败', e);
            notify('无法读取文件，请确认文件夹权限', 'error', 2500);
        });
    }

    function togglePlay() {
        if (!audioEl || currentIndex < 0) {
            if (playlist.length > 0) playSong(0);
            return;
        }
        if (isPlaying) {
            audioEl.pause();
            isPlaying = false;
        } else {
            audioEl.play().then(function() {
                isPlaying = true;
            }).catch(function() {});
        }
        updatePlayButton();
        if ($islandIcon) $islandIcon.classList.toggle('paused', !isPlaying);
    }

    function playNext() {
        if (playlist.length === 0) return;
        if (playMode === PLAY_MODE_SHUFFLE) {
            // ★ 随机播放
            var next = Math.floor(Math.random() * playlist.length);
            if (playlist.length > 1 && next === currentIndex) {
                next = (next + 1) % playlist.length;
            }
            playSong(next);
        } else {
            // 顺序播放
            var next = (currentIndex + 1) % playlist.length;
            playSong(next);
        }
    }

    function playPrev() {
        if (playlist.length === 0) return;
        if (playMode === PLAY_MODE_SHUFFLE) {
            var prev = Math.floor(Math.random() * playlist.length);
            if (playlist.length > 1 && prev === currentIndex) {
                prev = (currentIndex + 1) % playlist.length;
            }
            playSong(prev);
        } else {
            var prev = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
            playSong(prev);
        }
    }

    function updatePlayButton() {
        if (!$playBtn) return;
        if (isPlaying) {
            $playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            $playBtn.classList.remove('paused');
        } else {
            $playBtn.innerHTML = '<i class="fas fa-play"></i>';
            $playBtn.classList.add('paused');
        }
    }

    // ★ 播放模式切换
    function togglePlayMode() {
        if (playMode === PLAY_MODE_SEQUENTIAL) {
            playMode = PLAY_MODE_SHUFFLE;
        } else if (playMode === PLAY_MODE_SHUFFLE) {
            playMode = PLAY_MODE_REPEAT_ONE;
        } else {
            playMode = PLAY_MODE_SEQUENTIAL;
        }
        updateModeText();
        savePlayMode();
    }

    function updateModeText() {
        if (!$modeText) return;
        var text = '';
        var icon = '';
        if (playMode === PLAY_MODE_SEQUENTIAL) {
            text = '顺序播放';
            icon = '↔';
        } else if (playMode === PLAY_MODE_SHUFFLE) {
            text = '随机播放';
            icon = '🔀';
        } else {
            text = '单曲循环';
            icon = '🔂';
        }
        $modeText.textContent = icon + ' ' + text;
        if ($modeBtn) {
            $modeBtn.title = text + '（点击切换）';
            if (playMode === PLAY_MODE_SHUFFLE) {
                $modeBtn.style.color = 'var(--accent-color)';
            } else if (playMode === PLAY_MODE_REPEAT_ONE) {
                $modeBtn.style.color = '#f59e0b';
            } else {
                $modeBtn.style.color = '';
            }
        }
    }

    // ★ 模式状态显示（独自听歌 / 和梦角一起听）
    function updateModeStatus() {
        if (!$modeStatus || !$modeStatusText) return;
        if (togetherMode) {
            $modeStatusText.textContent = '💕 和梦角一起听';
            $modeStatusText.className = 'mode-together';
        } else if (soloListener === 'partner') {
            $modeStatusText.textContent = '🌙 梦角在独自听歌';
            $modeStatusText.className = 'mode-solo';
        } else {
            $modeStatusText.textContent = '🎧 我在独自听歌';
            $modeStatusText.className = 'mode-solo';
        }
        $modeStatus.style.display = '';
        // 同步更新灵动岛标题
        if ($islandTitle) {
            var song = playlist[currentIndex];
            var prefix = togetherMode ? '💕 ' : (soloListener === 'partner' ? '🌙 ' : '');
            $islandTitle.textContent = prefix + (song ? song.title : '未在播放');
        }
    }

    // ======================== URL 导入 ========================
    function importFromURL() {
        if (!$urlInput) return;
        var url = $urlInput.value.trim();
        if (!url) { notify('请输入歌曲URL地址', 'warning', 2000); return; }
        if (!/^https?:\/\/.+\.mp3(\?.*)?$/i.test(url) && !/^https?:\/\/.+$/i.test(url)) {
            notify('请输入有效的URL链接', 'warning', 2000);
            return;
        }

        var baseName = url.split('/').pop().replace(/\?.*$/, '').replace(/\.mp3$/i, '').replace(/\.(mp3|wav|ogg|m4a)$/i, '') || 'URL歌曲';
        baseName = decodeURIComponent(baseName).replace(/[_-]/g, ' ').trim() || 'URL歌曲';

        var artistGuess = '';
        var titleGuess = baseName;
        var dashIdx = baseName.indexOf(' - ');
        if (dashIdx > 0) {
            artistGuess = baseName.substring(0, dashIdx).trim();
            titleGuess = baseName.substring(dashIdx + 3).trim();
        }

        var song = {
            id: 'url_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            title: titleGuess,
            artist: artistGuess,
            audioData: url,
            lrcData: '',
            lrcParsed: [],
            duration: 0,
            addedAt: Date.now(),
            isURL: true
        };

        playlist.push(song);
        savePlaylist();
        renderPlaylist();
        updateStorageBar();
        $urlInput.value = '';
        notify('已添加URL歌曲：' + titleGuess, 'success', 2000);
    }

    // ======================== 播放排行 ========================
    function recordPlayCount(song) {
        if (!song) return;
        var id = song.id;
        if (togetherMode) {
            // 一起听模式：只计入一起听排行（我的排行仅统计独自听歌）
            leaderboardData.togetherTop[id] = (leaderboardData.togetherTop[id] || 0) + 1;
        } else if (soloListener === 'partner') {
            // 梦角独自听歌：计入梦角排行（虚拟随机数据）
            leaderboardData.partnerTop[id] = (leaderboardData.partnerTop[id] || 0) + 1;
        } else {
            // 我在独自听歌：计入我的排行（真实播放数据）
            leaderboardData.myTop[id] = (leaderboardData.myTop[id] || 0) + 1;
        }
        saveLeaderboardData();
    }

    function recordPartnerPlay(song) {
        if (!song) return;
        // ★ 一起听模式下排行和时长由 recordPlayCount/recordListenDuration 计入 togetherTop/togetherTotalTime
        // 梦角独自听歌时才计入 partnerTop/partnerTotalTime（虚拟随机数据）
        if (!togetherMode) {
            leaderboardData.partnerTop[song.id] = (leaderboardData.partnerTop[song.id] || 0) + 1;
            var virtualDur = 60 + Math.floor(Math.random() * 240); // 60~300秒
            leaderboardData.partnerTotalTime += virtualDur;
            leaderboardData.totalListenTime += virtualDur;
        }
        // 梦角听歌记录（无论何种模式都记录历史）
        partnerListenHistory.push({
            id: 'ph_' + Date.now(),
            songId: song.id,
            title: song.title || '未知歌曲',
            artist: song.artist || '',
            time: Date.now(),
            together: togetherMode
        });
        if (partnerListenHistory.length > 200) partnerListenHistory.shift();
        saveLeaderboardData();
    }

    function recordListenDuration() {
        if (leaderboardData.listenStartTime > 0) {
            var dur = (Date.now() - leaderboardData.listenStartTime) / 1000;
            if (dur > 0 && dur < 3600) { // 忽略异常的极长时长
                leaderboardData.totalListenTime += dur; // 总时长 = 三者之和
                if (togetherMode) {
                    // 一起听模式：只计入一起听时长（我的时长仅统计独自听歌）
                    leaderboardData.togetherTotalTime += dur;
                } else if (soloListener === 'partner') {
                    // 梦角独自听歌：时长归属梦角（虚拟随机数据）
                    leaderboardData.partnerTotalTime += dur;
                } else {
                    // 我在独自听歌：时长归属我（真实播放数据）
                    leaderboardData.myTotalTime += dur;
                }
            }
        }
        leaderboardData.listenStartTime = Date.now();
    }

    function saveLeaderboardData() {
        try {
            var key = getMusicKey() + '_leaderboard';
            var data = {
                myTop: leaderboardData.myTop,
                togetherTop: leaderboardData.togetherTop,
                partnerTop: leaderboardData.partnerTop,
                totalListenTime: leaderboardData.totalListenTime,
                myTotalTime: leaderboardData.myTotalTime,
                togetherTotalTime: leaderboardData.togetherTotalTime,
                partnerTotalTime: leaderboardData.partnerTotalTime,
                partnerHistory: partnerListenHistory
            };
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {}
    }

    function loadLeaderboardData() {
        try {
            var key = getMusicKey() + '_leaderboard';
            var raw = localStorage.getItem(key);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.myTop) leaderboardData.myTop = data.myTop;
                if (data.togetherTop) leaderboardData.togetherTop = data.togetherTop;
                if (data.partnerTop) leaderboardData.partnerTop = data.partnerTop;
                if (data.totalListenTime) leaderboardData.totalListenTime = data.totalListenTime;
                if (data.myTotalTime) leaderboardData.myTotalTime = data.myTotalTime;
                if (data.togetherTotalTime) leaderboardData.togetherTotalTime = data.togetherTotalTime;
                if (data.partnerTotalTime) leaderboardData.partnerTotalTime = data.partnerTotalTime;
                if (data.partnerHistory) partnerListenHistory = data.partnerHistory;
            }
        } catch (e) {}
    }

    function getSongNameById(id) {
        for (var i = 0; i < playlist.length; i++) {
            if (playlist[i].id === id) return playlist[i].title || '未知歌曲';
        }
        // 可能歌曲已被删除，从历史记录查
        for (var j = 0; j < partnerListenHistory.length; j++) {
            if (partnerListenHistory[j].songId === id) return partnerListenHistory[j].title || '未知歌曲';
        }
        return '未知歌曲';
    }

    function getTopSongs(data, topN) {
        topN = topN || 20;
        var entries = [];
        for (var id in data) {
            if (data.hasOwnProperty(id)) entries.push({ id: id, count: data[id] });
        }
        entries.sort(function(a, b) { return b.count - a.count; });
        return entries.slice(0, topN);
    }

    function formatListeningTime(seconds) {
        if (!seconds || seconds < 0) return '0分钟';
        var totalSec = Math.floor(seconds);
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        var parts = [];
        if (h > 0) parts.push(h + '小时');
        if (m > 0) parts.push(m + '分钟');
        if (s > 0 || parts.length === 0) parts.push(s + '秒');
        return parts.join('');
    }

    function renderLeaderboard(which) {
        if (!$lbList) return;
        var items, title;
        var isTime = false;

        if (which === 'my-top') {
            items = getTopSongs(leaderboardData.myTop);
        } else if (which === 'together-top') {
            items = getTopSongs(leaderboardData.togetherTop);
        } else if (which === 'partner-top') {
            items = getTopSongs(leaderboardData.partnerTop);
        } else if (which === 'total-time') {
            isTime = true;
            $lbList.innerHTML =
                '<div class="music-lb-total">' +
                '<div class="music-lb-total-value">' + formatListeningTime(leaderboardData.totalListenTime) + '</div>' +
                '<div class="music-lb-total-label">总听歌时长</div>' +
                '<div style="display:flex;justify-content:space-around;margin-top:16px;gap:10px;flex-wrap:wrap;">' +
                '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:600;color:var(--accent-color);">' + formatListeningTime(leaderboardData.myTotalTime) + '</div><div style="font-size:0.65rem;color:var(--text-secondary);margin-top:2px;">🎧 我独自听</div></div>' +
                '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:600;color:#e94560;">' + formatListeningTime(leaderboardData.togetherTotalTime) + '</div><div style="font-size:0.65rem;color:var(--text-secondary);margin-top:2px;">💕 一起听</div></div>' +
                '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:600;color:#f59e0b;">' + formatListeningTime(leaderboardData.partnerTotalTime || 0) + '</div><div style="font-size:0.65rem;color:var(--text-secondary);margin-top:2px;">🌙 梦角听</div></div>' +
                '</div>' +
                '</div>';
            return;
        }

        if (!items || items.length === 0) {
            $lbList.innerHTML = '<div class="music-lb-empty">暂无排行数据，多听听歌吧~</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var rank = i + 1;
            var rankCls = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : 'rn';
            var rankIcon = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            var name = getSongNameById(items[i].id);
            html +=
                '<div class="music-lb-item">' +
                '<div class="music-lb-rank ' + rankCls + '">' + rankIcon + '</div>' +
                '<div class="music-lb-info">' +
                '<div class="music-lb-name">' + escapeHTML(name) + '</div>' +
                '<div class="music-lb-count">播放 ' + items[i].count + ' 次</div>' +
                '</div>' +
                '</div>';
        }
        $lbList.innerHTML = html;
    }

    function openLeaderboard() {
        if (!$lbOverlay) cacheDOM();
        if (!$lbOverlay) return;
        $lbOverlay.classList.add('active');
        renderLeaderboard('my-top');
        // 激活第一个tab
        var tabs = document.querySelectorAll('.music-lb-tab');
        if (tabs.length > 0) {
            for (var t = 0; t < tabs.length; t++) tabs[t].classList.remove('active');
            tabs[0].classList.add('active');
        }
    }

    function closeLeaderboard() {
        if (!$lbOverlay) return;
        $lbOverlay.classList.remove('active');
    }

    // ======================== 邀请梦角一起听（用户主动） ========================
    function invitePartner() {
        if (!togetherMode && (!isPlaying || currentIndex < 0)) {
            showPartnerActionPopup('🎵', '需要先播放歌曲', '请先开始播放一首歌曲，再邀请梦角哦~');
            return;
        }
        if (togetherMode) {
            // 已经在一起听模式，退出
            exitTogetherMode('me');
            return;
        }
        if (!$inviteOverlay) cacheDOM();
        if (!$inviteOverlay) return;

        var song = playlist[currentIndex];
        if (!$inviteSong) return;
        $inviteSong.textContent = (song.title || '未知歌曲') + (song.artist ? ' - ' + song.artist : '');

        // 修改弹窗文字
        var titleEl = document.querySelector('.music-invite-title');
        if (titleEl) titleEl.textContent = '邀请梦角一起听歌';
        var subtitleEl = document.querySelector('.music-invite-subtitle');
        if (subtitleEl) subtitleEl.textContent = '正在等待梦角回应... (30秒超时)';

        // 重新绑定接受按钮
        if ($inviteAccept) {
            $inviteAccept.onclick = partnerAcceptInvite;
        }
        if ($inviteDecline) {
            $inviteDecline.onclick = partnerDeclineInvite;
        }

        // ★ 确保播放器不最小化
        if ($overlay && !$overlay.classList.contains('active')) {
            openPlayer();
        }
        $inviteOverlay.classList.add('active');

        // ★ 30秒超时
        if (partnerInviteTimeout) clearTimeout(partnerInviteTimeout);
        partnerInviteTimeout = setTimeout(function() {
            hideInviteModal();
            // ★ 超时结果弹窗
            showPartnerActionPopup('⏰', '邀请超时', '梦角没有回应，可能正在忙...', resetInviteModal);
        }, INVITE_TIMEOUT);
    }

    function resetInviteModal() {
        if ($inviteAccept) $inviteAccept.onclick = onInviteAccept;
        if ($inviteDecline) $inviteDecline.onclick = onInviteDecline;
        var titleEl = document.querySelector('.music-invite-title');
        if (titleEl) titleEl.textContent = '梦角邀请你一起听歌';
        var subtitleEl = document.querySelector('.music-invite-subtitle');
        if (subtitleEl) subtitleEl.textContent = '「要不要一起听这首歌？」';
    }

    function partnerAcceptInvite() {
        if (partnerInviteTimeout) clearTimeout(partnerInviteTimeout);
        hideInviteModal();
        enterTogetherMode();
        var song = playlist[currentIndex];
        var songName = song ? (song.title || '未知歌曲') : '未知歌曲';
        // ★ 使用弹窗显示接受结果
        showPartnerActionPopup('💕', '梦角接受了邀请！', '一起听「' + songName + '」♪(´▽｀)', resetInviteModal);
    }

    function partnerDeclineInvite() {
        if (partnerInviteTimeout) clearTimeout(partnerInviteTimeout);
        hideInviteModal();
        // ★ 使用弹窗显示拒绝结果
        showPartnerActionPopup('😊', '梦角婉拒了', '梦角说："现在不太方便，下次吧~"', resetInviteModal);
    }

    // ======================== 一起听模式 ========================
    function enterTogetherMode() {
        togetherMode = true;
        soloListener = 'me';
        updateModeStatus();
        if ($inviteBtn) $inviteBtn.innerHTML = '<i class="fas fa-user-times"></i> 退出一起听';
        if ($inviteBtn) $inviteBtn.style.borderColor = '#e94560';
        // 开始梦角行为计时器
        schedulePartnerAction();
    }

    /** ★ [优化] 退出一起听模式，who: 'me' | 'partner'，区分弹窗提示 */
    function exitTogetherMode(who) {
        who = who || 'me';
        togetherMode = false;
        soloListener = who === 'partner' ? 'partner' : 'me';
        updateModeStatus();
        if ($inviteBtn) $inviteBtn.innerHTML = '<i class="fas fa-user-plus"></i> 邀请梦角一起听';
        if ($inviteBtn) $inviteBtn.style.borderColor = '';
        if (partnerActionTimer) clearTimeout(partnerActionTimer);
        partnerActionTimer = null;
        if (who === 'partner') {
            notify('💔 梦角退出了一起听歌', 'warning', 4000);
        } else {
            notify('我退出了一起听歌', 'info', 3000);
        }
    }

    function schedulePartnerAction() {
        if (partnerActionTimer) clearTimeout(partnerActionTimer);
        if (!togetherMode || !isPlaying) return;
        var delay = PARTNER_ACTION_MIN + Math.random() * (PARTNER_ACTION_MAX - PARTNER_ACTION_MIN);
        partnerActionTimer = setTimeout(function() {
            if (!togetherMode || !isPlaying) { schedulePartnerAction(); return; }
            triggerPartnerAction();
        }, delay);
    }

    /** ★ [优化] 梦角随机行为：自动执行切歌/暂停/退出，弹窗提示无需确认 */
    function triggerPartnerAction() {
        // ★ 20%切歌，15%暂停，10%退出，55%无动作（仅重新计时）
        var roll = Math.random();

        // ─── 10% 梦角退出一起听 ───
        if (roll < 0.10) {
            var exitMsgs = [
                '💔 梦角说"有点困了，明天再听吧~"',
                '💔 梦角说"要忙一下，先退出来啦"',
                '💔 梦角说"手机没电了，先不听了"',
                '💔 梦角说"去吃饭了，回头再一起听~"'
            ];
            notify(exitMsgs[Math.floor(Math.random() * exitMsgs.length)], 'warning', 4000);
            setTimeout(function() {
                if (togetherMode) exitTogetherMode('partner');
            }, 2000);
            return;
        }

        // ─── 15% 暂停 ───
        if (roll < 0.25 && isPlaying) {
            notify('⏸️ 梦角暂停了音乐，说"等一下，我去拿杯水"', 'info', 4000);
            togglePlay();
            if (!isPlaying && togetherMode) {
                // 梦角暂停后，过3-30秒自动恢复
                setTimeout(function() {
                    if (togetherMode && !isPlaying) {
                        notify('▶️ 梦角恢复了播放，说"好了，继续听吧~"', 'success', 4000);
                        togglePlay();
                        schedulePartnerAction();
                    }
                }, 3000 + Math.random() * 27000);
            } else {
                schedulePartnerAction();
            }
        }
        // ─── 20% 切歌 ───
        else if (roll < 0.45) {
            if (playlist.length <= 1) {
                schedulePartnerAction();
                return;
            }
            var newIndex;
            do {
                newIndex = Math.floor(Math.random() * playlist.length);
            } while (newIndex === currentIndex);

            var song = playlist[newIndex];
            notify('🎵 梦角切到了「' + (song.title || '未知歌曲') + '」', 'info', 4000);
            recordPartnerPlay(song);
            playSong(newIndex);
            schedulePartnerAction();
        }
        // ─── 55% 无动作，仅重新计时 ───
        else {
            schedulePartnerAction();
        }
    }

    function showPartnerActionPopup(icon, title, subtitle, callback) {
        if (!$partnerActionOverlay) cacheDOM();
        if (!$partnerActionOverlay) { if (callback) callback(); return; }
        if ($partnerActionIcon) $partnerActionIcon.textContent = icon;
        if ($partnerActionTitle) $partnerActionTitle.textContent = title;
        if ($partnerActionSubtitle) $partnerActionSubtitle.textContent = subtitle;
        if ($partnerActionOk) {
            $partnerActionOk.onclick = function() {
                hidePartnerActionPopup();
                if (callback) callback();
            };
        }
        $partnerActionOverlay.classList.add('active');
    }

    function hidePartnerActionPopup() {
        if (!$partnerActionOverlay) return;
        $partnerActionOverlay.classList.remove('active');
    }

    // ★ 伙伴随机接受邀请概率（梦角主动邀请）
    var _partnerAcceptProbability = 0.4;

    function triggerPartnerAutoInvite() {
        if (togetherMode) return; // 已在一起听模式，不需要再邀请
        if (playlist.length === 0) return;
        if (inviteCooldown > 0) { inviteCooldown--; return; }
        var roll = Math.random();
        if (roll >= _partnerAcceptProbability * 0.3) return;
        showInviteModal();
        inviteCooldown = 6 + Math.floor(Math.random() * 8);
    }

    // 公开排行榜数据供TA手机读取
    function getLeaderboardData() {
        return {
            myTop: leaderboardData.myTop,
            togetherTop: leaderboardData.togetherTop,
            partnerTop: leaderboardData.partnerTop,
            totalListenTime: leaderboardData.totalListenTime,
            myTotalTime: leaderboardData.myTotalTime,
            togetherTotalTime: leaderboardData.togetherTotalTime,
            partnerTotalTime: leaderboardData.partnerTotalTime,
            partnerHistory: partnerListenHistory
        };
    }

    function renderNowPlaying() {
        if (currentIndex < 0 || currentIndex >= playlist.length) {
            if ($nowTitle) $nowTitle.textContent = '未在播放';
            if ($nowArtist) $nowArtist.textContent = '';
            return;
        }
        var song = playlist[currentIndex];
        if ($nowTitle) $nowTitle.textContent = song.title || '未知歌曲';
        if ($nowArtist) $nowArtist.textContent = song.artist || '未知艺术家';
    }

    function renderPlaylist() {
        if (!$playlistEl) return;
        $playlistEl.innerHTML = '';
        for (var i = 0; i < playlist.length; i++) {
            var song = playlist[i];
            var isCurrent = i === currentIndex;
            var isSelected = selectMode && selectedSet[song.id];
            var cls = 'music-song-item'
                + (isCurrent ? ' playing' : '')
                + (selectMode ? ' select-mode' : '')
                + (isSelected ? ' selected' : '');
            var durText = song.duration ? formatTime(song.duration) : '--:--';
            var folderBadge = (song._fileName && !song.audioData) ? ' 📂' : '';
            $playlistEl.innerHTML +=
                '<div class="' + cls + '" data-index="' + i + '" data-id="' + song.id + '">' +
                '<div class="music-song-check"><i class="fas fa-check"></i></div>' +
                '<div class="music-song-index">' + (i + 1) + '</div>' +
                '<div class="music-song-info">' +
                '<div class="music-song-name" title="' + escapeHTML(song.title || '') + '">' + escapeHTML(song.title || '未知歌曲') + folderBadge + '</div>' +
                '<div class="music-song-duration">' + durText + '</div>' +
                '</div>' +
                '<button class="music-song-delete" data-index="' + i + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
                '</div>';
        }

        $playlistEl.onclick = function(e) {
            var delBtn = e.target.closest('.music-song-delete');
            if (delBtn) {
                e.stopPropagation();
                var idx = parseInt(delBtn.getAttribute('data-index'), 10);
                deleteSong(idx);
                return;
            }
            var item = e.target.closest('.music-song-item');
            if (!item) return;
            if (selectMode) {
                var sid = item.getAttribute('data-id');
                toggleSelect(sid);
                return;
            }
            var idx = parseInt(item.getAttribute('data-index'), 10);
            playSong(idx);
        };
    }

    function deleteSong(index) {
        if (index < 0 || index >= playlist.length) return;
        var song = playlist[index];
        var title = song.title || '这首歌';
        delete selectedSet[song.id];
        playlist.splice(index, 1);
        if (index === currentIndex) {
            stopPlayback();
        } else if (index < currentIndex) {
            currentIndex--;
        }
        savePlaylist();
        renderPlaylist();
        renderNowPlaying();
        updateStorageBar();
        notify('已删除「' + title + '」', 'info', 1500);
    }

    function stopPlayback() {
        recordListenDuration();
        if (audioEl) { audioEl.pause(); audioEl.src = ''; }
        isPlaying = false;
        currentIndex = -1;
        _minimized = false;
        updatePlayButton();
        hideDynamicIsland();
        if ($nowTitle) $nowTitle.textContent = '未在播放';
        if ($nowArtist) $nowArtist.textContent = '';
        if ($lyricsPreview) $lyricsPreview.innerHTML = '';
        if ($progressBar) $progressBar.value = 0;
        if ($curTime) $curTime.textContent = '0:00';
        if ($durTime) $durTime.textContent = '0:00';
        // ★ 停止时退出一起听
        if (togetherMode) exitTogetherMode('me');
    }

    // ======================== 批量选择模式 ========================
    function enterSelectMode() {
        selectMode = true;
        selectedSet = {};
        if ($batchBar) $batchBar.style.display = 'flex';
        updateSelectUI();
        renderPlaylist();
    }

    function exitSelectMode() {
        selectMode = false;
        selectedSet = {};
        if ($batchBar) $batchBar.style.display = 'none';
        renderPlaylist();
    }

    function toggleSelect(songId) {
        if (selectedSet[songId]) {
            delete selectedSet[songId];
        } else {
            selectedSet[songId] = true;
        }
        updateSelectUI();
        renderPlaylist();
    }

    function selectAll() {
        for (var i = 0; i < playlist.length; i++) {
            selectedSet[playlist[i].id] = true;
        }
        updateSelectUI();
        renderPlaylist();
    }

    function deselectAll() {
        selectedSet = {};
        updateSelectUI();
        renderPlaylist();
    }

    function updateSelectUI() {
        if (!$batchCount) return;
        var count = Object.keys(selectedSet).length;
        $batchCount.textContent = '已选 ' + count + ' 首';
    }

    function deleteSelectedSongs() {
        var ids = Object.keys(selectedSet);
        if (ids.length === 0) { notify('请先选择歌曲', 'warning', 1500); return; }
        if (!confirm('确定删除选中的 ' + ids.length + ' 首歌曲吗？此操作不可恢复。')) return;

        var idSet = {};
        for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;

        var newPlaylist = [];
        var removedBefore = 0;
        var wasPlayingRemoved = false;

        for (var j = 0; j < playlist.length; j++) {
            if (idSet[playlist[j].id]) {
                if (j === currentIndex) wasPlayingRemoved = true;
                if (j < currentIndex) removedBefore++;
            } else {
                newPlaylist.push(playlist[j]);
            }
        }

        playlist = newPlaylist;
        if (wasPlayingRemoved) {
            stopPlayback();
        } else if (removedBefore > 0) {
            currentIndex -= removedBefore;
        }
        exitSelectMode();
        savePlaylist();
        renderPlaylist();
        renderNowPlaying();
        updateStorageBar();
        notify('已批量删除 ' + ids.length + ' 首歌曲', 'success', 2000);
    }

    // ======================== 文件导入 ========================
    function importFiles(files) {
        if (!files || files.length === 0) return;

        var audioFiles = [];
        var lrcFiles = [];

        for (var i = 0; i < files.length; i++) {
            if (/\.mp3$/i.test(files[i].name)) {
                audioFiles.push(files[i]);
            } else if (/\.lrc$/i.test(files[i].name)) {
                lrcFiles.push(files[i]);
            }
        }

        if (audioFiles.length === 0) {
            notify('请选择 .mp3 音频文件', 'warning', 2000);
            return;
        }

        var totalAudioSize = 0;
        for (var ai = 0; ai < audioFiles.length; ai++) {
            totalAudioSize += audioFiles[ai].size;
        }
        if (!checkStorageBeforeImport(audioFiles.length, totalAudioSize)) return;

        var lrcMap = {};
        for (var j = 0; j < lrcFiles.length; j++) {
            var lrcName = lrcFiles[j].name.replace(/\.lrc$/i, '');
            lrcMap[lrcName] = lrcFiles[j];
        }

        var pending = audioFiles.length;
        var imported = 0;
        var failed = 0;

        showImportProgress('正在导入 ' + pending + ' 首歌曲...');

        for (var k = 0; k < audioFiles.length; k++) {
            (function(audioFile) {
                var baseName = audioFile.name.replace(/\.mp3$/i, '');
                var artistGuess = '';
                var titleGuess = baseName;
                var dashIdx = baseName.indexOf(' - ');
                if (dashIdx > 0) {
                    artistGuess = baseName.substring(0, dashIdx).trim();
                    titleGuess = baseName.substring(dashIdx + 3).trim();
                }

                var audioReader = new FileReader();
                audioReader.onload = function(ae) {
                    var audioData = ae.target.result;
                    var matchedLrc = lrcMap[baseName];

                    var finishSong = function(lrc, parsed) {
                        var song = {
                            id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                            title: titleGuess,
                            artist: artistGuess,
                            audioData: audioData,
                            lrcData: lrc || '',
                            lrcParsed: parsed || [],
                            duration: 0,
                            addedAt: Date.now()
                        };
                        playlist.push(song);
                        imported++;
                        pending--;
                        updateImportProgress(imported, pending + imported);
                        if (pending === 0) finishImport(imported, failed);
                    };

                    if (matchedLrc) {
                        var lrcReader = new FileReader();
                        lrcReader.onload = function(le) {
                            var lrcText = le.target.result;
                            var result = parseLRC(lrcText);
                            if (result.title) titleGuess = result.title;
                            if (result.artist) artistGuess = result.artist;
                            finishSong(lrcText, result.lyrics);
                        };
                        lrcReader.onerror = function() { finishSong('', []); };
                        lrcReader.readAsText(matchedLrc);
                    } else {
                        finishSong('', []);
                    }
                };
                audioReader.onerror = function() {
                    failed++;
                    pending--;
                    if (pending === 0) finishImport(imported, failed);
                };
                audioReader.readAsDataURL(audioFile);
            })(audioFiles[k]);
        }
    }

    function showImportProgress(msg) {
        removeImportProgress();
        var div = document.createElement('div');
        div.className = 'music-import-progress';
        div.id = 'music-import-progress';
        div.innerHTML =
            '<div>' + msg + '</div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>' +
            '<div class="progress-text">0/' + '—' + '</div>';
        if ($uploadArea && $uploadArea.parentNode) {
            $uploadArea.parentNode.insertBefore(div, $uploadArea.nextSibling);
        }
    }

    function updateImportProgress(done, total) {
        var el = document.getElementById('music-import-progress');
        if (!el) return;
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        var fill = el.querySelector('.progress-fill');
        if (fill) fill.style.width = pct + '%';
        var text = el.querySelector('.progress-text');
        if (text) text.textContent = done + '/' + total;
    }

    function removeImportProgress() {
        var el = document.getElementById('music-import-progress');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function finishImport(imported, failed) {
        removeImportProgress();
        savePlaylist();
        renderPlaylist();
        updateStorageBar();
        var msg = '成功导入 ' + imported + ' 首歌曲';
        if (failed > 0) msg += '，' + failed + ' 首失败';
        notify(msg, failed > 0 ? 'warning' : 'success', 2500);
    }

    // ======================== ZIP 导入 ========================
    function importZip(file) {
        if (!file) return;
        if (file.size > ZIP_MAX_SIZE) {
            notify('ZIP 文件不能超过 40MB', 'error', 3000);
            return;
        }
        if (!checkStorageBeforeImport(0, file.size * 2)) return;

        if (typeof JSZip === 'undefined') {
            notify('JSZip 库未加载，请刷新页面后重试', 'error', 3000);
            return;
        }

        showImportProgress('正在解析 ZIP 压缩包...');

        var reader = new FileReader();
        reader.onload = function(e) {
            JSZip.loadAsync(e.target.result).then(function(zip) {
                var audioMap = {};
                var lrcMap = {};

                zip.forEach(function(relativePath, zipEntry) {
                    if (zipEntry.dir) return;
                    var name = relativePath.split('/').pop();
                    if (/\.mp3$/i.test(name)) {
                        audioMap[name.replace(/\.mp3$/i, '')] = zipEntry;
                    } else if (/\.lrc$/i.test(name)) {
                        lrcMap[name.replace(/\.lrc$/i, '')] = zipEntry;
                    }
                });

                var audioEntries = Object.keys(audioMap);
                if (audioEntries.length === 0) {
                    removeImportProgress();
                    notify('ZIP 包中未找到 .mp3 文件', 'warning', 2500);
                    return;
                }

                updateImportProgress(0, audioEntries.length);
                updateImportMessage('正在导入 ' + audioEntries.length + ' 首歌曲...');

                var pending = audioEntries.length;
                var imported = 0;
                var failed = 0;

                for (var i = 0; i < audioEntries.length; i++) {
                    (function(baseName, idx) {
                        var audioEntry = audioMap[baseName];
                        var artistGuess = '';
                        var titleGuess = baseName;
                        var dashIdx = baseName.indexOf(' - ');
                        if (dashIdx > 0) {
                            artistGuess = baseName.substring(0, dashIdx).trim();
                            titleGuess = baseName.substring(dashIdx + 3).trim();
                        }

                        audioEntry.async('base64').then(function(audioBase64) {
                            var audioData = 'data:audio/mpeg;base64,' + audioBase64;
                            var lrcEntry = lrcMap[baseName];

                            var finish = function(lrcText, lrcParsed) {
                                playlist.push({
                                    id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                                    title: titleGuess,
                                    artist: artistGuess,
                                    audioData: audioData,
                                    lrcData: lrcText || '',
                                    lrcParsed: lrcParsed || [],
                                    duration: 0,
                                    addedAt: Date.now()
                                });
                                imported++;
                                pending--;
                                updateImportProgress(imported, audioEntries.length);
                                if (pending === 0) finishImport(imported, failed);
                            };

                            if (lrcEntry) {
                                lrcEntry.async('string').then(function(lrcText) {
                                    var parsed = parseLRC(lrcText);
                                    if (parsed.title) titleGuess = parsed.title;
                                    if (parsed.artist) artistGuess = parsed.artist;
                                    finish(lrcText, parsed.lyrics);
                                }).catch(function() { finish('', []); });
                            } else {
                                finish('', []);
                            }
                        }).catch(function(err) {
                            console.warn('[MusicPlayer] ZIP 解析失败: ' + baseName, err);
                            failed++;
                            pending--;
                            if (pending === 0) finishImport(imported, failed);
                        });
                    })(audioEntries[i], i);
                }
            }).catch(function(err) {
                removeImportProgress();
                console.error('[MusicPlayer] ZIP 解压失败', err);
                notify('ZIP 解压失败，请检查文件是否损坏', 'error', 3000);
            });
        };
        reader.onerror = function() {
            removeImportProgress();
            notify('ZIP 文件读取失败', 'error', 2500);
        };
        reader.readAsArrayBuffer(file);
    }

    function updateImportMessage(msg) {
        var el = document.getElementById('music-import-progress');
        if (!el) return;
        var div = el.querySelector('div');
        if (div) div.textContent = msg;
    }

    // ======================== 导出 ZIP 备份 ========================
    function exportAllAsZip() {
        if (playlist.length === 0) {
            notify('歌单为空，无法导出', 'warning', 2000);
            return;
        }
        if (typeof JSZip === 'undefined') {
            notify('JSZip 库未加载，请刷新页面后重试', 'error', 2500);
            return;
        }

        var exportable = [];
        for (var i = 0; i < playlist.length; i++) {
            if (playlist[i].audioData) exportable.push(playlist[i]);
        }
        if (exportable.length === 0) {
            notify('没有可导出的歌曲（索引模式歌曲不包含文件数据）', 'warning', 2500);
            return;
        }

        notify('正在打包 ' + exportable.length + ' 首歌曲...', 'info', 2000);

        var zip = new JSZip();
        for (var j = 0; j < exportable.length; j++) {
            var song = exportable[j];
            var baseName = song.title || 'unknown_' + j;
            baseName = baseName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);

            if (song.audioData) {
                var audioBase64 = song.audioData.split(',')[1];
                zip.file(baseName + '.mp3', audioBase64, { base64: true });
            }
            if (song.lrcData) {
                zip.file(baseName + '.lrc', song.lrcData);
            } else if (song.lrcParsed && song.lrcParsed.length > 0) {
                var lrcText = '';
                for (var li = 0; li < song.lrcParsed.length; li++) {
                    var t = song.lrcParsed[li].time;
                    var m = Math.floor(t / 60);
                    var s = Math.floor(t % 60);
                    var ms = Math.floor((t % 1) * 100);
                    lrcText += '[' + pad2(m) + ':' + pad2(s) + '.' + pad2(ms) + ']' + song.lrcParsed[li].text + '\n';
                }
                zip.file(baseName + '.lrc', lrcText);
            }
        }

        zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'music_backup_' + formatDate(new Date()) + '.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify('导出成功！' + exportable.length + ' 首歌曲已打包', 'success', 3000);
        }).catch(function(err) {
            console.error('[MusicPlayer] ZIP 生成失败', err);
            notify('导出失败，请重试', 'error', 2500);
        });
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function formatDate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    // ======================== 本地文件夹读取（索引模式） ========================
    function openFolder() {
        if (!window.showDirectoryPicker) {
            notify('当前浏览器不支持文件夹读取 API，请使用 Chrome/Edge 浏览器', 'warning', 3500);
            return;
        }
        window.showDirectoryPicker({ mode: 'read' }).then(function(handle) {
            folderHandle = handle;
            notify('文件夹已打开，正在扫描音乐文件...', 'info', 2000);
            scanFolder(handle);
        }).catch(function(err) {
            if (err.name !== 'AbortError') {
                console.warn('[MusicPlayer] 文件夹选取失败', err);
                notify('文件夹打开失败，请重试', 'error', 2000);
            }
        });
    }

    function scanFolder(dirHandle) {
        var audioEntries = [];
        var lrcEntries = [];

        function scan(handle, prefix) {
            var entries = handle.values();
            var promises = [];
            function processNext() {
                return entries.next().then(function(result) {
                    if (result.done) return;
                    var entry = result.value;
                    var name = entry.name;
                    if (entry.kind === 'directory') {
                        promises.push(scan(entry, prefix + name + '/'));
                    } else if (entry.kind === 'file') {
                        if (/\.mp3$/i.test(name)) {
                            audioEntries.push({ name: name, handle: entry, prefix: prefix });
                        } else if (/\.lrc$/i.test(name)) {
                            lrcEntries.push({ name: name, handle: entry, prefix: prefix });
                        }
                    }
                    return processNext();
                });
            }
            promises.push(processNext());
            return Promise.all(promises);
        }

        showImportProgress('正在扫描文件夹...');

        scan(dirHandle, '').then(function() {
            removeImportProgress();
            if (audioEntries.length === 0) {
                notify('文件夹中未找到 .mp3 文件', 'warning', 2500);
                return;
            }

            var lrcMap = {};
            for (var i = 0; i < lrcEntries.length; i++) {
                var lrn = lrcEntries[i].name.replace(/\.lrc$/i, '');
                lrcMap[lrn] = lrcEntries[i];
            }

            showImportProgress('正在索引 ' + audioEntries.length + ' 首歌曲...');
            var added = 0;
            for (var j = 0; j < audioEntries.length; j++) {
                var ae = audioEntries[j];
                var baseName = ae.name.replace(/\.mp3$/i, '');
                var artistGuess = '';
                var titleGuess = baseName;
                var dashIdx = baseName.indexOf(' - ');
                if (dashIdx > 0) {
                    artistGuess = baseName.substring(0, dashIdx).trim();
                    titleGuess = baseName.substring(dashIdx + 3).trim();
                }

                playlist.push({
                    id: 'folder_' + Date.now() + '_' + j + '_' + Math.random().toString(36).slice(2, 6),
                    title: titleGuess,
                    artist: artistGuess,
                    audioData: '',
                    lrcData: '',
                    lrcParsed: [],
                    duration: 0,
                    addedAt: Date.now(),
                    _folderHandle: dirHandle,
                    _fileName: (ae.prefix || '') + ae.name,
                    _lrcHandle: lrcMap[baseName] || null
                });
                added++;
            }

            removeImportProgress();
            savePlaylist();
            renderPlaylist();
            updateStorageBar();
            notify('已索引 ' + added + ' 首歌曲（不占用浏览器存储）', 'success', 3000);
            loadFolderLRC();
        }).catch(function(err) {
            removeImportProgress();
            console.error('[MusicPlayer] 文件夹扫描失败', err);
            notify('文件夹扫描失败：' + err.message, 'error', 3000);
        });
    }

    function loadFolderLRC() {
        for (var i = 0; i < playlist.length; i++) {
            var song = playlist[i];
            if (!song._lrcHandle || song.lrcData) continue;
            (function(s) {
                s._lrcHandle.getFile().then(function(file) {
                    return file.text();
                }).then(function(text) {
                    s.lrcData = text;
                    s.lrcParsed = parseLRC(text).lyrics;
                    if (currentIndex >= 0 && playlist[currentIndex] === s) {
                        renderPlaylist();
                    }
                }).catch(function() {});
            })(song);
        }
    }

    // ================================================================
    // ★ 灵动岛悬浮窗口（body 直接子级，全局脱离 main-chat-area）
    //   [初始居中] CSS left:50%; translateX(-50%) 居中，不用 JS 设置 left
    //   [拖拽接管] 用户拖拽后 _hasDragged=true，JS 用绝对坐标
    //   [恢复弹窗] 点击灵动岛 → 打开音乐弹窗，隐藏灵动岛
    // ================================================================
    function showDynamicIsland() {
        if (!$island) return;
        var song = playlist[currentIndex];
        if (!song) return;

        if ($islandTitle) $islandTitle.textContent = song.title || '未知歌曲';
        if ($islandLyric) {
            $islandLyric.textContent = song.lrcParsed && song.lrcParsed.length > 0
                ? song.lrcParsed[0].text : '暂无歌词';
        }
        if ($islandIcon) $islandIcon.classList.remove('paused');

        // ★ [初始居中] 如果从未拖拽过，不设置 left/top，让 CSS left:50%; translateX(-50%) 生效
        //   仅重置 transform 清除之前可能的 JS 覆盖
        $island.style.display = 'flex';
        $island.style.opacity = '';
        $island.style.pointerEvents = '';
        $island.classList.remove('island-hidden', 'drag-taken');

        if (!islandPos._hasDragged) {
            // 初始状态：重置 JS 内联样式，让 CSS 居中生效
            $island.style.left = '';
            $island.style.top = '';
            $island.style.transform = '';
        } else {
            // 用户已拖拽过：使用保存的绝对坐标
            $island.style.left = islandPos.x + 'px';
            $island.style.top = islandPos.y + 'px';
            $island.style.transform = 'none';
            $island.classList.add('drag-taken');
        }

        islandVisible = true;
    }

    function hideDynamicIsland() {
        if (!$island) return;
        $island.style.display = 'none';
        islandVisible = false;
    }

    function updateIslandPosition() {
        if (!$island) return;
        // ★ 仅在用户拖拽过（_hasDragged=true）后才设置绝对坐标
        if (islandPos._hasDragged) {
            $island.style.left = islandPos.x + 'px';
            $island.style.top = islandPos.y + 'px';
            $island.style.transform = 'none';
            $island.classList.add('drag-taken');
        }
    }

    // ★ [全局脱离] 拖拽边界基于 window 可视区域
    function initIslandDrag() {
        if (!$island) return;

        var startX, startY, initialLeft, initialTop, dragStarted;

        function getCurrentLeft() {
            return islandPos._hasDragged ? islandPos.x : ($island.getBoundingClientRect().left || 0);
        }
        function getCurrentTop() {
            return islandPos._hasDragged ? islandPos.y : ($island.getBoundingClientRect().top || 88);
        }

        function onDragStart(e) {
            // 如果从 CSS 居中状态开始拖拽，先读取当前实际位置
            if (!islandPos._hasDragged) {
                var rect = $island.getBoundingClientRect();
                islandPos.x = rect.left;
                islandPos.y = rect.top;
                islandPos._hasDragged = true;
                $island.style.left = islandPos.x + 'px';
                $island.style.top = islandPos.y + 'px';
                $island.style.transform = 'none';
                $island.classList.add('drag-taken');
            }

            if (e.type === 'touchstart') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            } else {
                startX = e.clientX;
                startY = e.clientY;
            }
            initialLeft = islandPos.x;
            initialTop = islandPos.y;
            $island.classList.add('dragging');
            islandDragging = true;
            dragStarted = false;

            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
        }

        function onDragMove(e) {
            if (!islandDragging) return;
            e.preventDefault();

            var clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            var clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            var dx = clientX - startX;
            var dy = clientY - startY;
            var newX = initialLeft + dx;
            var newY = initialTop + dy;

            // ★ 拖拽超过3px才算真正拖拽，避免点击误触
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStarted = true;
            if (!dragStarted) return;

            var maxX = window.innerWidth - ($island.offsetWidth || 200);
            var maxY = window.innerHeight - ($island.offsetHeight || 44);
            islandPos.x = Math.max(0, Math.min(newX, maxX));
            islandPos.y = Math.max(ISLAND_MIN_Y, Math.min(newY, maxY));

            $island.style.left = islandPos.x + 'px';
            $island.style.top = islandPos.y + 'px';
        }

        function onDragEnd() {
            islandDragging = false;
            if ($island) $island.classList.remove('dragging');

            // ★ 只有真正拖拽了才保存，避免点击灵动岛恢复弹窗时被误保存
            if (dragStarted) {
                saveIslandPos();
            }

            // ★ 如果拖拽后恢复了弹窗（by restoreWindow），不覆盖位置
            if (islandPos._hasDragged && islandVisible) {
                $island.style.left = islandPos.x + 'px';
                $island.style.top = islandPos.y + 'px';
                $island.style.transform = 'none';
                $island.classList.add('drag-taken');
            }

            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);
        }

        // ★ 添加点击事件：弹窗关闭/最小化时，点击灵动岛恢复弹窗
        $island.addEventListener('click', function(e) {
            // 如果正在拖拽中，不触发点击
            if (islandDragging || dragStarted) return;
            // 点击关闭按钮不触发恢复
            if (e.target.closest('#di-close-btn')) return;

            var wasMinimized = _minimized;
            restoreWindow();
            if (!wasMinimized) {
                // 如果之前不是最小化状态（弹窗已被关闭），恢复后不设置 _minimized
                _minimized = false;
            }
        });

        $island.addEventListener('mousedown', function(e) {
            // 重置 dragStarted，用于判断 mousedown -> mouseup 是否产生了移动
            dragStarted = false;
            onDragStart(e);
        });
        $island.addEventListener('touchstart', function(e) {
            dragStarted = false;
            onDragStart(e);
        }, { passive: false });
    }

    // ================================================================
    // ★ 最小化 / 恢复（参考通话弹窗 minimizeWindow / restoreWindow）
    //   最小化：隐藏弹窗 → 显示灵动岛 → 保持歌曲播放
    //   恢复：    打开弹窗 → 隐藏灵动岛
    // ================================================================
    function minimizeWindow() {
        _minimized = true;
        if ($overlay) $overlay.classList.remove('active');
        // 如果正在播放，显示灵动岛
        if (isPlaying && currentIndex >= 0) {
            showDynamicIsland();
        }
        notify('已最小化到灵动岛', 'info', 1500);
    }

    function restoreWindow() {
        _minimized = false;
        hideDynamicIsland();
        openPlayer();
    }

    // ======================== 面板开闭 ========================
    function openPlayer() {
        try {
            cacheDOM();

            if (!$overlay) {
                console.warn('[MusicPlayer] overlay 元素未找到，无法打开播放器');
                return;
            }

            bindEvents();
            _minimized = false;

            exitSelectMode();
            renderPlaylist();
            renderNowPlaying();
            updatePlayButton();
            updateModeText();
            updateModeStatus();
            updateStorageBar();

            // ★ 更新邀请按钮状态
            if ($inviteBtn) {
                if (togetherMode) {
                    $inviteBtn.innerHTML = '<i class="fas fa-user-times"></i> 退出一起听';
                    $inviteBtn.style.borderColor = '#e94560';
                } else {
                    $inviteBtn.innerHTML = '<i class="fas fa-user-plus"></i> 邀请梦角一起听';
                    $inviteBtn.style.borderColor = '';
                }
            }

            $overlay.classList.add('active');

            if ($volumeSlider) {
                $volumeSlider.value = currentVolume * 100;
            }
            if ($durTime && currentIndex >= 0 && audioEl) {
                $durTime.textContent = formatTime(audioEl.duration || 0);
            }
        } catch(e) {
            console.error('[MusicPlayer] 打开播放器失败:', e);
        }
    }

    function closePlayer() {
        if (!$overlay) return;
        $overlay.classList.remove('active');
        exitSelectMode();
        _minimized = false;
        // ★ 关闭弹窗时，如果正在播放，显示灵动岛
        if (isPlaying && currentIndex >= 0) {
            showDynamicIsland();
        }
        // ★ 关闭弹窗时记录听歌时长
        recordListenDuration();
    }

    // ======================== 随机邀约 ========================
    function getRandomSong() {
        if (playlist.length === 0) return null;
        return playlist[Math.floor(Math.random() * playlist.length)];
    }

    function triggerInvite() {
        if (inviteProbability <= 0) return false;
        if (playlist.length === 0) return false;
        if (inviteCooldown > 0) { inviteCooldown--; return false; }
        var roll = Math.random() * 100;
        if (roll >= inviteProbability) return false;
        showInviteModal();
        inviteCooldown = 8 + Math.floor(Math.random() * 12);
        return true;
    }

    function showInviteModal() {
        if (!$inviteOverlay) cacheDOM();
        if (!$inviteOverlay) return;
        var song = getRandomSong();
        if (!song) return;
        if ($inviteSong) {
            $inviteSong.textContent = (song.title || '未知歌曲') + (song.artist ? ' - ' + song.artist : '');
        }
        $inviteOverlay.classList.add('active');
    }

    function hideInviteModal() {
        if (!$inviteOverlay) return;
        $inviteOverlay.classList.remove('active');
    }

    function onInviteAccept() {
        hideInviteModal();
        var song = getRandomSong();
        if (!song) return;
        var idx = playlist.indexOf(song);
        if (idx < 0 && playlist.length > 0) idx = 0;
        if (idx >= 0) playSong(idx);
        enterTogetherMode();
        openPlayer();
        notify('✦ 和梦角一起听歌吧  ♪(´▽｀)', 'success', 2500);
    }

    function onInviteDecline() {
        hideInviteModal();
        notify('梦角："那下次再一起听吧~"', 'info', 2000);
    }

    // ======================== 通知辅助 ========================
    function notify(msg, type, duration) {
        if (typeof global.showNotification === 'function') {
            global.showNotification(msg, type, duration);
        } else {
            console.log('[MusicPlayer] ' + msg);
        }
    }

    // ======================== 事件绑定 ========================
    var _eventsBound = false;
    function bindEvents() {
        if (_eventsBound) return;
        _eventsBound = true;

        // 面板关闭 / 最小化
        if ($closeBtn) $closeBtn.addEventListener('click', closePlayer);
        if ($minimizeBtn) $minimizeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            minimizeWindow();
        });
        if ($overlay) {
            $overlay.addEventListener('click', function(e) {
                if (e.target === $overlay) closePlayer();
            });
        }

        // 文件导入
        if ($uploadArea && $uploadInput) {
            $uploadArea.addEventListener('click', function() { $uploadInput.click(); });
            $uploadInput.addEventListener('change', function(e) {
                importFiles(Array.from(e.target.files));
                $uploadInput.value = '';
            });
            $uploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                $uploadArea.style.borderColor = 'var(--accent-color)';
            });
            $uploadArea.addEventListener('dragleave', function() {
                $uploadArea.style.borderColor = '';
            });
            $uploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                $uploadArea.style.borderColor = '';
                var files = Array.from(e.dataTransfer.files);
                var zipFiles = [];
                var normalFiles = [];
                for (var i = 0; i < files.length; i++) {
                    if (/\.zip$/i.test(files[i].name)) zipFiles.push(files[i]);
                    else normalFiles.push(files[i]);
                }
                if (zipFiles.length > 0) importZip(zipFiles[0]);
                if (normalFiles.length > 0) importFiles(normalFiles);
            });
        }

        // ZIP 导入
        if ($zipInput && $zipBtn) {
            $zipBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                $zipInput.click();
            });
            $zipInput.addEventListener('change', function(e) {
                if (e.target.files && e.target.files[0]) importZip(e.target.files[0]);
                $zipInput.value = '';
            });
        }

        // 批量删除
        if ($batchDeleteBtn) {
            $batchDeleteBtn.addEventListener('click', function() {
                if (playlist.length === 0) { notify('歌单为空', 'info', 1500); return; }
                if (selectMode) exitSelectMode();
                else enterSelectMode();
            });
        }

        if ($selectAllBtn) $selectAllBtn.addEventListener('click', selectAll);
        if ($deselectAllBtn) $deselectAllBtn.addEventListener('click', deselectAll);
        if ($deleteSelectedBtn) $deleteSelectedBtn.addEventListener('click', deleteSelectedSongs);
        if ($exportBtn) $exportBtn.addEventListener('click', exportAllAsZip);
        if ($folderBtn) $folderBtn.addEventListener('click', openFolder);

        // 播放控制
        if ($playBtn) $playBtn.addEventListener('click', togglePlay);
        if ($prevBtn) $prevBtn.addEventListener('click', playPrev);
        if ($nextBtn) $nextBtn.addEventListener('click', playNext);
        if ($modeBtn) $modeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            togglePlayMode();
        });

        // ★ URL导入
        if ($urlAddBtn) $urlAddBtn.addEventListener('click', importFromURL);
        if ($urlInput) {
            $urlInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') importFromURL();
            });
        }

        // ★ 邀请梦角
        if ($inviteBtn) $inviteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            invitePartner();
        });

        // ★ 排行榜
        if ($leaderboardBtn) $leaderboardBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openLeaderboard();
        });
        if ($lbClose) $lbClose.addEventListener('click', closeLeaderboard);
        if ($lbOverlay) {
            $lbOverlay.addEventListener('click', function(e) {
                if (e.target === $lbOverlay) closeLeaderboard();
            });
        }
        // 排行榜标签切换
        var lbTabs = document.querySelectorAll('.music-lb-tab');
        for (var ti = 0; ti < lbTabs.length; ti++) {
            lbTabs[ti].addEventListener('click', function() {
                var which = this.getAttribute('data-lb');
                document.querySelectorAll('.music-lb-tab').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                renderLeaderboard(which);
            });
        }

        // ★ 梦角行为弹窗
        if ($partnerActionOk) {
            // OK按钮事件在showPartnerActionPopup中动态设置
        }
        if ($partnerActionOverlay) {
            $partnerActionOverlay.addEventListener('click', function(e) {
                if (e.target === $partnerActionOverlay) {
                    hidePartnerActionPopup();
                    // 回退行为
                    if (togetherMode) schedulePartnerAction();
                }
            });
        }

        if ($volumeSlider) {
            $volumeSlider.addEventListener('input', function() {
                currentVolume = parseInt($volumeSlider.value, 10) / 100;
                if (audioEl) audioEl.volume = currentVolume;
            });
        }

        if ($progressBar) {
            $progressBar.addEventListener('input', function() {
                if (!audioEl) return;
                var dur = audioEl.duration || 0;
                if (dur > 0) audioEl.currentTime = (parseInt($progressBar.value, 10) / 1000) * dur;
            });
        }

        // ★ 灵动岛关闭按钮：停止播放 + 隐藏岛屿
        if ($islandClose) {
            $islandClose.addEventListener('click', function(e) {
                e.stopPropagation();
                stopPlayback();
                hideDynamicIsland();
            });
        }

        if ($inviteAccept) $inviteAccept.addEventListener('click', onInviteAccept);
        if ($inviteDecline) $inviteDecline.addEventListener('click', onInviteDecline);
        if ($inviteOverlay) {
            $inviteOverlay.addEventListener('click', function(e) {
                if (e.target === $inviteOverlay) hideInviteModal();
            });
        }

        // 键盘快捷键
        document.addEventListener('keydown', function(e) {
            if (!$overlay || !$overlay.classList.contains('active')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            if (e.code === 'Escape') {
                if (selectMode) { e.preventDefault(); exitSelectMode(); return; }
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (audioEl && audioEl.duration) {
                    audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 5);
                }
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (audioEl) audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
            } else if (e.code === 'KeyA' && e.ctrlKey && selectMode) {
                e.preventDefault();
                selectAll();
            }
        });
    }

    // ======================== 设置面板概率滑块 ========================
    function injectSettingsUI() {
        var settingsBody = document.querySelector('#settings-modal .modal-body');
        if (!settingsBody) return;
        if (document.getElementById('music-probability-row')) return;

        var insertAfter = settingsBody.querySelector('.setting-item');
        if (!insertAfter) return;

        var row = document.createElement('div');
        row.className = 'music-probability-row';
        row.id = 'music-probability-row';
        row.innerHTML =
            '<label><i class="fas fa-music"></i>听歌邀约概率</label>' +
            '<input type="range" class="music-probability-slider" id="music-probability-slider" min="0" max="100" value="' + inviteProbability + '">' +
            '<span class="music-probability-val" id="music-probability-val">' + inviteProbability + '%</span>';

        var firstChild = settingsBody.firstChild;
        if (firstChild) {
            settingsBody.insertBefore(row, firstChild);
        } else {
            settingsBody.appendChild(row);
        }

        var slider = document.getElementById('music-probability-slider');
        var valEl = document.getElementById('music-probability-val');
        if (slider && valEl) {
            slider.addEventListener('input', function() {
                inviteProbability = parseInt(slider.value, 10);
                valEl.textContent = inviteProbability + '%';
                saveSettings();
            });
        }
    }

    // ======================== 初始化 ========================
    var _initialized = false;
    function init() {
        if (_initialized) return;
        _initialized = true;

        cacheDOM();
        loadSettings();
        loadIslandPos();
        initIslandDrag();
        bindEvents();

        loadPlaylist().then(function() {
            renderPlaylist();
            renderNowPlaying();
            updateModeText();
            updateModeStatus();
            updateStorageBar();
            loadLeaderboardData();
            setTimeout(injectSettingsUI, 800);

            var settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', function() {
                    setTimeout(injectSettingsUI, 300);
                });
            }
        });

        console.log('[MusicPlayer] 初始化完成，已加载 ' + playlist.length + ' 首歌曲');
    }

    // ======================== 公开 API ========================
    var MusicPlayer = {
        init: init,
        openPlayer: openPlayer,
        closePlayer: closePlayer,
        playSong: playSong,
        togglePlay: togglePlay,
        triggerInvite: triggerInvite,
        minimizeWindow: minimizeWindow,
        restoreWindow: restoreWindow,
        getPlaylist: function() { return playlist; },
        isPlaying: function() { return isPlaying; },
        isMinimized: function() { return _minimized; },
        getCurrentIndex: function() { return currentIndex; },
        stopPlayback: stopPlayback,
        refreshStorage: updateStorageBar,
        importZip: importZip,
        exportZip: exportAllAsZip,
        openFolder: openFolder,
        invitePartner: invitePartner,
        openLeaderboard: openLeaderboard,
        getLeaderboardData: getLeaderboardData,
        getPartnerHistory: function() { return partnerListenHistory; },
        isTogetherMode: function() { return togetherMode; },
        getPlayMode: function() { return playMode; },
        importFromURL: importFromURL,
        setSoloListener: function(who) { soloListener = who; updateModeStatus(); },
        getSoloListener: function() { return soloListener; }
    };

    global.MusicPlayerApp = MusicPlayer;

    // ======================== ★★★ [新增] cy-music云端曲库 ★★★ ========================
    // 固定远程曲库接口：https://020819lj.github.io/cy-music/index.json
    // 接口返回每条歌曲字段：name、mp3（完整公网mp3链接）、lrc（完整公网lrc链接）
    // 所有音频、歌词、JSON接口全部使用给定线上地址
    var CLOUD_INDEX_URL = 'https://020819lj.github.io/cy-music/index.json';
    var cloudCache = null;         // 缓存的云端歌曲列表
    var cloudLoaded = false;       // 是否已成功加载云端索引
    var cloudLoading = false;      // 是否正在请求中

    var $cloudSection, $cloudStatus, $cloudLoadBtn, $cloudInfo;

    function cacheCloudDOM() {
        $cloudSection  = document.getElementById('music-cloud-section');
        $cloudStatus   = document.getElementById('music-cloud-status');
        $cloudLoadBtn  = document.getElementById('music-btn-cloud-load-all');
        $cloudInfo     = document.getElementById('music-cloud-info');
    }

    /** 设置云端曲库状态文字和样式 */
    function setCloudStatus(text, type) {
        if (!$cloudStatus) return;
        $cloudStatus.textContent = text;
        $cloudStatus.className = 'music-cloud-status';
        if (type) $cloudStatus.classList.add(type);
    }

    /**
     * 页面初始化时静默预请求线上 index.json，缓存全部歌曲数据
     * 网络请求失败时显示错误提示，不阻塞页面其他功能
     */
    function prefetchCloudIndex() {
        if (cloudLoaded || cloudLoading) return;
        cloudLoading = true;
        setCloudStatus('连接中...', 'loading');

        fetch(CLOUD_INDEX_URL)
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(data) {
                if (Array.isArray(data) && data.length > 0) {
                    cloudCache = data;
                    cloudLoaded = true;
                    setCloudStatus('就绪 (' + data.length + '首)', 'ready');
                    if ($cloudInfo) {
                        $cloudInfo.textContent = '已缓存 ' + data.length + ' 首云端歌曲，点击下方按钮一键加载到歌单';
                    }
                } else {
                    throw new Error('云端歌单数据为空');
                }
            })
            .catch(function(err) {
                console.warn('[CloudMusic] 云端曲库加载失败:', err.message || err);
                setCloudStatus('暂不可用', 'error');
                if ($cloudInfo) {
                    $cloudInfo.textContent = '无法连接到云端曲库，请检查网络后刷新页面重试';
                }
            })
            .finally(function() {
                cloudLoading = false;
            });
    }

    /**
     * 根据 mp3 链接判断歌单中是否已存在（去重）
     * 比较 isURL 歌曲的 audioData 和 isCloud 歌曲的 cloudMp3 字段
     */
    function isCloudSongDuplicate(mp3Url) {
        for (var i = 0; i < playlist.length; i++) {
            var s = playlist[i];
            if (s.isURL && s.audioData === mp3Url) return true;
            if (s.isCloud && s.cloudMp3 === mp3Url) return true;
        }
        return false;
    }

    /** 从远程URL加载LRC歌词文本 */
    function fetchCloudLRC(url) {
        return fetch(url)
            .then(function(res) {
                if (!res.ok) throw new Error('LRC HTTP ' + res.status);
                return res.text();
            })
            .catch(function(err) {
                console.warn('[CloudMusic] LRC歌词加载失败:', url, err.message || err);
                return '';
            });
    }

    /**
     * ★ 一键加载云端全部歌曲
     * - 根据 mp3 链接自动去重，不重复生成条目
     * - 生成的 DOM 结构与原有 .music-song-item 完全一致
     * - 点击歌曲自动赋值全局 Audio 实例，同步更新所有UI
     * - 根据 lrc 远程地址加载歌词文本，调用现有 parseLRC 解析
     * - 适配手机移动端：仅添加歌曲不自动播放
     */
    function loadAllCloudSongs() {
        // 状态检查：加载中
        if (cloudLoading) {
            notify('云端曲库正在连接中，请稍候再试...', 'warning', 2500);
            return;
        }
        // 状态检查：未就绪
        if (!cloudLoaded || !cloudCache || cloudCache.length === 0) {
            notify('云端曲库数据未就绪，请刷新页面后重试', 'error', 3000);
            return;
        }

        var newCount = 0;
        var skipCount = 0;
        var lrcPromises = [];

        for (var i = 0; i < cloudCache.length; i++) {
            var item = cloudCache[i];
            var mp3Url = item.mp3;
            var lrcUrl = item.lrc;
            var name = item.name || '';

            // 跳过无效条目
            if (!mp3Url) continue;

            // 去重检查
            if (isCloudSongDuplicate(mp3Url)) {
                skipCount++;
                continue;
            }

            // ★★★ [修复] 解析歌名：兼容 "歌名 - 歌手"(有空格) 和 "歌名-歌手"(无空格) 两种格式 ★★★
            var artistGuess = '';
            var titleGuess = name;
            // 优先尝试 " - " 格式 (含空格，更精确)
            var dashIdx = name.lastIndexOf(' - ');
            var dashLen = 3;
            // 回退到 "-" 格式 (不含空格，API实际返回格式)
            if (dashIdx <= 0) {
                dashIdx = name.lastIndexOf('-');
                dashLen = 1;
            }
            if (dashIdx > 0 && dashIdx < name.length - dashLen) {
                titleGuess = name.substring(0, dashIdx).trim();
                artistGuess = name.substring(dashIdx + dashLen).trim();
            }

            // 创建云端歌曲对象，与现有歌曲结构完全兼容
            var song = {
                id: 'cloud_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 8),
                title: titleGuess || name || '云端歌曲',
                artist: artistGuess,
                audioData: mp3Url,            // 远程mp3链接，复用isURL逻辑赋值Audio.src
                lrcData: '',                  // 稍后异步加载
                lrcParsed: [],
                duration: 0,
                addedAt: Date.now(),
                isURL: true,                  // ★ 标记为URL类型，复用playSong中audio.src赋值逻辑
                isCloud: true,                // ★ 标记为云端歌曲
                cloudMp3: mp3Url,             // ★ 远端mp3链接（用于去重比对）
                cloudLrc: lrcUrl || ''        // ★ 远端LRC链接
            };

            playlist.push(song);
            newCount++;

            // ★ 异步预加载LRC歌词（不阻塞批量导入流程）
            if (lrcUrl) {
                (function(s, lrcU) {
                    lrcPromises.push(
                        fetchCloudLRC(lrcU).then(function(lrcText) {
                            if (lrcText) {
                                s.lrcData = lrcText;
                                var parsed = parseLRC(lrcText);
                                s.lrcParsed = parsed.lyrics;
                                // 从LRC元数据补充/更新歌名、歌手
                                if (parsed.title && s.title === (titleGuess || name || '云端歌曲')) {
                                    s.title = parsed.title;
                                }
                                if (parsed.artist && !s.artist) {
                                    s.artist = parsed.artist;
                                }
                            }
                        })
                    );
                })(song, lrcUrl);
            }
        }

        // 持久化并刷新UI
        savePlaylist();
        renderPlaylist();
        updateStorageBar();

        // 结果通知（适配移动端，仅添加歌曲不自动播放）
        if (newCount > 0) {
            var msg = '已从云端加载 ' + newCount + ' 首歌曲' + (skipCount > 0 ? '，跳过 ' + skipCount + ' 首重复' : '');
            notify(msg, 'success', 3000);
            if ($cloudInfo) {
                $cloudInfo.textContent = '本次新增 ' + newCount + ' 首'
                    + (skipCount > 0 ? '，跳过 ' + skipCount + ' 首已存在' : '')
                    + '  |  歌单共 ' + playlist.length + ' 首';
            }
        } else if (skipCount > 0) {
            notify('云端 ' + cloudCache.length + ' 首歌曲已全部在歌单中，无需重复加载', 'info', 3000);
            if ($cloudInfo) {
                $cloudInfo.textContent = '云端 ' + cloudCache.length + ' 首歌曲已全部在歌单中  |  歌单共 ' + playlist.length + ' 首';
            }
        } else {
            notify('云端曲库未返回有效歌曲', 'warning', 2500);
            if ($cloudInfo) {
                $cloudInfo.textContent = '云端曲库数据异常，请稍后重试';
            }
        }

        // LRC全部加载完成后，存储更新（使歌词即时可用）
        if (lrcPromises.length > 0) {
            Promise.all(lrcPromises).then(function() {
                savePlaylist();
                // 如果正在播放中，刷新歌词显示
                if (currentIndex >= 0 && isPlaying) {
                    updateLyricsUI();
                }
            }).catch(function() {
                // LRC部分加载失败，静默处理，不影响播放
            });
        }
    }

    /** 绑定云端曲库UI事件 */
    function bindCloudEvents() {
        if ($cloudLoadBtn) {
            $cloudLoadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                // 防止重复点击触发多次导入
                if ($cloudLoadBtn.disabled) return;
                $cloudLoadBtn.disabled = true;
                try {
                    loadAllCloudSongs();
                } finally {
                    // 500ms 后恢复按钮可点击
                    setTimeout(function() {
                        if ($cloudLoadBtn) $cloudLoadBtn.disabled = false;
                    }, 500);
                }
            });
        }
    }

    // ★★★ [修复] 云端曲库挂载到 init 流程（不修改原有 init 代码，使用函数包装） ★★★
    // 注意：MusicPlayer.init 已在第2274行捕获了当时的 init 引用，
    // 重赋局部变量 init 不能自动更新对象属性，需要显式回写 MusicPlayer.init
    var _origCloudInit = init;
    init = function() {
        // 先执行原有初始化逻辑
        _origCloudInit();
        // 再初始化云端曲库模块
        try {
            cacheCloudDOM();
            bindCloudEvents();
            prefetchCloudIndex();
        } catch(e) {
            console.warn('[CloudMusic] 初始化异常:', e);
        }
    };
    // ★ 关键：将包装后的 init 回写到 MusicPlayer 对象，确保外部调用生效
    MusicPlayer.init = init;

    // 由 listeners.js 中的 setupEventListeners() 统一调用 init()
})(typeof window !== 'undefined' ? window : this);
