(() => {
    const checkbox = document.getElementById('auto-download');
    const status = document.getElementById('setting-status');
    browser.storage.local.get({ autoDownload: false }).then(settings => {
        checkbox.checked = Boolean(settings.autoDownload);
    });
    checkbox.addEventListener('change', () => {
        browser.storage.local.set({ autoDownload: checkbox.checked }).then(() => {
            status.textContent = checkbox.checked ? '已开启，设置会在扩展更新后保留。' : '已关闭。';
            setTimeout(() => { status.textContent = ''; }, 2200);
        });
    });
})();
