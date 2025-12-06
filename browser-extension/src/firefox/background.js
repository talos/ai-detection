// AI Content Detection - Background Script
const SAPLING_API_ENDPOINT = 'https://api.sapling.ai/api/v1/aidetect';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        browser.tabs.sendMessage(sender.tab.id, { action: 'toggle' });
    } else if (message.action === 'detectAI') {
        detectAIContent(message.text)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

browser.browserAction.onClicked.addListener((tab) => {
    browser.tabs.sendMessage(tab.id, { action: 'toggle' });
});

async function detectAIContent(text) {
    const { saplingApiKey } = await browser.storage.local.get('saplingApiKey');

    if (!saplingApiKey) {
        throw new Error('API key not configured. Right-click extension icon → Options');
    }

    const response = await fetch(SAPLING_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key: saplingApiKey,
            text: text,
            session_id: 'browser_extension'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.sentence_scores || [];
}