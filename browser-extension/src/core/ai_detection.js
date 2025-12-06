// Core AI detection logic
const SAPLING_API_KEY = 'YOUR_API_KEY_HERE'; // Hardcoded for now
const SAPLING_API_ENDPOINT = 'https://api.sapling.ai/api/v1/aidetect';

async function detectAIContent(text) {
    // Validate text length
    if (text.length > 5000) {
        throw new Error('Text exceeds 5000 character limit');
    }

    try {
        const response = await fetch(SAPLING_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SAPLING_API_KEY}`
            },
            body: JSON.stringify({
                text: text,
                session_id: 'browser_extension'
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const result = await response.json();
        return result.sentences || [];
    } catch (error) {
        console.error('AI detection error:', error);
        throw error;
    }
}

// Finds the sentences in the original text based on API response
function mapSentencesToOriginalText(text, apiSentences) {
    let processedSentences = [];
    let remainingText = text;

    apiSentences.forEach(sentence => {
        const index = remainingText.indexOf(sentence.text);
        if (index !== -1) {
            processedSentences.push({
                text: sentence.text,
                score: sentence.score,
                start: text.indexOf(sentence.text),
                end: text.indexOf(sentence.text) + sentence.text.length
            });
            remainingText = remainingText.slice(index + sentence.text.length);
        }
    });

    return processedSentences;
}

export { detectAIContent, mapSentencesToOriginalText };