// Runs in the extension's isolated world and bridges page-script requests to
// the service worker, where the fallback API is not subject to page CORS.
window.addEventListener('ai-media-extractor-fallback-request', event => {
    let detail;
    try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail || {}; } catch (_) { return; }
    if (!detail.id || typeof detail.url !== 'string') return;
    chrome.runtime.sendMessage({ type: 'doubao-fetch-fallback', url: detail.url }, response => {
        const error = chrome.runtime.lastError?.message;
        window.dispatchEvent(new CustomEvent('ai-media-extractor-fallback-response', { detail: JSON.stringify({
            id: detail.id, ok: Boolean(response?.ok) && !error, data: response?.data, error: error || response?.error
        }) }));
    });
});

// Page-world scripts cannot access chrome.storage directly. Keep preferences
// in the extension's local store and return them through a string-only bridge.
window.addEventListener('ai-media-extractor-settings-request', event => {
    let detail;
    try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail || {}; } catch (_) { return; }
    if (!detail.id) return;
    chrome.storage.local.get({ autoDownload: false, autoDownloadedUrls: [], dolaVideoDuration: 0 }, settings => {
        window.dispatchEvent(new CustomEvent('ai-media-extractor-settings-response', {
            detail: JSON.stringify({ id: detail.id, autoDownload: Boolean(settings.autoDownload), autoDownloadedUrls: Array.isArray(settings.autoDownloadedUrls) ? settings.autoDownloadedUrls : [], dolaVideoDuration: settings.dolaVideoDuration })
        }));
    });
});

window.addEventListener('ai-media-extractor-auto-download-mark', event => {
    let detail;
    try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail || {}; } catch (_) { return; }
    if (typeof detail.url !== 'string' || !detail.url) return;
    chrome.storage.local.get({ autoDownloadedUrls: [] }, settings => {
        const urls = Array.isArray(settings.autoDownloadedUrls) ? settings.autoDownloadedUrls.filter(url => typeof url === 'string') : [];
        if (!urls.includes(detail.url)) urls.push(detail.url);
        chrome.storage.local.set({ autoDownloadedUrls: urls.slice(-500) });
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.autoDownloadedUrls) {
        const urls = Array.isArray(changes.autoDownloadedUrls.newValue) ? changes.autoDownloadedUrls.newValue : [];
        window.dispatchEvent(new CustomEvent('ai-media-extractor-auto-download-history-changed', {
            detail: JSON.stringify({ autoDownloadedUrls: urls })
        }));
    }
    if (changes.dolaVideoDuration) {
        window.dispatchEvent(new CustomEvent('ai-media-extractor-settings-changed', {
            detail: JSON.stringify({ dolaVideoDuration: changes.dolaVideoDuration.newValue })
        }));
    }
});
