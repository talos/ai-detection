// AI Content Detection - Background Script
const DB_NAME = 'ai-detect-logs';
const DB_VERSION = 1;

let db = null;

async function openDB() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('logs')) {
                const store = database.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp');
                store.createIndex('url', 'url');
            }
        };
    });
}

async function logResult(url, text, result, providerId) {
    const database = await openDB();
    const tx = database.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');

    store.add({
        timestamp: Date.now(),
        url: url,
        provider: providerId,
        textLength: text.length,
        textPreview: text.slice(0, 200),
        sentenceCount: result.length,
        sentences: result
    });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        browser.tabs.sendMessage(sender.tab.id, { action: 'toggle' });
    } else if (message.action === 'detectAI') {
        const url = sender.tab?.url || 'unknown';
        detectAIContent(message.text)
            .then(result => {
                logResult(url, message.text, result.sentences, result.providerId);
                sendResponse({
                    success: true,
                    data: result.sentences,
                    providerId: result.providerId,
                    providerName: result.providerName
                });
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.action === 'getProviders') {
        sendResponse(getProviderList());
    } else if (message.action === 'getActiveProvider') {
        // Return current provider info for UI display
        browser.storage.local.get(['providerId']).then(storage => {
            const providerId = storage.providerId || 'sapling';
            const provider = getProvider(providerId);
            sendResponse({ providerId, providerName: provider.name });
        });
        return true;
    }
});

// Note: browserAction.onClicked doesn't fire when popup is defined
// The popup.js handles triggering analysis via message passing

async function detectAIContent(text) {
    const storage = await browser.storage.local.get(['providerId', 'apiKeys']);
    const providerId = storage.providerId || 'sapling';
    const apiKeys = storage.apiKeys || {};
    const apiKey = apiKeys[providerId];

    if (!apiKey) {
        throw new Error(`API key not configured for ${providerId}. Go to extension options.`);
    }

    const provider = getProvider(providerId);
    const { url, options } = provider.buildRequest(text, apiKey);

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    const sentences = provider.parseResponse(json);

    return { sentences, providerId, providerName: provider.name };
}