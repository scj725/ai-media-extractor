// Extension service workers may read hosts declared in host_permissions.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'doubao-fetch-fallback' || typeof message.url !== 'string') {
        return false;
    }

    let target;
    try {
        target = new URL(message.url);
    } catch (_) {
        sendResponse({ ok: false, error: 'Invalid fallback URL.' });
        return false;
    }
    if (target.protocol !== 'https:' || target.hostname !== 'vas-lf-x.snssdk.com') {
        sendResponse({ ok: false, error: 'Unexpected fallback host.' });
        return false;
    }

    fetch(target.href, { headers: { accept: 'application/json,text/plain,*/*' } })
        .then(async response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            sendResponse({ ok: true, data: await response.json() });
        })
        .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
});
