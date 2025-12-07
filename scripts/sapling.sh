curl -X POST https://api.sapling.ai/api/v1/aidetect \
     -H "Content-Type: application/json" \
     -d '{"key":"'"$SAPLING_API_KEY"'", "text":"Hi, how are you doing.", "session_id": "test session"}'


