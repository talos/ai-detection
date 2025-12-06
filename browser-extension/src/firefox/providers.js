// AI Detection Provider Interface
// Each provider must implement:
// - id: string
// - name: string
// - buildRequest(text, apiKey): { url, options }
// - parseResponse(json): [{ sentence: string, score: number }]

const providers = {
    sapling: {
        id: 'sapling',
        name: 'Sapling AI',
        keyPlaceholder: 'Enter Sapling API key',

        buildRequest(text, apiKey) {
            return {
                url: 'https://api.sapling.ai/api/v1/aidetect',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: apiKey,
                        text: text,
                        session_id: 'browser_extension'
                    })
                }
            };
        },

        parseResponse(json) {
            // Returns array of { sentence, score }
            // score: 0 = AI, 1 = human
            return json.sentence_scores || [];
        }
    }

    // Add more providers here:
    // gptzero: { ... },
    // originality: { ... },
};

function getProvider(id) {
    return providers[id] || providers.sapling;
}

function getProviderList() {
    return Object.values(providers).map(p => ({ id: p.id, name: p.name }));
}