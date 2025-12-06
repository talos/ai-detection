// AI Content Detection - Content Script
(function() {
    'use strict';

    // ============ Configuration ============
    const SAPLING_API_KEY = 'BNUHLNNRCK23AU2MKO6WW5DPFSQW4JBD';
    const SAPLING_API_ENDPOINT = 'https://api.sapling.ai/api/v1/aidetect';
    const MAX_CHARS = 5000;

    // ============ State ============
    let isActive = false;
    let hoveredElement = null;

    // ============ API Functions ============
    async function detectAIContent(text) {
        if (text.length > MAX_CHARS) {
            throw new Error(`Text exceeds ${MAX_CHARS} character limit (got ${text.length})`);
        }

        const response = await fetch(SAPLING_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: SAPLING_API_KEY,
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

    function mapSentencesToPositions(text, sentenceScores) {
        const mapped = [];
        let searchStart = 0;

        for (const item of sentenceScores) {
            const sentence = item.sentence;
            const idx = text.indexOf(sentence, searchStart);

            if (idx !== -1) {
                mapped.push({
                    text: sentence,
                    score: item.score,
                    start: idx,
                    end: idx + sentence.length
                });
                searchStart = idx + sentence.length;
            }
        }

        return mapped;
    }

    // ============ UI Functions ============
    function showToast(message, isError = false) {
        const existing = document.getElementById('ai-detect-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ai-detect-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            background: ${isError ? '#dc3545' : '#333'};
            color: white;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function showLoader(element) {
        const loader = document.createElement('div');
        loader.id = 'ai-detect-loader';
        loader.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 16px;
                background: #333;
                color: white;
                border-radius: 6px;
                font-family: system-ui, sans-serif;
                font-size: 14px;
            ">
                <div style="
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: ai-detect-spin 1s linear infinite;
                "></div>
                Analyzing text...
            </div>
        `;

        // Add keyframes if not present
        if (!document.getElementById('ai-detect-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-detect-styles';
            style.textContent = `
                @keyframes ai-detect-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        loader.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 2147483647;
        `;
        document.body.appendChild(loader);
    }

    function hideLoader() {
        const loader = document.getElementById('ai-detect-loader');
        if (loader) loader.remove();
    }

    function highlightElement(element) {
        element.style.outline = '3px solid #007bff';
        element.style.outlineOffset = '2px';
    }

    function unhighlightElement(element) {
        element.style.outline = '';
        element.style.outlineOffset = '';
    }

    function getScoreColor(score) {
        // score 0 = AI (red), score 1 = human (green)
        const red = Math.round(255 * (1 - score));
        const green = Math.round(255 * score);
        return `rgba(${red}, ${green}, 0, 0.35)`;
    }

    function highlightSentences(element, mappedSentences) {
        const text = element.textContent;

        // Build new HTML with highlighted sentences
        let html = '';
        let lastEnd = 0;

        for (const s of mappedSentences) {
            // Text before this sentence
            if (s.start > lastEnd) {
                html += escapeHtml(text.slice(lastEnd, s.start));
            }
            // The sentence with highlighting
            const color = getScoreColor(s.score);
            const scorePercent = Math.round(s.score * 100);
            html += `<span style="background-color: ${color};" title="Human: ${scorePercent}%">${escapeHtml(s.text)}</span>`;
            lastEnd = s.end;
        }

        // Remaining text
        if (lastEnd < text.length) {
            html += escapeHtml(text.slice(lastEnd));
        }

        element.innerHTML = html;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============ Event Handlers ============
    function onMouseOver(e) {
        if (!isActive) return;

        const target = e.target;
        if (target === hoveredElement) return;

        if (hoveredElement) {
            unhighlightElement(hoveredElement);
        }

        hoveredElement = target;
        highlightElement(target);
    }

    function onMouseOut(e) {
        if (!isActive) return;

        if (hoveredElement) {
            unhighlightElement(hoveredElement);
            hoveredElement = null;
        }
    }

    async function onClick(e) {
        if (!isActive) return;

        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const text = target.textContent.trim();

        if (!text) {
            showToast('No text content in selected element', true);
            return;
        }

        if (text.length > MAX_CHARS) {
            showToast(`Text too long: ${text.length} chars (max ${MAX_CHARS})`, true);
            return;
        }

        // Deactivate selection mode
        deactivate();

        // Show loader
        showLoader(target);

        try {
            const sentenceScores = await detectAIContent(text);
            const mapped = mapSentencesToPositions(text, sentenceScores);
            hideLoader();
            highlightSentences(target, mapped);
            showToast(`Analyzed ${mapped.length} sentences`);
        } catch (err) {
            hideLoader();
            showToast(err.message, true);
        }
    }

    // ============ Activation ============
    function activate() {
        if (isActive) return;
        isActive = true;

        document.body.style.cursor = 'crosshair';
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);

        showToast('Click on an element to analyze');
    }

    function deactivate() {
        if (!isActive) return;
        isActive = false;

        document.body.style.cursor = '';
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('mouseout', onMouseOut, true);
        document.removeEventListener('click', onClick, true);

        if (hoveredElement) {
            unhighlightElement(hoveredElement);
            hoveredElement = null;
        }
    }

    // ============ Message Listener ============
    browser.runtime.onMessage.addListener((message) => {
        if (message.action === 'toggle') {
            if (isActive) {
                deactivate();
            } else {
                activate();
            }
        }
    });
})();
