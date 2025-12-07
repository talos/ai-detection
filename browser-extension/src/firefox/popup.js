document.addEventListener('DOMContentLoaded', async () => {
    const providerSelect = document.getElementById('provider');
    const analyzeButton = document.getElementById('analyze');
    const status = document.getElementById('status');
    const openSettings = document.getElementById('openSettings');
    const historyList = document.getElementById('historyList');

    // Populate provider dropdown
    const providerList = getProviderList();
    for (const p of providerList) {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        providerSelect.appendChild(option);
    }

    // Load current provider and captures
    const storage = await browser.storage.local.get(['providerId', 'apiKeys', 'captures']);
    const currentProviderId = storage.providerId || 'sapling';
    const apiKeys = storage.apiKeys || {};
    const captures = storage.captures || [];
    providerSelect.value = currentProviderId;

    // Display capture history
    function formatTimestamp(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname + (parsed.pathname.length > 30
                ? parsed.pathname.substring(0, 30) + '...'
                : parsed.pathname);
        } catch {
            return url.substring(0, 40);
        }
    }

    function renderHistory() {
        if (captures.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No captures yet</div>';
            return;
        }

        historyList.innerHTML = '';
        for (const capture of captures.slice(0, 10)) {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="url">${formatUrl(capture.url)}</div>
                <div class="timestamp">${formatTimestamp(capture.timestamp)}</div>
            `;
            item.addEventListener('click', async () => {
                // Send message to content script to open this capture's modal
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    await browser.tabs.sendMessage(tabs[0].id, {
                        action: 'openCapture',
                        result: capture.result,
                        text: capture.text
                    });
                }
                window.close();
            });
            historyList.appendChild(item);
        }
    }

    renderHistory();

    // Switch provider immediately on change
    providerSelect.addEventListener('change', async () => {
        const newProviderId = providerSelect.value;
        await browser.storage.local.set({ providerId: newProviderId });

        // Check if API key exists for this provider
        if (!apiKeys[newProviderId]) {
            status.textContent = `No API key for ${getProvider(newProviderId).name}`;
            status.className = 'status error';
        } else {
            status.className = 'status';
        }
    });

    // Analyze button triggers selection mode
    analyzeButton.addEventListener('click', async () => {
        const providerId = providerSelect.value;
        if (!apiKeys[providerId]) {
            status.textContent = `Set API key in settings first`;
            status.className = 'status error';
            return;
        }

        // Get active tab and send toggle message
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            await browser.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
        }
        window.close();
    });

    // Open settings
    openSettings.addEventListener('click', (e) => {
        e.preventDefault();
        browser.runtime.openOptionsPage();
        window.close();
    });
});
