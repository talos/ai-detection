// AI Detection Provider Interface
// Each provider must implement:
// - id: string                                    - unique identifier for storage/lookup
// - name: string                                  - display name in UI
// - keyPlaceholder: string                        - placeholder text for API key input
// - buildRequest(text, apiKey): { url, options }  - returns fetch() compatible request config
// - parseResponse(json): [{ sentence, score }]    - normalize API response to common format
//
// Score normalization: all providers MUST return scores where 0 = AI, 1 = human
// This matches the sapling convention. Invert scores from APIs that use opposite scales.
//
// GPTZero API Reference:
//   Endpoint: POST https://api.gptzero.me/v2/predict/text
//   Auth: x-api-key header
//   Body: { document: string, multilingual: boolean }
//   Response: { documents: [{ sentences: [{ sentence, generated_prob }], ... }] }
//   Note: generated_prob is 0-1 where 1 = AI, so we invert to match our convention

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
    },

    gptzero: {
        id: 'gptzero',
        name: 'GPTZero',
        keyPlaceholder: 'Enter GPTZero API key',

        buildRequest(text, apiKey) {
            return {
                url: 'https://api.gptzero.me/v2/predict/text',
                options: {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey
                    },
                    body: JSON.stringify({
                        document: text,
                        multilingual: false
                    })
                }
            };
        },

        parseResponse(json) {
            // GPTZero returns documents[0].sentences array
            // Each sentence has: sentence, generated_prob (0-1 where higher = more AI)
            // We need to invert the score to match sapling format (0 = AI, 1 = human)
            const doc = json.documents?.[0];
            if (!doc?.sentences) {
                return [];
            }
            return doc.sentences.map(s => ({
                sentence: s.sentence,
                score: 1 - s.generated_prob  // invert: gptzero 1=AI -> 0=AI for display
            }));
        }
    },

    // Add more providers here:
    // originality: { ... },
};

function getProvider(id) {
    return providers[id] || providers.sapling;
}

function getProviderList() {
    return Object.values(providers).map(p => ({ id: p.id, name: p.name }));
}