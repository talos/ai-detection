browser.browserAction.onClicked.addListener((tab) => {
    browser.tabs.insertCSS({code: 'body { cursor: crosshair !important; }'});
    
    // Listen for mouse click on the page
    browser.tabs.executeScript(tab.id, {
        code: `
            document.addEventListener('click', function clickHandler(e) {
                e.preventDefault();
                document.body.style.cursor = 'default';
                document.removeEventListener('click', clickHandler);
                
                browser.runtime.sendMessage({
                    action: 'detectAI', 
                    x: e.clientX, 
                    y: e.clientY
                });
            }, {once: true});
        `
    });
});