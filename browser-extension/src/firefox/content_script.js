import { detectAIContent, mapSentencesToOriginalText } from '../core/ai_detection.js';

function highlightSentences(div, sentences) {
    const divText = div.textContent;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    sentences.forEach(sentence => {
        // Add text before the sentence
        if (sentence.start > lastIndex) {
            const textBefore = document.createTextNode(divText.slice(lastIndex, sentence.start));
            fragment.appendChild(textBefore);
        }

        // Create highlighted sentence span
        const sentenceSpan = document.createElement('span');
        sentenceSpan.textContent = sentence.text;
        sentenceSpan.style.backgroundColor = `rgba(${255 * (1 - sentence.score)}, ${255 * sentence.score}, 0, 0.3)`;
        fragment.appendChild(sentenceSpan);

        lastIndex = sentence.end;
    });

    // Add any remaining text
    if (lastIndex < divText.length) {
        const remainingText = document.createTextNode(divText.slice(lastIndex));
        fragment.appendChild(remainingText);
    }

    // Replace div content
    div.innerHTML = '';
    div.appendChild(fragment);
}

async function processDivAIDetection(div) {
    try {
        const text = div.textContent.trim();
        const apiResult = await detectAIContent(text);
        const sentences = mapSentencesToOriginalText(text, apiResult);
        
        highlightSentences(div, sentences);
    } catch (error) {
        // Show error toast
        const toast = document.createElement('div');
        toast.textContent = `AI Detection Error: ${error.message}`;
        toast.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: red;
            color: white;
            padding: 10px;
            z-index: 9999;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'detectAI') {
        const selectedDiv = document.elementFromPoint(message.x, message.y);
        if (selectedDiv && selectedDiv.textContent.trim()) {
            processDivAIDetection(selectedDiv);
        }
    }
});