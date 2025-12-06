// AI Content Detection - Content Script
(function() {
    'use strict';

    // ============ Configuration ============
    const MAX_CHARS = 20000;

    // ============ State ============
    let isActive = false;
    let hoveredElement = null;

    // ============ API Functions ============
    async function detectAIContent(text) {
        if (text.length > MAX_CHARS) {
            throw new Error(`Text exceeds ${MAX_CHARS} character limit (got ${text.length})`);
        }

        const response = await browser.runtime.sendMessage({
            action: 'detectAI',
            text: text
        });

        if (!response.success) {
            throw new Error(response.error);
        }

        return response.data;
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

    const MARK_CLASS = 'ai-detect-mark';

    function getScoreColor(score) {
        // score 0 = AI (red), score 1 = human (green)
        const red = Math.round(255 * (1 - score));
        const green = Math.round(255 * score);
        return `rgba(${red}, ${green}, 0, 0.35)`;
    }

    function highlightSentences(element, mappedSentences) {
        const fullText = element.textContent;

        // Build a list of {start, end, score} relative to fullText
        // We'll walk text nodes and wrap matching ranges
        const ranges = mappedSentences.map(s => ({
            start: s.start,
            end: s.end,
            score: s.score,
            text: s.text
        }));

        let charOffset = 0;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        // Collect all text nodes first (modifying while walking is dangerous)
        let node;
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            const nodeText = textNode.nodeValue;
            const nodeStart = charOffset;
            const nodeEnd = charOffset + nodeText.length;

            // Find ranges that overlap this text node
            const overlapping = ranges.filter(r => r.start < nodeEnd && r.end > nodeStart);

            if (overlapping.length === 0) {
                charOffset = nodeEnd;
                continue;
            }

            // Split this text node according to overlapping ranges
            const fragment = document.createDocumentFragment();
            let pos = 0;

            for (const range of overlapping) {
                const rangeStartInNode = Math.max(0, range.start - nodeStart);
                const rangeEndInNode = Math.min(nodeText.length, range.end - nodeStart);

                // Text before this range
                if (rangeStartInNode > pos) {
                    fragment.appendChild(document.createTextNode(nodeText.slice(pos, rangeStartInNode)));
                }

                // The highlighted range
                const mark = document.createElement('mark');
                mark.className = MARK_CLASS;
                mark.style.backgroundColor = getScoreColor(range.score);
                mark.style.color = 'inherit';
                mark.title = `Human: ${Math.round(range.score * 100)}%`;
                mark.textContent = nodeText.slice(rangeStartInNode, rangeEndInNode);
                fragment.appendChild(mark);

                pos = rangeEndInNode;
            }

            // Remaining text after last range
            if (pos < nodeText.length) {
                fragment.appendChild(document.createTextNode(nodeText.slice(pos)));
            }

            textNode.parentNode.replaceChild(fragment, textNode);
            charOffset = nodeEnd;
        }
    }

    function removeHighlights() {
        const marks = document.querySelectorAll(`mark.${MARK_CLASS}`);
        for (const mark of marks) {
            const text = document.createTextNode(mark.textContent);
            mark.parentNode.replaceChild(text, mark);
        }
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
            // Check for selected text first
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (selectedText) {
                analyzeSelection(selection, selectedText);
            } else if (isActive) {
                deactivate();
            } else {
                activate();
            }
        }
    });

    async function analyzeSelection(selection, text) {
        if (text.length > MAX_CHARS) {
            showToast(`Text too long: ${text.length} chars (max ${MAX_CHARS})`, true);
            return;
        }

        showLoader();

        try {
            const sentenceScores = await detectAIContent(text);

            // Map sentences to positions within the selected text
            const mapped = mapSentencesToPositions(text, sentenceScores);

            // Get the range and highlight within it
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                    ? range.commonAncestorContainer.parentElement
                    : range.commonAncestorContainer;

                // We need to work with the selection range, not the whole container
                highlightRange(range, mapped, text);
            }

            hideLoader();
            showToast(`Analyzed ${mapped.length} sentences`);
            selection.removeAllRanges();
        } catch (err) {
            hideLoader();
            showToast(err.message, true);
        }
    }

    function highlightRange(range, mappedSentences, selectedText) {
        // Create a document fragment from the range contents
        const fragment = range.extractContents();
        const wrapper = document.createElement('span');
        wrapper.appendChild(fragment);

        // Now highlight within this wrapper using the same logic
        const ranges = mappedSentences.map(s => ({
            start: s.start,
            end: s.end,
            score: s.score
        }));

        let charOffset = 0;
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        let node;
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            const nodeText = textNode.nodeValue;
            const nodeStart = charOffset;
            const nodeEnd = charOffset + nodeText.length;

            const overlapping = ranges.filter(r => r.start < nodeEnd && r.end > nodeStart);

            if (overlapping.length === 0) {
                charOffset = nodeEnd;
                continue;
            }

            const frag = document.createDocumentFragment();
            let pos = 0;

            for (const r of overlapping) {
                const rangeStartInNode = Math.max(0, r.start - nodeStart);
                const rangeEndInNode = Math.min(nodeText.length, r.end - nodeStart);

                if (rangeStartInNode > pos) {
                    frag.appendChild(document.createTextNode(nodeText.slice(pos, rangeStartInNode)));
                }

                const mark = document.createElement('mark');
                mark.className = MARK_CLASS;
                mark.style.backgroundColor = getScoreColor(r.score);
                mark.style.color = 'inherit';
                mark.title = `Human: ${Math.round(r.score * 100)}%`;
                mark.textContent = nodeText.slice(rangeStartInNode, rangeEndInNode);
                frag.appendChild(mark);

                pos = rangeEndInNode;
            }

            if (pos < nodeText.length) {
                frag.appendChild(document.createTextNode(nodeText.slice(pos)));
            }

            textNode.parentNode.replaceChild(frag, textNode);
            charOffset = nodeEnd;
        }

        // Insert the highlighted content back
        range.insertNode(wrapper);

        // Unwrap the span, leaving just its contents
        while (wrapper.firstChild) {
            wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
    }
})();
