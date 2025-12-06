# AI Content Detection Browser Extension

## Project Overview
A browser extension that detects AI-generated content using the Sapling AI Detection API.

## Current Implementation

### Core Components
- `src/core/ai_detection.js`: Core logic for API interaction and sentence mapping
- `src/firefox/content_script.js`: Handles div selection, API call, and sentence highlighting
- `src/firefox/background.js`: Manages browser toolbar activation
- `src/firefox/manifest.json`: Firefox extension configuration

### Functionality
1. Browser toolbar button activates selection mode
2. User clicks on a div to analyze
3. Text content sent to Sapling API
4. Sentences highlighted based on AI generation probability
   - Red-to-green color gradient based on AI score
5. Error handling with toast messages for API failures

### Architectural Decisions
- Hardcoded API key (temporary)
- 5000 character limit for text analysis
- Uses vanilla JavaScript for core logic
- Designed to be browser-agnostic where possible

### Pending Tasks
1. Add icon
2. Implement build/packaging process
3. Add more robust error handling
4. Implement API key management
5. Cross-browser compatibility

## Development Setup
1. Load as temporary extension in Firefox
2. Replace API key in `src/core/ai_detection.js`

## Context Dump
- Model used: Claude 3.5 Haiku
- Date: 2025-12-06
- Platform: Darwin
- Project started: Browser extension for AI content detection

## Next Steps
- Refine highlighting mechanism
- Add configuration options
- Implement more sophisticated sentence detection
- Create comprehensive testing suite