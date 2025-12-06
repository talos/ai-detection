// AI Content Detection - Content Script
(function() {
    'use strict';

    const MAX_CHARS = 20000;
    let isActive = false;
    let hoveredElement = null;

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
            } else if (isActive) {
                deactivate();
            } else {
                activate();
            }
        }
    });
})();
