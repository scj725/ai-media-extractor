(function() {
    'use strict';

    console.log('%c[AI 素材提取器] 脚本开始执行', 'color: #667eea; font-size: 14px; font-weight: bold');
    console.log('[AI 素材提取器] 当前 URL:', window.location.href);

    let chatImages = [];
    let chatVideos = [];
    let floatingBtnElement = null;
    let dolaVideoObserver = null;
    let dolaVideoScanTimer = null;
    let autoDownloadEnabled = false;
    let dolaVideoDuration = 0;
    const autoDownloadedUrls = new Set();
    const autoDownloadInFlight = new Set();
    let lastDownloadFailures = [];
    const isDolaChat = window.location.hostname === 'www.dola.com' && window.location.pathname.includes('/chat/');
    const isDoubaoCompatibleChat = window.location.pathname.includes('/chat/') &&
        (window.location.hostname.includes('doubao.com') || isDolaChat);
    const nativeJSONStringify = JSON.stringify;

    function loadSettings() {
        const id = `${Date.now()}-${Math.random()}`;
        const onResponse = event => {
            let data;
            try { data = JSON.parse(event.detail); } catch (_) { return; }
            if (data.id !== id) return;
            window.removeEventListener('ai-media-extractor-settings-response', onResponse);
            autoDownloadEnabled = Boolean(data.autoDownload);
            dolaVideoDuration = [15, 30].includes(Number(data.dolaVideoDuration)) ? Number(data.dolaVideoDuration) : 0;
            if (Array.isArray(data.autoDownloadedUrls)) {
                data.autoDownloadedUrls.forEach(url => { if (typeof url === 'string' && url) autoDownloadedUrls.add(url); });
            }
        };
        window.addEventListener('ai-media-extractor-settings-response', onResponse);
        window.dispatchEvent(new CustomEvent('ai-media-extractor-settings-request', { detail: JSON.stringify({ id }) }));
    }

    window.addEventListener('ai-media-extractor-auto-download-history-changed', event => {
        let data;
        try { data = JSON.parse(event.detail); } catch (_) { return; }
        autoDownloadedUrls.clear();
        if (Array.isArray(data.autoDownloadedUrls)) {
            data.autoDownloadedUrls.forEach(url => { if (typeof url === 'string' && url) autoDownloadedUrls.add(url); });
        }
    });

    window.addEventListener('ai-media-extractor-settings-changed', event => {
        let data;
        try { data = JSON.parse(event.detail); } catch (_) { return; }
        if (Object.prototype.hasOwnProperty.call(data, 'dolaVideoDuration')) {
            dolaVideoDuration = [15, 30].includes(Number(data.dolaVideoDuration)) ? Number(data.dolaVideoDuration) : 0;
        }
    });

    function applyDolaVideoDuration(payload) {
        if (!isDolaChat || !dolaVideoDuration || !payload || typeof payload !== 'object') return false;
        let changed = false;
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) { value.forEach(visit); return; }
            const ability = value.chat_ability || (Number(value.ability_type) === 17 ? value : null);
            if (ability && Number(ability.ability_type) === 17) {
                let params = ability.ability_param;
                if (typeof params === 'string') {
                    try { params = JSON.parse(params); } catch (_) { params = {}; }
                }
                if (params && typeof params === 'object') {
                    params.duration = dolaVideoDuration;
                    // Dola exposes the 2.5 model for the 30-second option.
                    params.model = dolaVideoDuration === 30 ? 'seedance_v2.5' : 'seedance_v2.0';
                    ability.ability_param = nativeJSONStringify(params);
                    changed = true;
                }
            }
            Object.values(value).forEach(visit);
        };
        visit(payload);
        return changed;
    }

    if (isDolaChat) {
        JSON.stringify = function(value, replacer, space) {
            if (applyDolaVideoDuration(value)) {
                console.log(`[AI 素材提取器] JSON.stringify 已注入 Dola ${dolaVideoDuration} 秒参数`);
            }
            return nativeJSONStringify.call(JSON, value, replacer, space);
        };
    }

    function getSiteName() {
        if (location.hostname.includes('dola.com')) return 'Dola';
        if (location.hostname.includes('qianwen')) return '千问';
        return '豆包';
    }

    function getConversationTitle() {
        const title = document.title
            .replace(/\s*[|｜-]\s*(豆包|Dola|通义千问|千问).*$/i, '')
            .replace(/^(豆包|Dola|通义千问|千问)\s*[-|｜:]?\s*/i, '')
            .trim();
        return title && title.length < 80 ? title : 'AI素材';
    }

    function safeFilename(value) {
        return String(value || 'AI素材')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80) || 'AI素材';
    }

    function mediaFilename(type, index) {
        const extension = type === 'video' ? 'mp4' : 'png';
        return `${safeFilename(getSiteName())}_${safeFilename(getConversationTitle())}_${String(index).padStart(2, '0')}.${extension}`;
    }

    async function autoDownload(url, type, index) {
        if (!autoDownloadEnabled || !url || autoDownloadedUrls.has(url) || autoDownloadInFlight.has(url)) return;
        autoDownloadInFlight.add(url);
        try {
            const downloaded = await downloadImage(url, mediaFilename(type, index), false);
            if (!downloaded || autoDownloadedUrls.has(url)) return;
            autoDownloadedUrls.add(url);
            window.dispatchEvent(new CustomEvent('ai-media-extractor-auto-download-mark', { detail: JSON.stringify({ url }) }));
            updateAutoDownloadIndicator(url);
        } finally {
            autoDownloadInFlight.delete(url);
        }
    }

    function updateAutoDownloadIndicator(url) {
        document.querySelectorAll('.btn-media-download').forEach(button => {
            if (button.dataset.url !== url) return;
            button.classList.add('success');
            button.textContent = '✓ 已自动下载';
        });
        document.querySelectorAll('.auto-download-badge').forEach(badge => {
            if (badge.dataset.url === url) badge.hidden = false;
        });
    }

    function addChatImage(image) {
        if (!image?.url || chatImages.some(item => item.url === image.url)) return;
        chatImages.push(image);
        autoDownload(image.url, 'image', chatImages.length);
        updateButtonCount();
        window.dispatchEvent(new Event('ai-media-extractor-media-added'));
    }

    function updateButtonCount() {
        if (!floatingBtnElement) return;
        const countElement = floatingBtnElement.querySelector('.count');
        if (!countElement) return;
        const imgCount = chatImages.length;
        countElement.textContent = imgCount + chatVideos.length;
    }

    function addChatVideo(videoInfo) {
        if (!videoInfo || !videoInfo.url) return;
        if (chatVideos.find(v => v.vid === videoInfo.vid || v.url === videoInfo.url)) return;
        chatVideos.push(videoInfo);
        autoDownload(videoInfo.url, 'video', chatVideos.length);
        console.log('[AI 素材提取器] 获取到新视频:', videoInfo.vid, videoInfo.url);
        updateButtonCount();
        window.dispatchEvent(new Event('ai-media-extractor-media-added'));
    }

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = typeof url === 'string' ? url : url?.href || '';
        this._method = method;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        const url = this._url;
        if (isDolaChat && dolaVideoDuration && String(this._method).toUpperCase() === 'POST' && url.includes('/chat/completion') && typeof args[0] === 'string') {
            args[0] = patchDolaVideoDuration(args[0]);
        }
        this.addEventListener('load', function() {
            if (url && (url.includes('/im/chain/single'))) {
                try {
                    if (isDolaChat) extractDolaVideosFromResponseText(this.responseText);
                    const data = JSON.parse(this.responseText);
                    
                    const messages = data?.downlink_body?.pull_singe_chain_downlink_body?.messages;
                    if (messages && Array.isArray(messages)) {
                        console.log('[AI 素材提取器] 开始解析 messages，数量:', messages.length);
                        parseChatHistoryImages(messages);
                    }
                } catch (e) {
                    console.error('[AI 素材提取器] XHR 解析聊天数据失败:', e);
                }
            }
        });
        return originalXHRSend.apply(this, args);
    };
    
    console.log('[AI 素材提取器] XHR 拦截已安装');

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const request = args[0];
        // fetch accepts strings, URL instances, and Request instances. Dola's
        // telemetry uses Request instances, so normalize only for inspection.
        const url = typeof request === 'string'
            ? request
            : request instanceof URL
                ? request.href
                : typeof request?.url === 'string'
                    ? request.url
                    : '';

        if (isDolaChat && dolaVideoDuration && url.includes('/chat/completion')) {
            const init = args[1];
            if (init && typeof init.body === 'string') {
                const body = patchDolaVideoDuration(init.body);
                if (body !== init.body) args[1] = { ...init, body };
            } else if (request instanceof Request && request.method === 'POST') {
                const body = await request.clone().text();
                const patchedBody = patchDolaVideoDuration(body);
                if (patchedBody !== body) args[0] = new Request(request, { body: patchedBody });
            }
        }
        
        if (url.includes('qianwen.com/api/v1/session/msg/list')) {
            console.log('[AI 素材提取器] 检测到千问 session msg list 请求:', url);
            const response = await originalFetch.apply(this, args);
            response.clone().json().then(data => {
                const chats = data.data?.list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (url.includes('qianwen.com/api/v1/share/info')) {
            console.log('[AI 素材提取器] 检测到千问 share chat 请求:', url);
            const response = await originalFetch.apply(this, args);
            response.clone().json().then(data => {
                const chats = data.data.session?.record_list || [];
                for (const chat of chats) {
                    const messages = chat?.response_messages || [];
                    parseQianwenMessages(messages);
                }
            }).catch(() => {});
            return response;
        }

        if (url.includes('qianwen.com/api/v1/chat/snap')) {
            console.log('[AI 素材提取器] 检测到千问 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const stream = new ReadableStream({
                async start(controller) {
                    let buffer = '';
                    let waitingForData = false;
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        
                        const lines = buffer.split('\n');
                        buffer = lines.pop();
                        
                        for (const line of lines) {
                            if (line.trimEnd() === 'event:complete') {
                                waitingForData = true;
                            } else if (waitingForData && line.startsWith('data:')) {
                                waitingForData = false;
                                try {
                                    const jsonStr = line.substring(5).trim();
                                    const data = JSON.parse(jsonStr);
                                    parseQianwenMessages(data?.data?.messages);
                                } catch (e) {
                                    console.warn('[AI 素材提取器][千问] data 行解析失败:', e.message);
                                }
                            } else if (line.trim() === '') {
                                waitingForData = false;
                            }
                        }
                        
                        controller.enqueue(value);
                    }
                    controller.close();
                }
            });
            
            return new Response(stream, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        }

        if (isDolaChat && url.includes('/im/chain/single')) {
            const response = await originalFetch.apply(this, args);
            response.clone().text().then(extractDolaVideosFromResponseText).catch(() => {});
            return response;
        }
        
        if (url.includes('/chat/completion')) {
            console.log('[AI 素材提取器] 检测到 EventStream 请求:', url);
            
            const response = await originalFetch.apply(this, args);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const stream = new ReadableStream({
                async start(controller) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value, { stream: true });
                        
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const jsonStr = line.substring(6);
                                    if (jsonStr.includes('image_ori')) {
                                        const data = JSON.parse(jsonStr);
                                        if (data.event_data || data.patch_op) {
                                            parseStreamChunk(data);
                                        }
                                    }
                                } catch (e) {
                                    console.log('[AI 素材提取器] 解析行失败:', e.message);
                                    console.log('[AI 素材提取器] 解析行失败:', line);
                                }
                            }
                        }
                        
                        controller.enqueue(value);
                    }
                    controller.close();
                }
            });
            
            return new Response(stream, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        }
        
        return originalFetch.apply(this, args);
    };
    
    console.log('[AI 素材提取器] Fetch 拦截已安装');

    function parseQianwenMessages(messages) {
        if (!Array.isArray(messages)) {
            return;
        }
        for (const message of messages) {
            if (message?.mime_type !== 'multi_load/iframe') continue;
            const multiLoad = message?.meta_data?.multi_load;
            if (!Array.isArray(multiLoad)) {
                continue;
            }
            for (const item of multiLoad) {
                const displayList = item?.content?.display_list;
                if (!Array.isArray(displayList)) {
                    continue;
                }
                for (const display of displayList) {
                    const imageObj = display?.image?.[0];
                    if (!imageObj?.url) continue;
                    const { url, width = 0, height = 0 } = imageObj;
                    if (!chatImages.find(img => img.url === url)) {
                        addChatImage({ url, width, height });
                        console.log('[AI 素材提取器][千问] 获取到图片:', url, `${width} × ${height}`);
                        updateButtonCount();
                    }
                }
            }
        }
    }

    
    function parseStreamChunk(data) {
        try {
            if (!data.event_data && !data.patch_op) {
                return;
            }

            let creations = [];

            if (data.patch_op) {

                for (const op of data.patch_op) {
                    if (
                        op.patch_value &&
                        Array.isArray(op.patch_value.content_block)
                    ) {
                        for (const block of op.patch_value.content_block) {
                            if (
                                block?.content?.creation_block &&
                                Array.isArray(block.content.creation_block.creations)
                            ) {
                                creations = block.content.creation_block.creations;
                                break;
                            }
                        }
                    }
                }

                if (creations.length === 0) {
                    const extPatch = data.patch_op.find(op =>
                        op.patch_value &&
                        typeof op.patch_value === 'object' &&
                        op.patch_value.ext?.creation_full_content
                    );

                    if (extPatch) {
                        try {
                            const creationFullContent = extPatch.patch_value.ext.creation_full_content;
                            const creationFullContent_obj = JSON.parse(creationFullContent);

                            for (const item of creationFullContent_obj) {
                                const content = item?.BlockInfo?.BlockContent?.content;
                                if (
                                    content &&
                                    typeof content === 'object' &&
                                    content.creation_block &&
                                    Array.isArray(content.creation_block.creations)
                                ) {
                                    creations = content.creation_block.creations;
                                    break;
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to parse creation_full_content:', e);
                        }
                    }
                }

            }else{
                let eventData;
                try {
                    eventData = JSON.parse(data.event_data);
                } catch (e) {
                    console.log('[AI 素材提取器] 解析 event_data 失败:', e);
                    return;
                }
                
                if (!eventData.message?.content) {
                    return;
                }
                
                let messageContent;
                try {
                    messageContent = JSON.parse(eventData.message.content);
                } catch (e) {
                    console.log('[AI 素材提取器] 解析 message.content 失败:', e);
                    return;
                }
                if (!messageContent.creations || !Array.isArray(messageContent.creations)) {
                    return;
                }

                creations = messageContent.creations;
            }
            

            
            for (const creation of creations) {
                if (creation?.video && !isDolaChat) {
                    const vid = creation.video.vid;
                    getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                }else{
                    const imageData = creation.image?.image_ori_raw;
                    if (imageData) {
                        let imageUrl = '';
                        let width = 0;
                        let height = 0;
                        
                        if (typeof imageData === 'string') {
                            imageUrl = imageData;
                        } else if (typeof imageData === 'object' && imageData.url) {
                            imageUrl = imageData.url;
                            width = imageData.width || 0;
                            height = imageData.height || 0;
                        }
                        
                        if (imageUrl && !chatImages.find(img => img.url === imageUrl)) {
                            addChatImage({ url: imageUrl, width, height });
                            console.log('[AI 素材提取器] 获取到新图片:', imageUrl, `${width} × ${height}`);
                            updateButtonCount();
                        }
                    }
                }
            }
            
            console.log('[AI 素材提取器][千问] 聊天界面，返回已缓存的', chatImages.length, '张图片');
        } catch (e) {
            console.error('[AI 素材提取器] 解析 StreamChunk 失败:', e);
        }
    }

    async function getDoubaoVideoInfo(vid) {
        if (!vid) {
            console.warn('[AI 素材提取器] getDoubaoVideoInfo: vid 为空');
            return null;
        }

        const params = {
            version_code: '20800',
            language: 'zh-CN',
            device_platform: 'web',
            aid: '497858',
            real_aid: '497858',
            pkg_type: 'release_version',
            device_id: '',
            pc_version: '2.51.7',
            region: '',
            sys_region: '',
            samantha_web: '1',
            'use-olympus-account': '1',
            web_tab_id: '',
        };

        const queryString = new URLSearchParams(params).toString();
        const apiUrl = `https://www.doubao.com/samantha/media/get_play_info?${queryString}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'origin': 'https://www.doubao.com',
                },
                body: JSON.stringify({ key: vid }),
            });

            const result = await response.json();

            if (!result || !result.data) {
                console.warn('[AI 素材提取器] API返回数据格式异常，可能链接已失效:', result);
                return null;
            }

            const originalMediaInfo = result.data.original_media_info || {};
            const meta = originalMediaInfo.meta || {};

            const videoInfo = {
                vid: vid,
                width: meta.width || 0,
                height: meta.height || 0,
                definition: meta.definition || '',
                duration: meta.duration || 0,
                codec_type: meta.codec_type || '',
                poster_url: result.data.poster_url || '',
                url: (originalMediaInfo.main_url || '').replace('lr=video_gen_watermark_dyn', 'lr=video_gen'),
            };

            console.log('[AI 素材提取器] 获取无水印视频成功:', vid, videoInfo.url);
            return videoInfo;
        } catch (e) {
            console.error('[AI 素材提取器] 获取视频播放信息失败:', e);
            return null;
        }
    }

    // This later declaration deliberately replaces the historical video resolver.
    // It uses Doubao's fallback API instead of rewriting a watermark URL.
    const DB_QAAB_SALT = Uint8Array.from([77,212,194,230,184,49,98,9,14,82,179,199,166,115,59,164,28,178,70,43,130,154,181,138,25,107,57,219,87,23,117,36,244,155,175,127,8,232,214,141,38,167,46,55,193,169,90,47,31,5,165,24,146,174,242,148,151,50,182,42,56,170,221,88]);

    function dbTokenBytes(value) {
        try { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0)); } catch (_) { return null; }
    }

    function dbUrlFromBytes(bytes) {
        if (!bytes) return '';
        const text = new TextDecoder('ascii').decode(bytes).split(/[\x00-\x1f\x7f]/, 1)[0].trim();
        return /^https?:\/\//.test(text) ? text : '';
    }

    function dbFallbackApi(vid) {
        const pattern = /fallback_api.*?(https:.*?)(?:\\+&quot;|&quot;|")/gs;
        for (const match of document.documentElement.innerHTML.matchAll(pattern)) {
            const value = match[1].replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
            if (value.includes(vid)) return value;
        }
        return '';
    }

    async function dbDecodeUrl(token, keySeed) {
        if (/^https?:\/\//.test(token)) return token;
        const direct = dbUrlFromBytes(dbTokenBytes(token));
        if (direct || !token.startsWith('qAAB') || !keySeed) return direct;
        const encrypted = dbTokenBytes(token), seed = dbTokenBytes(keySeed);
        if (!encrypted || !seed) return '';
        const seedHash = new Uint8Array(await crypto.subtle.digest('SHA-512', seed.slice(0, 32)));
        const mixed = new Uint8Array(seedHash.length + DB_QAAB_SALT.length); mixed.set(seedHash); mixed.set(DB_QAAB_SALT, seedHash.length);
        const derived = new Uint8Array(await crypto.subtle.digest('SHA-512', mixed));
        const keyA = derived.slice(0, 16), keyB = derived.slice(16, 32);
        const attempts = [[encrypted.slice(4), keyA, keyB], [encrypted.slice(4), keyB, keyA]];
        if (encrypted.length > 36) attempts.push([encrypted.slice(36), keyA, encrypted.slice(20, 36)], [encrypted.slice(36), keyA, keyB]);
        for (const [data, key, iv] of attempts) {
            if (!data.length || data.length % 16) continue;
            try {
                const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
                const url = dbUrlFromBytes(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data)));
                if (url) return url;
            } catch (_) { /* Try the next recognized qAAB key/IV form. */ }
        }
        return '';
    }

    function dbFetchFallback(url) {
        return new Promise((resolve, reject) => {
            const id = `db-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const onResponse = event => {
                let detail;
                try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; } catch (_) { return; }
                if (detail?.id !== id) return;
                window.removeEventListener('ai-media-extractor-fallback-response', onResponse);
                if (!detail.ok) { reject(new Error(detail.error || 'Fallback request failed.')); return; }
                resolve(detail.data);
            };
            window.addEventListener('ai-media-extractor-fallback-response', onResponse);
            window.dispatchEvent(new CustomEvent('ai-media-extractor-fallback-request', { detail: JSON.stringify({ id, url }) }));
            setTimeout(() => {
                window.removeEventListener('ai-media-extractor-fallback-response', onResponse);
                reject(new Error('Fallback request timed out.'));
            }, 15000);
        });
    }

    async function getDoubaoVideoInfo(vid) {
        const fallbackApi = dbFallbackApi(vid);
        if (!fallbackApi) return null;
        try {
            const apiUrl = new URL(fallbackApi);
            apiUrl.searchParams.set('channel', 'no'); apiUrl.searchParams.set('codec_type', '8'); apiUrl.searchParams.set('logo_type', 'unwatermarked');
            const result = await dbFetchFallback(apiUrl.href);
            const data = result?.video_info?.data || result?.data?.video_info?.data || result?.video_info || result?.data || result;
            const video = Object.values(data?.video_list || {}).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || data;
            const url = await dbDecodeUrl(video?.main_url || video?.play_url || '', data?.key_seed || result?.key_seed || '');
            if (!url) return null;
            return { vid, width: video?.vwidth || video?.width || 0, height: video?.vheight || video?.height || 0, definition: video?.definition || '', duration: data?.video_duration || 0, codec_type: video?.codec_type || '', poster_url: data?.poster_url || '', url };
        } catch (error) { console.error('[AI Media Extractor] video resolve failed:', error); return null; }
    }

    function parseChatHistoryImages(messages) {
        if (!Array.isArray(messages)) return;
        
        const newImages = [];

        try {
            for (const item of messages) {
                try {
                    for (const content of item.content_block) {
                        const creationBlock = content.content?.creation_block;
                        if (!creationBlock || !Array.isArray(creationBlock.creations)) continue;
                        for (const creation of creationBlock.creations) {
                            if (creation?.video && !isDolaChat) {
                                const vid = creation.video.vid;
                                getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                            }else{
                                const imageData = creation.image?.image_ori_raw;
                                if (imageData) {
                                    let imageUrl = '';
                                    let width = 0;
                                    let height = 0;
                                    
                                    if (typeof imageData === 'string') {
                                        imageUrl = imageData;
                                    } else if (typeof imageData === 'object' && imageData.url) {
                                        imageUrl = imageData.url;
                                        width = imageData.width || 0;
                                        height = imageData.height || 0;
                                    }
                                    
                                    if (imageUrl && !newImages.find(img => img.url === imageUrl)) {
                                        newImages.push({ url: imageUrl, width, height });
                                        console.log('[AI 素材提取器] 找到图片:', imageUrl, `${width} × ${height}`);
                                    }
                                }
                            }
                        }
                    }
                    
                } catch (e) {
                    console.log('[AI 素材提取器] 解析消息失败:', e);
                    continue;
                }
            }
        } catch (e) {
            console.log('[AI 素材提取器] 解析消息失败:', e);
        }
        
        if (newImages.length > 0) {
            chatImages = newImages;
            console.log('[AI 素材提取器] 更新聊天图片，共', chatImages.length, '张');
            updateButtonCount();
        }
    }

    function extractSharePageImages() {
        try {
            const imageList = [];
            
            const scriptElement = document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
            if (scriptElement) {
                const dataFnArgs = scriptElement.getAttribute('data-fn-args');
                if (dataFnArgs) {
                    const jsonStr = dataFnArgs.replace(/&quot;/g, '"');
                    const jsonData = JSON.parse(jsonStr);
                    
                    for (const data of jsonData) {
                        if (typeof data === 'object' && data?.data?.message_snapshot?.message_list) {
                            const messageSnapshot = data.data.message_snapshot.message_list;
                            console.log('[AI 素材提取器] 找到消息列表，共', messageSnapshot.length, '条消息');
                            
                            for (const message of messageSnapshot) {
                                for (const block of message.content_block || []) {
                                    try {
                                        const rawContent = block.content_v2 ?? block.content;
                                        const contentData = typeof rawContent === 'string'
                                            ? JSON.parse(rawContent)
                                            : rawContent;
                                        if (contentData.creation_block?.creations) {
                                            for (const creation of contentData.creation_block.creations) {
                                                if (creation?.video && !isDolaChat) {
                                                    const vid = creation.video.vid;
                                                    getDoubaoVideoInfo(vid).then(info => addChatVideo(info));
                                                }else{
                                                    const imageData = creation.image?.image_ori_raw;
                                                    if (imageData) {
                                                        let imageUrl = '';
                                                        let width = 0;
                                                        let height = 0;
                                                        
                                                        if (typeof imageData === 'string') {
                                                            imageUrl = imageData;
                                                        } else if (typeof imageData === 'object' && imageData.url) {
                                                            imageUrl = imageData.url.replace(/&amp;/g, '&');
                                                            width = imageData.width || 0;
                                                            height = imageData.height || 0;
                                                        }
                                                        
                                                        if (imageUrl && !imageList.find(img => img.url === imageUrl)) {
                                                            imageList.push({
                                                                url: imageUrl,
                                                                width: width,
                                                                height: height
                                                            });
                                                            console.log('[AI 素材提取器] 找到图片:', imageUrl, `${width} × ${height}`);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                    
                    console.log('[AI 素材提取器] 提取完成，共找到', imageList.length, '张图片');
                    return imageList;
                }
            }
            
            console.error('[AI 素材提取器] 未找到任何可用的数据源');
            return [];
        } catch (error) {
            console.error('[AI 素材提取器] 提取图片失败:', error);
            return [];
        }
    }

    function extractQianwenMyShareImages() {
        const images = [];
        const seen = new Set();
        document.querySelectorAll('img[data-image-resource-id], img[src*="workspace-zb-cdn.qianwen.com"]').forEach((img) => {
            const url = img.currentSrc || img.src;
            if (!url || seen.has(url) || !/\.(png|jpe?g|webp)(\?|$)/i.test(url)) return;
            seen.add(url);
            images.push({ url, width: Number(img.dataset.imageResourceWidth || img.naturalWidth || 0), height: Number(img.dataset.imageResourceHeight || img.naturalHeight || 0) });
        });
        return images;
    }

    function extractQianwenMyShareVideos() {
        const videos = [];
        const seen = new Set();
        document.querySelectorAll('video').forEach((video, index) => {
            const url = video.currentSrc || video.src;
            if (!url || seen.has(url) || !/\.(mp4|webm|mov)(\?|$)/i.test(url)) return;
            seen.add(url);
            const container = video.closest('[class*="videoPlayerCard"], [class*="videoContainer"]');
            const durationText = container?.querySelector('[class*="time"]')?.textContent || '';
            const durationParts = durationText.match(/(\d+):(\d{2})/);
            const duration = durationParts ? Number(durationParts[1]) * 60 + Number(durationParts[2]) : 0;
            videos.push({ vid: `qianwen-video-${index}`, url, width: video.videoWidth || 0, height: video.videoHeight || 0, duration, poster_url: video.poster || '' });
        });
        return videos;
    }

    function extractDolaVideos() {
        const videos = [];
        const seen = new Set();
        document.querySelectorAll('[class*="block-video"] video, video[mediatype="video"]').forEach((video, index) => {
            const url = video.currentSrc || video.src;
            if (!url || seen.has(url)) return;
            seen.add(url);
            if (isDolaWatermarkedVideoUrl(url)) {
                console.log('[AI 素材提取器] 已忽略 Dola 页面带水印预览视频');
                return;
            }

            const container = video.closest('[class*="block-video"]');
            const durationText = container?.querySelector('.time-duration')?.textContent || '';
            const durationParts = durationText.match(/(\d+):(\d{2})/);
            const duration = Number.isFinite(video.duration) ? video.duration : durationParts
                ? Number(durationParts[1]) * 60 + Number(durationParts[2])
                : 0;
            const poster = container?.querySelector('img')?.currentSrc || container?.querySelector('img')?.src || video.poster || '';
            videos.push({
                vid: video.dataset.xgplayerid || `dola-video-${index}`,
                url,
                width: video.videoWidth || 0,
                height: video.videoHeight || 0,
                duration,
                poster_url: poster,
            });
        });
        console.log('[AI 素材提取器] Dola 页面视频，共', videos.length, '个');
        return videos;
    }

    function cleanDolaVideoUrl(url) {
        return url.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
            .replace(/([?&])lr=[^&]*/i, '$1lr=unwatermarked');
    }

    function isDolaWatermarkedVideoUrl(url) {
        return /[?&]lr=(?:cici_ai|[^&]*watermark)/i.test(url);
    }

    function patchDolaVideoDuration(body) {
        try {
            const payload = JSON.parse(body);
            const changed = applyDolaVideoDuration(payload);
            if (changed) console.log(`[AI 素材提取器] 已请求 Dola ${dolaVideoDuration} 秒视频`);
            return changed ? nativeJSONStringify(payload) : body;
        } catch (_) {
            return body;
        }
    }

    function decodeDolaVideoUrl(value) {
        const token = cleanDolaVideoUrl(String(value || ''));
        if (/^https?:\/\//i.test(token)) return token;
        const decoded = dbUrlFromBytes(dbTokenBytes(token));
        return decoded ? cleanDolaVideoUrl(decoded) : '';
    }

    function extractDolaVideosFromResponseText(responseText) {
        if (!isDolaChat || typeof responseText !== 'string') return;
        const seen = new Set();
        // Dola keeps the original video URL in a Base64 main_url/man_url field.
        // Match normal JSON and JSON embedded as an escaped string.
        const patterns = [
            /"(?:main_url|man_url)"\s*:\s*"([A-Za-z0-9+/_=-]{80,})"/g,
            /\\"(?:main_url|man_url)\\"\s*:\s*\\"([A-Za-z0-9+/_=-]{80,})\\"/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(responseText)) !== null) {
                const url = decodeDolaVideoUrl(match[1]);
                if (!url || seen.has(url)) continue;
                seen.add(url);
                addChatVideo({ vid: `dola-response-${url}`, url, width: 0, height: 0, duration: 0, poster_url: '', source: 'dola-clean' });
                console.log('[AI 素材提取器] 从 Dola 响应提取视频:', url);
            }
        }
    }

    function scanDolaVideos() {
        if (!isDolaChat) return;
        extractDolaVideos().forEach(addChatVideo);
    }

    function startDolaVideoObserver() {
        if (!isDolaChat || dolaVideoObserver || !document.documentElement) return;

        const scheduleScan = () => {
            clearTimeout(dolaVideoScanTimer);
            dolaVideoScanTimer = setTimeout(scanDolaVideos, 80);
        };

        dolaVideoObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if ((mutation.type === 'attributes' && mutation.target instanceof HTMLVideoElement) || [...mutation.addedNodes].some(node =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches?.('video') || node.querySelector?.('video'))
                )) {
                    scheduleScan();
                    return;
                }
            }
        });
        dolaVideoObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
        });

        // Dola renders history asynchronously and may attach video sources after
        // the initial page load; these scans cover the first virtual-list render.
        [0, 500, 1500, 3000].forEach(delay => setTimeout(scanDolaVideos, delay));
    }

    function extractImages() {
        if (window.location.hostname === 'qianwen.my.cn' && window.location.pathname.includes('/share/chat/')) {
            chatImages = extractQianwenMyShareImages();
            return chatImages;
        }
        if (isDoubaoCompatibleChat) {
            console.log('[AI 素材提取器] 豆包兼容聊天界面，返回已缓存的', chatImages.length, '张图片');
            return chatImages;
        } else if (window.location.hostname.includes('qianwen.com') && window.location.pathname.includes('/chat/')) {
            return chatImages;
        }else{
            const images = extractSharePageImages();
            chatImages = images;
            console.log('[AI 素材提取器] 豆包分享界面，返回已缓存的', images.length, '张图片');
            return images;
        }
    }

    function extractVideos() {
        if (isDolaChat) {
            scanDolaVideos();
            return chatVideos;
        }
        if ((window.location.hostname === 'qianwen.my.cn' && window.location.pathname.includes('/share/chat/')) ||
            (window.location.hostname.includes('qianwen.com') && window.location.pathname.includes('/chat/'))) {
            chatVideos = extractQianwenMyShareVideos();
            return chatVideos;
        }
        console.log('[AI 素材提取器] 当前视频缓存数:', chatVideos.length);
        return chatVideos;
    }

    async function fetchBlob(url, onProgress = null) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body || typeof response.body.getReader !== 'function') {
            const blob = await response.blob();
            if (onProgress) onProgress(100);
            return blob;
        }
        const reader = response.body.getReader();
        const chunks = [];
        const total = Number(response.headers.get('content-length')) || 0;
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            if (onProgress) onProgress(total ? Math.round(loaded / total * 100) : null);
        }
        return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    async function createZip(entries, onProgress = null) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        let completed = 0;
        const chunks = [];
        for (const entry of entries) {
            const data = new Uint8Array(await fetchBlob(entry.url, percent => {
                if (onProgress) onProgress(percent === null ? null : Math.round((completed + percent / 100) / entries.length * 100));
            }).then(blob => blob.arrayBuffer()));
            const name = encoder.encode(entry.filename);
            const crc = crc32(data);
            const header = new Uint8Array(30 + name.length);
            const view = new DataView(header.buffer);
            view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
            view.setUint16(8, 0, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
            view.setUint16(26, name.length, true); header.set(name, 30);
            localParts.push(header, data);
            const central = new Uint8Array(46 + name.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x800, true);
            centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true); central.set(name, 46);
            centralParts.push(central); offset += header.length + data.length; completed++;
        }
        const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
        const end = new Uint8Array(22); const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
        chunks.push(...localParts, ...centralParts, end);
        return new Blob(chunks, { type: 'application/zip' });
    }

    async function downloadImage(url, filename, showError = true, onProgress = null) {
        try {
            console.log('[AI 素材提取器] 开始下载:', url);
            
            const blob = await fetchBlob(url, onProgress);
            
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            
            console.log('[AI 素材提取器] 下载完成:', filename);
            return true;
        } catch (error) {
            console.error('[AI 素材提取器] 下载失败:', error);
            if (showError) alert(`下载失败：${error?.message || '网络错误'}，请重试`);
            return false;
        }
    }

    function createFloatingButton() {
        const button = document.createElement('div');
        button.innerHTML = `
            <style>
                * {
                    box-sizing: border-box;
                }
                
                #ai-media-extractor-btn {
                    position: fixed;
                    right: 24px;
                    bottom: 24px;
                    z-index: 9999;
                    width: 48px;
                    height: 48px;
                    background: #ffffff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                }
                
                #ai-media-extractor-btn:hover {
                    border-color: #1f1f1f;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
                }
                
                #ai-media-extractor-btn .count {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 6px;
                    background: #1f1f1f;
                    color: #ffffff;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
                
                #ai-media-extractor-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    z-index: 10000;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                #ai-media-extractor-modal.show {
                    display: flex;
                }
                
                .modal-content {
                    background: #ffffff;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 1000px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
                    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                @keyframes slideUp {
                    from { 
                        transform: translateY(20px); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateY(0); 
                        opacity: 1; 
                    }
                }
                
                .modal-header {
                    padding: 24px 32px;
                    border-bottom: 1px solid #e0e0e0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #1f1f1f;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .modal-header .subtitle {
                    font-size: 13px;
                    color: #6b6b6b;
                    margin-top: 4px;
                    font-weight: 400;
                }
                
                .modal-header-left {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .conversation-meta { margin-top: 5px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8a8a8a; font-size: 12px; }

                .modal-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .batch-btn {
                    min-height: 32px;
                    padding: 0 12px;
                    border: 1px solid #d8d8d8;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #1f1f1f;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                }

                .batch-btn:hover:not(:disabled) {
                    border-color: #1f1f1f;
                    background: #f7f7f7;
                }

                .batch-btn.primary {
                    color: #ffffff;
                    border-color: #1f1f1f;
                    background: #1f1f1f;
                }

                .batch-btn.primary:hover:not(:disabled) { background: #3a3a3a; }
                .batch-btn:disabled { opacity: 0.45; cursor: not-allowed; }
                
                .close-btn {
                    width: 32px;
                    height: 32px;
                    background: transparent;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b6b6b;
                    font-size: 20px;
                    transition: all 0.2s ease;
                    line-height: 1;
                }
                
                .close-btn:hover {
                    background: #f7f7f7;
                    border-color: #1f1f1f;
                    color: #1f1f1f;
                }
                
                .modal-body {
                    padding: 24px 32px;
                    overflow-y: auto;
                    flex: 1;
                }
                
                .modal-body::-webkit-scrollbar {
                    width: 6px;
                }
                
                .modal-body::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .modal-body::-webkit-scrollbar-thumb {
                    background: #d0d0d0;
                    border-radius: 3px;
                }
                
                .modal-body::-webkit-scrollbar-thumb:hover {
                    background: #a0a0a0;
                }
                
                .media-grid {
                    --media-card-width: 220px;
                    --media-preview-height: 220px;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(var(--media-card-width), var(--media-card-width)));
                    justify-content: start;
                    gap: 16px;
                }

                .media-card {
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e0e0e0;
                    background: #fafafa;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                }

                .media-card:hover {
                    border-color: #1f1f1f;
                }

                .media-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eeeeee; }
                .filter-group { display: flex; gap: 4px; }
                .filter-btn { padding: 5px 10px; border: 1px solid #dddddd; border-radius: 5px; background: #fff; color: #666; font-size: 12px; cursor: pointer; }
                .filter-btn.active, .filter-btn:hover { border-color: #222; color: #222; background: #f7f7f7; }
                .refresh-btn { padding: 5px 10px; border: 1px solid #dddddd; border-radius: 5px; background: #fff; color: #555; font-size: 12px; cursor: pointer; }
                .refresh-btn:hover { border-color: #222; color: #222; }
                .download-status { min-height: 18px; margin: 0 0 12px; color: #666; font-size: 12px; }
                .download-status.error { color: #b42318; }

                .media-card.selected {
                    border-color: #1f1f1f;
                    box-shadow: 0 0 0 2px rgba(31, 31, 31, 0.12);
                }

                .media-select {
                    position: absolute;
                    right: 8px;
                    top: 8px;
                    z-index: 3;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.94);
                    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
                    cursor: pointer;
                }

                .media-select input {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                    accent-color: #1f1f1f;
                    cursor: pointer;
                }

                .media-preview {
                    width: 100%;
                    height: var(--media-preview-height);
                    display: block;
                    background: #000;
                    position: relative;
                }

                .media-preview video {
                    width: 100%;
                    height: var(--media-preview-height);
                    object-fit: contain;
                    display: block;
                    background: #000;
                }

                .video-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 8px 10px;
                    font-size: 12px;
                    color: #6b6b6b;
                    background: #ffffff;
                    border-top: 1px solid #f0f0f0;
                }

                .video-meta-item {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .video-actions {
                    display: flex;
                    gap: 8px;
                    padding: 10px;
                    background: #ffffff;
                    border-top: 1px solid #e0e0e0;
                }
                
                .media-preview img {
                    width: 100%;
                    height: var(--media-preview-height);
                    object-fit: cover;
                    display: block;
                }
                
                .image-info {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    padding: 4px 8px;
                    background: rgba(0, 0, 0, 0.6);
                    border-radius: 4px;
                    font-size: 11px;
                    color: #ffffff;
                    font-weight: 500;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }

                .auto-download-badge {
                    position: absolute;
                    left: 8px;
                    top: 8px;
                    padding: 4px 7px;
                    border-radius: 4px;
                    background: #166534;
                    color: #ffffff;
                    font-size: 11px;
                    font-weight: 600;
                    z-index: 1;
                }
                
                .media-card:hover .image-info {
                    opacity: 1;
                }
                
                .action-btn {
                    flex: 1;
                    padding: 6px 12px;
                    border: 1px solid #e0e0e0;
                    border-radius: 4px;
                    background: #ffffff;
                    color: #1f1f1f;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .action-btn:hover {
                    background: #f7f7f7;
                    border-color: #1f1f1f;
                }
                
                .action-btn.success {
                    background: #f0fdf4;
                    border-color: #86efac;
                    color: #166534;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    color: #a0a0a0;
                }
                
                .empty-state-icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                    opacity: 0.5;
                }
                
                .empty-state-text {
                    font-size: 15px;
                    color: #6b6b6b;
                    font-weight: 500;
                }
                
                .empty-state-desc {
                    font-size: 13px;
                    color: #a0a0a0;
                    margin-top: 4px;
                }
                
                .modal-footer {
                    padding: 16px 32px;
                    border-top: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 12px;
                    background: #fafafa;
                }

                .modal-footer .footer-link { cursor: pointer; }
                
                .footer-divider {
                    width: 1px;
                    height: 12px;
                    background: #e0e0e0;
                }
                
                .footer-text {
                    color: #a0a0a0;
                    font-size: 13px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .footer-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #6b6b6b;
                    text-decoration: none;
                    font-size: 13px;
                    transition: all 0.15s ease;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .footer-link:hover {
                    color: #1f1f1f;
                }
                
                .footer-link svg {
                    width: 16px;
                    height: 16px;
                    opacity: 0.7;
                    transition: opacity 0.15s ease;
                }
                
                .footer-link:hover svg {
                    opacity: 1;
                }
            </style>
            <div id="ai-media-extractor-btn" title="提取素材">
                📷
                <span class="count">0</span>
            </div>
            <div id="ai-media-extractor-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h3>素材提取器</h3>
                            <div class="subtitle" id="image-subtitle">共 0 个素材</div>
                            <div class="conversation-meta" id="conversation-meta" title=""></div>
                        </div>
                        <div class="modal-header-actions">
                            <button class="batch-btn" id="select-all-btn" type="button">全选</button>
                            <button class="batch-btn primary" id="batch-download-btn" type="button" disabled>下载所选 (0)</button>
                            <button class="batch-btn" id="zip-download-btn" type="button" disabled>下载全部 ZIP</button>
                            <button class="close-btn" type="button">×</button>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="media-toolbar">
                            <div class="filter-group" role="group" aria-label="素材筛选">
                                <button class="filter-btn active" type="button" data-filter="all">全部</button>
                                <button class="filter-btn" type="button" data-filter="image">图片</button>
                                <button class="filter-btn" type="button" data-filter="video">视频</button>
                            </div>
                            <button class="refresh-btn" id="refresh-media-btn" type="button">重新扫描</button>
                        </div>
                        <div class="download-status" id="download-status" aria-live="polite"></div>
                        <div class="media-grid" id="media-container"></div>
                    </div>
                    <div class="modal-footer">
                        <span class="footer-text">本地扩展</span>
                        <a class="footer-link" href="https://github.com/scj725/ai-media-extractor" target="_blank" rel="noreferrer">在 GitHub 上支持项目</a>
                        <!--
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            开源项目
                        </a>
                        -->
                        <div class="footer-divider"></div>
                        <span class="footer-text">© 2026 AI 素材提取器</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(button);

        floatingBtnElement = document.getElementById('ai-media-extractor-btn');

        const floatingBtn = floatingBtnElement;
        const modal = document.getElementById('ai-media-extractor-modal');
        const closeBtn = modal.querySelector('.close-btn');
        const mediaContainer = document.getElementById('media-container');
        const imageSubtitle = document.getElementById('image-subtitle');
        const conversationMeta = document.getElementById('conversation-meta');
        const downloadStatus = document.getElementById('download-status');
        const refreshMediaBtn = document.getElementById('refresh-media-btn');
        const selectAllBtn = document.getElementById('select-all-btn');
        const batchDownloadBtn = document.getElementById('batch-download-btn');
        const zipDownloadBtn = document.getElementById('zip-download-btn');

        let currentImages = [];
        let currentVideos = [];
        const selectedUrls = new Set();
        let batchDownloading = false;
        let mediaFilter = 'all';
        try {
            const savedFilter = localStorage.getItem('ai-media-extractor-filter');
            if (['all', 'image', 'video'].includes(savedFilter)) mediaFilter = savedFilter;
        } catch (_) {}
        modal.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === mediaFilter));

        function getMediaItems(images = currentImages, videos = currentVideos) {
            return [
                ...images.map((image, index) => ({ type: 'image', data: image, index })),
                ...videos.map((video, index) => ({ type: 'video', data: video, index })),
            ];
        }

        function getVisibleMediaItems() {
            const items = getMediaItems();
            return mediaFilter === 'all' ? items : items.filter(item => item.type === mediaFilter);
        }

        function updateBatchControls() {
            const items = getVisibleMediaItems();
            const availableUrls = new Set(items.map(item => item.data.url));
            [...selectedUrls].forEach(url => {
                if (!availableUrls.has(url)) selectedUrls.delete(url);
            });
            const selectedCount = selectedUrls.size;
            const allSelected = items.length > 0 && items.every(item => selectedUrls.has(item.data.url));
            selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
            selectAllBtn.disabled = batchDownloading || items.length === 0;
            batchDownloadBtn.disabled = batchDownloading || selectedCount === 0;
            zipDownloadBtn.disabled = batchDownloading || getMediaItems().length === 0;
            batchDownloadBtn.textContent = batchDownloading ? '正在下载…' : `下载所选 (${selectedCount})`;
        }

        function formatDuration(sec) {
            if (!sec || sec <= 0) return '';
            const s = Math.floor(sec);
            const m = Math.floor(s / 60);
            const r = s % 60;
            return `${m}:${r.toString().padStart(2, '0')}`;
        }

        function updateImageCount() {
            const images = extractImages();
            const videos = extractVideos();
            currentImages = images;
            currentVideos = videos;
            const totalCount = images.length + videos.length;
            floatingBtn.querySelector('.count').textContent = totalCount;
            imageSubtitle.textContent = `共 ${totalCount} 个素材 · ${images.length} 张图片 · ${videos.length} 个视频`;
            conversationMeta.textContent = `${getSiteName()} · ${getConversationTitle()}`;
            conversationMeta.title = conversationMeta.textContent;
            return { images, videos };
        }

        function renderMedia(images, videos) {
            const allMediaItems = getMediaItems(images, videos);
            const mediaItems = mediaFilter === 'all' ? allMediaItems : allMediaItems.filter(item => item.type === mediaFilter);

            if (mediaItems.length === 0) {
                mediaContainer.innerHTML = allMediaItems.length ? '<div class="empty-state"><div class="empty-state-icon">🔎</div><div class="empty-state-text">这个筛选条件下没有素材</div></div>' : '';
                updateBatchControls();
                return;
            }

            mediaContainer.innerHTML = mediaItems.map((item) => {
                if (item.type === 'image') {
                    const image = item.data;
                    const resolution = (image.width && image.height) ? `${image.width} × ${image.height}` : '';
                    return `
                        <div class="media-card${selectedUrls.has(image.url) ? ' selected' : ''}" data-url="${image.url}">
                            <div class="media-preview">
                                <img src="${image.url}" alt="图片 ${item.index + 1}" loading="lazy">
                                <label class="media-select" title="选择图片"><input class="media-checkbox" type="checkbox" data-url="${image.url}"${selectedUrls.has(image.url) ? ' checked' : ''} aria-label="选择图片 ${item.index + 1}"></label>
                                <div class="auto-download-badge" data-url="${image.url}"${autoDownloadedUrls.has(image.url) ? '' : ' hidden'}>✓ 已自动下载</div>
                                ${resolution ? `<div class="image-info">${resolution}</div>` : ''}
                            </div>
                            <div class="video-meta">
                                <span class="video-meta-item">🖼 图片</span>
                                ${resolution ? `<span class="video-meta-item">📐 ${resolution}</span>` : ''}
                            </div>
                            <div class="video-actions">
                                <button class="action-btn btn-media-download" data-type="image" data-url="${image.url}" data-index="${item.index}">下载</button>
                                <button class="action-btn btn-media-copy" data-url="${image.url}">复制地址</button>
                            </div>
                        </div>
                    `;
                }

                const video = item.data;
                const resolution = (video.width && video.height) ? `${video.width} × ${video.height}` : '';
                const duration = formatDuration(video.duration);
                const posterAttr = video.poster_url ? ` poster="${video.poster_url}"` : '';
                return `
                    <div class="media-card${selectedUrls.has(video.url) ? ' selected' : ''}" data-url="${video.url}">
                            <div class="media-preview">
                                <video src="${video.url}" controls preload="none" playsinline${posterAttr}></video>
                                <label class="media-select" title="选择视频"><input class="media-checkbox" type="checkbox" data-url="${video.url}"${selectedUrls.has(video.url) ? ' checked' : ''} aria-label="选择视频 ${item.index + 1}"></label>
                                <div class="auto-download-badge" data-url="${video.url}"${autoDownloadedUrls.has(video.url) ? '' : ' hidden'}>✓ 已自动下载</div>
                        </div>
                        <div class="video-meta">
                            <span class="video-meta-item">🎬 视频</span>
                            ${resolution ? `<span class="video-meta-item">📐 ${resolution}</span>` : ''}
                            ${duration ? `<span class="video-meta-item">⏱ ${duration}</span>` : ''}
                            ${video.definition ? `<span class="video-meta-item">清晰度 ${video.definition}</span>` : ''}
                        </div>
                        <div class="video-actions">
                            <button class="action-btn btn-media-download" data-type="video" data-url="${video.url}" data-index="${item.index}">下载</button>
                            <button class="action-btn btn-media-copy" data-url="${video.url}">复制地址</button>
                        </div>
                    </div>
                `;
            }).join('');

            mediaContainer.querySelectorAll('.media-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) selectedUrls.add(checkbox.dataset.url);
                    else selectedUrls.delete(checkbox.dataset.url);
                    checkbox.closest('.media-card')?.classList.toggle('selected', checkbox.checked);
                    updateBatchControls();
                });
            });

            mediaContainer.querySelectorAll('.media-preview img').forEach(image => image.addEventListener('dblclick', event => {
                event.stopPropagation();
                window.open(image.currentSrc || image.src, '_blank', 'noopener,noreferrer');
            }));

            mediaContainer.querySelectorAll('.btn-media-download').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const type = btn.dataset.type;
                    const mediaCard = btn.closest('.media-card');
                    const video = mediaCard?.querySelector('video');
                    const url = video?.currentSrc || video?.src || btn.dataset.url;
                    const index = parseInt(btn.dataset.index, 10) + 1;
                    btn.disabled = true;
                    btn.textContent = '下载中…';
                    downloadStatus.textContent = '正在下载…';
                    const downloaded = await downloadImage(url, mediaFilename(type, index), true, percent => {
                        downloadStatus.textContent = percent === null ? '正在下载…' : `正在下载… ${percent}%`;
                    });
                    btn.disabled = false;
                    btn.classList.toggle('success', downloaded);
                    btn.textContent = downloaded ? '✓ 已下载' : '重试下载';
                    downloadStatus.textContent = downloaded ? '下载完成' : '下载失败，可点击重试';
                    if (downloaded) setTimeout(() => { btn.classList.remove('success'); btn.textContent = '下载'; downloadStatus.textContent = ''; }, 2200);
                });
            });

            mediaContainer.querySelectorAll('.btn-media-copy').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const mediaCard = btn.closest('.media-card');
                    const video = mediaCard?.querySelector('video');
                    const url = video?.currentSrc || video?.src || btn.dataset.url;
                    try {
                        await navigator.clipboard.writeText(url);
                        btn.classList.add('success');
                        btn.textContent = '✓ 已复制';
                        setTimeout(() => {
                            btn.classList.remove('success');
                            btn.textContent = '复制地址';
                        }, 2000);
                    } catch (err) {
                        console.error('复制失败:', err);
                    }
                });
            });
            updateBatchControls();
        }

        selectAllBtn.addEventListener('click', () => {
            const items = getVisibleMediaItems();
            const allSelected = items.length > 0 && items.every(item => selectedUrls.has(item.data.url));
            items.forEach(item => {
                if (allSelected) selectedUrls.delete(item.data.url);
                else selectedUrls.add(item.data.url);
            });
            renderMedia(currentImages, currentVideos);
        });

        batchDownloadBtn.addEventListener('click', async () => {
            if (batchDownloading) return;
            const selectedItems = getMediaItems().filter(item => selectedUrls.has(item.data.url));
            if (selectedItems.length === 0) return;
            batchDownloading = true;
            updateBatchControls();
            let successCount = 0;
            lastDownloadFailures = [];
            for (const item of selectedItems) {
                downloadStatus.textContent = `正在下载 ${successCount + 1}/${selectedItems.length}…`;
                if (await downloadImage(item.data.url, mediaFilename(item.type, item.index + 1), false, percent => {
                    downloadStatus.textContent = percent === null ? `正在下载 ${successCount + 1}/${selectedItems.length}…` : `正在下载 ${successCount + 1}/${selectedItems.length}… ${percent}%`;
                })) successCount++;
                else lastDownloadFailures.push(item);
            }
            batchDownloading = false;
            updateBatchControls();
            downloadStatus.classList.toggle('error', lastDownloadFailures.length > 0);
            downloadStatus.textContent = lastDownloadFailures.length ? `完成：成功 ${successCount} 个，失败 ${lastDownloadFailures.length} 个。请点击失败项目重试。` : `全部下载完成，共 ${successCount} 个。`;
        });

        zipDownloadBtn.addEventListener('click', async () => {
            if (batchDownloading) return;
            const items = getMediaItems();
            if (!items.length) return;
            batchDownloading = true;
            updateBatchControls();
            downloadStatus.classList.remove('error');
            try {
                const entries = items.map(item => ({ url: item.data.url, filename: mediaFilename(item.type, item.index + 1) }));
                const zipBlob = await createZip(entries, percent => { downloadStatus.textContent = percent === null ? '正在制作 ZIP…' : `正在制作 ZIP… ${percent}%`; });
                const zipUrl = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = zipUrl;
                link.download = `${safeFilename(getSiteName())}_${safeFilename(getConversationTitle())}.zip`;
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
                downloadStatus.textContent = `ZIP 下载已开始，共 ${items.length} 个素材。`;
            } catch (error) {
                console.error('[AI 素材提取器] ZIP 下载失败:', error);
                downloadStatus.classList.add('error');
                downloadStatus.textContent = `ZIP 下载失败：${error?.message || '网络错误'}。`;
            } finally {
                batchDownloading = false;
                updateBatchControls();
            }
        });

        modal.querySelectorAll('.filter-btn').forEach(filterBtn => filterBtn.addEventListener('click', () => {
            mediaFilter = filterBtn.dataset.filter;
            try { localStorage.setItem('ai-media-extractor-filter', mediaFilter); } catch (_) {}
            modal.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn === filterBtn));
            renderMedia(currentImages, currentVideos);
        }));

        refreshMediaBtn.addEventListener('click', () => {
            refreshMediaBtn.disabled = true;
            downloadStatus.classList.remove('error');
            downloadStatus.textContent = '正在重新扫描页面…';
            const { images, videos } = updateImageCount();
            renderMedia(images, videos);
            setTimeout(() => { refreshMediaBtn.disabled = false; downloadStatus.textContent = ''; }, 600);
        });

        window.addEventListener('ai-media-extractor-media-added', () => {
            if (!modal.classList.contains('show')) return;
            const { images, videos } = updateImageCount();
            renderMedia(images, videos);
        });

        floatingBtn.addEventListener('click', () => {
            const { images, videos } = updateImageCount();

            if (images.length === 0 && videos.length === 0) {
                mediaContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🖼️</div>
                        <div class="empty-state-text">当前页面没有找到图片或视频</div>
                    </div>
                `;
            } else {
                renderMedia(images, videos);
            }

            modal.classList.add('show');
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });

        document.addEventListener('keydown', event => {
            if (!modal.classList.contains('show')) return;
            if (event.key === 'Escape') {
                modal.classList.remove('show');
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
                event.preventDefault();
                const items = getVisibleMediaItems();
                items.forEach(item => selectedUrls.add(item.data.url));
                renderMedia(currentImages, currentVideos);
            }
        });

        updateImageCount();
    }

    let initRetryCount = 0;
    const MAX_RETRY = 10;

    function initScript() {
        console.log('[AI 素材提取器] 脚本已加载');
        loadSettings();
        startDolaVideoObserver();
        
        if (window.location.pathname.includes('/chat/')) {
            createFloatingButton();
            return;
        }
        
        const hasScriptData = !!document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
        const hasRouterData = !!window._ROUTER_DATA;
        
        if (!hasScriptData && !hasRouterData) {
            initRetryCount++;
            if (initRetryCount < MAX_RETRY) {
                console.warn(`[AI 素材提取器] 页面数据仍未加载，等待中... (${initRetryCount}/${MAX_RETRY})`);
                setTimeout(initScript, 500);
                return;
            } else {
                console.warn('[AI 素材提取器] 页面数据加载超时，仍创建按钮（可能无法提取历史图片）');
            }
        }

        if (window.location.hostname.includes('doubao.com') && window.location.pathname.includes('/thread/')) {
            chatImages = extractSharePageImages();
        }
        
        createFloatingButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else if (document.readyState === 'interactive') {
        if (document.body) {
            initScript();
        } else {
            document.addEventListener('DOMContentLoaded', initScript);
        }
    } else {
        initScript();
    }

})();
