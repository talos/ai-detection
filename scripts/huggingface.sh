#!/bin/bash

#curl https://router.huggingface.co/hf-inference/models/openai-community/roberta-base-openai-detector \
#curl https://router.huggingface.co/hf-inference/models/openai-community/roberta-large-openai-detector \

curl https://router.huggingface.co/hf-inference/models/Hello-SimpleAI/chatgpt-detector-roberta \
    -X POST \
    -H "Authorization: Bearer $HF_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{
        "inputs": "From an operators standpoint, several strategic patterns emerge. Providers like Google have leaned heavily into tiered offerings (most notably with Gemini Flash and Pro) explicitly trading off speed, cost, and capability. This tiering enables market segmentation by price sensitivity and task criticality: lightweight tasks are routed to cheaper, faster models; premium models serve complex or latency-tolerant workloads. Optimizing for use cases and reliability is often as impactful as cutting price. A faster, purpose-built model may be preferred over a cheaper but unpredictable one, especially in production settings. This shifts focus from cost-per-token to cost-per-successful-outcome. The relatively flat demand elasticity suggests LLMs are not yet a commodity—many users are willing to pay a premium for quality, capabilities, or stability. Differentiation still holds value, particularly when task outcomes matter more than marginal token savings."
    }'
