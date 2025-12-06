// AI Content Detection - Background Script
browser.browserAction.onClicked.addListener(async (tab) => {
    try {
        await browser.tabs.sendMessage(tab.id, { action: 'toggle' });
    } catch (err) {
        // Content script might not be loaded yet, inject it first
        console.error('Failed to send message:', err);
    }
});