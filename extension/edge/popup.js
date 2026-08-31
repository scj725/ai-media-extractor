(() => {
    const checkbox = document.getElementById('auto-download');
    const status = document.getElementById('setting-status');
    const clearHistory = document.getElementById('clear-history');
    const videoDuration = document.getElementById('dola-video-duration');
    chrome.storage.local.get({ autoDownload: false, dolaVideoDuration: 0 }, settings => {
        checkbox.checked = Boolean(settings.autoDownload);
        videoDuration.value = [0, 15, 30].includes(Number(settings.dolaVideoDuration)) ? String(settings.dolaVideoDuration) : '0';
    });
    videoDuration.addEventListener('change', () => {
        const duration = Number(videoDuration.value);
        chrome.storage.local.set({ dolaVideoDuration: duration }, () => {
            status.textContent = duration ? `Dola 将请求生成 ${duration} 秒视频。` : '已恢复平台默认时长。';
            setTimeout(() => { status.textContent = ''; }, 2200);
        });
    });
    checkbox.addEventListener('change', () => {
        chrome.storage.local.set({ autoDownload: checkbox.checked }, () => {
            status.textContent = checkbox.checked ? '已开启，设置会在扩展更新后保留。' : '已关闭。';
            setTimeout(() => { status.textContent = ''; }, 2200);
        });
    });
    clearHistory.addEventListener('click', () => {
        chrome.storage.local.set({ autoDownloadedUrls: [] }, () => {
            status.textContent = '已清除自动下载记录。';
            setTimeout(() => { status.textContent = ''; }, 2200);
        });
    });
})();
