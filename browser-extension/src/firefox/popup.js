document.addEventListener('DOMContentLoaded', async () => {
    const providerSelect = document.getElementById('provider');
    const analyzeButton = document.getElementById('analyze');
    const status = document.getElementById('status');
    const openSettings = document.getElementById('openSettings');

    // Populate provider dropdown
    const providerList = getProviderList();
    for (const p of providerList) {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        providerSelect.appendChild(option);
    }

    // Load current provider
    const storage = await browser.storage.local.get(['providerId', 'apiKeys']);
    const currentProviderId = storage.providerId || 'sapling';
    const apiKeys = storage.apiKeys || {};
    providerSelect.value = currentProviderId;

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
