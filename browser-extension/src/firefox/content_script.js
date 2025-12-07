// AI Content Detection - Content Script
(function() {
    'use strict';

    const MAX_CHARS = 20000;
    let isActive = false;
    let hoveredElement = null;
    let activeHighlights = []; // Track highlighted elements for cleanup

    // ============ API Functions ============
    async function getActiveProvider() {
        return await browser.runtime.sendMessage({ action: 'getActiveProvider' });
    }

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

        return {
            sentences: response.data,
            providerName: response.providerName
        };
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

    function showLoader(providerName) {
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
                Analyzing with ${providerName || 'AI detector'}...
            </div>
        `;

        if (!document.getElementById('ai-detect-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-detect-styles';
            style.textContent = `@keyframes ai-detect-spin { to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }

        loader.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 2147483647;`;
        document.body.appendChild(loader);
    }

    function hideLoader() {
        const loader = document.getElementById('ai-detect-loader');
        if (loader) loader.remove();
    }

    // ============ Highlighting Functions ============
    function getHighlightColor(generatedProb) {
        // generatedProb is probability of AI-generated (0-1)
        // Higher = more likely AI, should be more red
        // Lower = more likely human, should be more green
        if (generatedProb > 0.7) {
            return 'rgba(220, 53, 69, 0.3)'; // Red - likely AI
        } else if (generatedProb > 0.4) {
            return 'rgba(255, 193, 7, 0.3)'; // Yellow - mixed
        } else {
            return 'rgba(40, 167, 69, 0.3)'; // Green - likely human
        }
    }

    function clearHighlights() {
        for (const mark of activeHighlights) {
            // Replace mark with its text content
            const textNode = document.createTextNode(mark.textContent);
            mark.parentNode.replaceChild(textNode, mark);
        }
        activeHighlights = [];
        // Normalize text nodes that were split
        document.body.normalize();
    }

    function highlightResults(result) {
        // Use locateSentences from highlight.js to find text in DOM
        const locatedSentences = locateSentences(document, result.sentences.map(s => ({
            sentence: s.sentence,
            generated_prob: 1 - s.score // Convert human score to AI probability
        })));

        // Collect ALL word locations with their colors/tooltips
        const allLocations = [];
        for (const sentenceResult of locatedSentences) {
            const { locations, generated_prob } = sentenceResult;
            if (!locations || locations.length === 0) continue;

            const color = getHighlightColor(generated_prob);
            const tooltip = `AI probability: ${(generated_prob * 100).toFixed(1)}%`;

            for (const loc of locations) {
                allLocations.push({
                    ...loc,
                    color,
                    tooltip
                });
            }
        }

        // Group by text node
        const nodeGroups = new Map();
        for (const loc of allLocations) {
            if (!nodeGroups.has(loc.textNode)) {
                nodeGroups.set(loc.textNode, []);
            }
            nodeGroups.get(loc.textNode).push(loc);
        }

        // Process each text node by rebuilding it with highlights
        // This avoids issues with surroundContents invalidating references
        for (const [textNode, locs] of nodeGroups) {
            if (!textNode.parentNode) continue;

            // Sort by startOffset ascending for reconstruction
            locs.sort((a, b) => a.startOffset - b.startOffset);

            // Remove overlapping/duplicate ranges
            const cleanedLocs = [];
            let lastEnd = -1;
            for (const loc of locs) {
                if (loc.startOffset >= lastEnd) {
                    cleanedLocs.push(loc);
                    lastEnd = loc.endOffset;
                }
            }

            // Build a document fragment with alternating text and highlights
            const fragment = document.createDocumentFragment();
            const fullText = textNode.textContent;
            let currentPos = 0;

            for (const loc of cleanedLocs) {
                // Add any text before this highlight
                if (loc.startOffset > currentPos) {
                    fragment.appendChild(document.createTextNode(fullText.substring(currentPos, loc.startOffset)));
                }

                // Add the highlighted word
                const mark = document.createElement('mark');
                mark.className = 'ai-detect-highlight';
                mark.style.cssText = `
                    background-color: ${loc.color};
                    padding: 0 2px;
                    border-radius: 2px;
                    cursor: help;
                `;
                mark.title = loc.tooltip;
                mark.textContent = fullText.substring(loc.startOffset, loc.endOffset);
                fragment.appendChild(mark);
                activeHighlights.push(mark);

                currentPos = loc.endOffset;
            }

            // Add any remaining text after the last highlight
            if (currentPos < fullText.length) {
                fragment.appendChild(document.createTextNode(fullText.substring(currentPos)));
            }

            // Replace the original text node with the fragment
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    // ============ Modal Functions ============
    function showModal(result, text) {
        // Remove existing modal
        const existing = document.getElementById('ai-detect-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ai-detect-modal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            max-width: 800px;
            max-height: 80vh;
            width: 90%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <div>
                <h2 style="margin: 0; font-size: 18px; color: #333;">AI Detection Results</h2>
                <p style="margin: 4px 0 0; font-size: 13px; color: #666;">Provider: ${result.providerName} | ${result.sentences.length} sentences analyzed</p>
            </div>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: #666;
            padding: 0 8px;
            line-height: 1;
        `;
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        `;

        // Summary stats
        const avgScore = result.sentences.reduce((sum, s) => sum + s.score, 0) / result.sentences.length;
        const summary = document.createElement('div');
        summary.style.cssText = `
            background: #f5f5f5;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
        `;
        summary.innerHTML = `
            <div style="display: flex; gap: 24px; font-size: 14px;">
                <div><strong>Average Human Score:</strong> ${(avgScore * 100).toFixed(1)}%</div>
                <div><strong>Characters:</strong> ${text.length}</div>
            </div>
        `;
        content.appendChild(summary);

        // Sentences list
        const list = document.createElement('div');
        list.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

        for (const s of result.sentences) {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px;
                border-radius: 6px;
                border: 1px solid #e0e0e0;
                display: flex;
                gap: 12px;
                align-items: flex-start;
            `;

            const scoreColor = s.score > 0.7 ? '#28a745' : s.score > 0.4 ? '#ffc107' : '#dc3545';
            const scoreLabel = s.score > 0.7 ? 'Human' : s.score > 0.4 ? 'Mixed' : 'AI';

            item.innerHTML = `
                <div style="
                    min-width: 60px;
                    padding: 4px 8px;
                    background: ${scoreColor};
                    color: white;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    text-align: center;
                ">${(s.score * 100).toFixed(0)}%<br><span style="font-weight: normal; font-size: 10px;">${scoreLabel}</span></div>
                <div style="flex: 1; font-size: 14px; color: #333; line-height: 1.5;">${escapeHtml(s.sentence)}</div>
            `;
            list.appendChild(item);
        }
        content.appendChild(list);

        // Footer with raw JSON toggle
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 12px;
        `;

        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy JSON';
        copyBtn.style.cssText = `
            padding: 8px 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(result, null, 2));
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy JSON', 2000);
        };

        const viewRawBtn = document.createElement('button');
        viewRawBtn.textContent = 'View Raw JSON';
        viewRawBtn.style.cssText = `
            padding: 8px 16px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;

        let showingRaw = false;
        viewRawBtn.onclick = () => {
            showingRaw = !showingRaw;
            if (showingRaw) {
                list.innerHTML = `<pre style="
                    background: #1e1e1e;
                    color: #d4d4d4;
                    padding: 16px;
                    border-radius: 8px;
                    overflow-x: auto;
                    font-size: 13px;
                    margin: 0;
                ">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
                viewRawBtn.textContent = 'View Sentences';
            } else {
                // Rebuild sentences view
                list.innerHTML = '';
                for (const s of result.sentences) {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        padding: 12px;
                        border-radius: 6px;
                        border: 1px solid #e0e0e0;
                        display: flex;
                        gap: 12px;
                        align-items: flex-start;
                    `;
                    const scoreColor = s.score > 0.7 ? '#28a745' : s.score > 0.4 ? '#ffc107' : '#dc3545';
                    const scoreLabel = s.score > 0.7 ? 'Human' : s.score > 0.4 ? 'Mixed' : 'AI';
                    item.innerHTML = `
                        <div style="
                            min-width: 60px;
                            padding: 4px 8px;
                            background: ${scoreColor};
                            color: white;
                            border-radius: 4px;
                            font-size: 12px;
                            font-weight: 600;
                            text-align: center;
                        ">${(s.score * 100).toFixed(0)}%<br><span style="font-weight: normal; font-size: 10px;">${scoreLabel}</span></div>
                        <div style="flex: 1; font-size: 14px; color: #333; line-height: 1.5;">${escapeHtml(s.sentence)}</div>
                    `;
                    list.appendChild(item);
                }
                viewRawBtn.textContent = 'View Raw JSON';
            }
        };

        const highlightBtn = document.createElement('button');
        highlightBtn.textContent = 'Highlight in Page';
        highlightBtn.style.cssText = `
            padding: 8px 16px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;
        highlightBtn.onclick = () => {
            clearHighlights();
            highlightResults(result);
            overlay.remove();
            showToast('Sentences highlighted in page. Click extension icon to clear.');
        };

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear Highlights';
        clearBtn.style.cssText = `
            padding: 8px 16px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;
        clearBtn.onclick = () => {
            clearHighlights();
            showToast('Highlights cleared');
        };

        footer.appendChild(highlightBtn);
        footer.appendChild(clearBtn);
        footer.appendChild(copyBtn);
        footer.appendChild(viewRawBtn);

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        // Close on Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(overlay);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============ Capture Storage ============
    async function saveCapture(result, text) {
        const capture = {
            id: Date.now().toString(),
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
            result: result,
            text: text
        };

        // Get existing captures
        const storage = await browser.storage.local.get(['captures']);
        const captures = storage.captures || [];

        // Add new capture at the beginning, limit to 50 most recent
        captures.unshift(capture);
        if (captures.length > 50) {
            captures.pop();
        }

        await browser.storage.local.set({ captures });
        return capture;
    }

    // ============ Analysis Function ============
    async function analyzeText(text) {
        const trimmedText = text.trim();

        if (!trimmedText) {
            showToast('No text content to analyze', true);
            return;
        }

        if (trimmedText.length > MAX_CHARS) {
            showToast(`Text too long: ${trimmedText.length} chars (max ${MAX_CHARS})`, true);
            return;
        }

        const providerInfo = await getActiveProvider();
        showLoader(providerInfo.providerName);

        try {
            const result = await detectAIContent(trimmedText);
            hideLoader();
            await saveCapture(result, trimmedText);
            showModal(result, trimmedText);
        } catch (err) {
            hideLoader();
            showToast(err.message, true);
        }
    }

    // ============ Event Handlers ============
    function highlightElement(element) {
        element.style.outline = '3px solid #007bff';
        element.style.outlineOffset = '2px';
    }

    function unhighlightElement(element) {
        element.style.outline = '';
        element.style.outlineOffset = '';
    }

    function onMouseOver(e) {
        if (!isActive) return;
        const target = e.target;
        if (target === hoveredElement) return;

        if (hoveredElement) unhighlightElement(hoveredElement);
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

        deactivate();

        const text = e.target.textContent;
        await analyzeText(text);
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
    browser.runtime.onMessage.addListener(async (message) => {
        if (message.action === 'toggle') {
            const selection = window.getSelection();

            if (selection.rangeCount > 0 && selection.toString().trim()) {
                // User has text selected - analyze the selection
                const text = selection.toString();
                await analyzeText(text);
                selection.removeAllRanges();
            } else if (activeHighlights.length > 0) {
                // Clear existing highlights first
                clearHighlights();
                showToast('Highlights cleared');
            } else if (isActive) {
                deactivate();
            } else {
                activate();
            }
        } else if (message.action === 'clearHighlights') {
            clearHighlights();
        } else if (message.action === 'openCapture') {
            // Reopen a saved capture
            const { result, text } = message;
            showModal(result, text);
        }
    });
})();
