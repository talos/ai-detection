import sys
import os
import json
import logging
from datetime import datetime
import asyncio
from typing import Any, Dict, Union

import aiohttp

# Construct logs directory path relative to the project root (parent of scripts/)
SCRIPT_DIR: str = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR: str = os.path.dirname(SCRIPT_DIR)
LOGS_DIR: str = os.path.join(PROJECT_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)

# Configure logging
log_filename: str = os.path.join(LOGS_DIR, f'zerogpt_pipe_log_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
logging.basicConfig(filename=log_filename, level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

async def send_to_zerogpt(text: str) -> str:
    """
    Send text to ZeroGPT AI Detection API asynchronously

    Args:
        text (str): Input text to send to ZeroGPT API

    Returns:
        str: API response or error message
    """
    # Fetch API key from environment variable
    api_key: Union[str, None] = os.environ.get('ZEROGPT_API_KEY')
    if not api_key:
        error_msg: str = "ZEROGPT_API_KEY environment variable not set"
        logging.error(error_msg)
        return error_msg

    try:
        # Construct payload
        payload: Dict[str, Any] = {
            "input_text": text
        }

        # Make async API call
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    'https://api.zerogpt.com/api/detect/detectText',
                    headers={
                        'Content-Type': 'application/json',
                        'ApiKey': api_key
                    },
                    json=payload
                ) as response:
                    # Raise exception for bad status
                    response.raise_for_status()

                    # Parse and log response
                    result: Any = await response.json()
                    logging.info(f"ZeroGPT API response: {json.dumps(result, indent=2)}")
                    return json.dumps(result, indent=2)
            except aiohttp.ClientResponseError as e:
                error_msg: str = f"API response error: {e}"
                logging.error(error_msg)
                return error_msg
            except aiohttp.ClientError as e:
                error_msg: str = f"API request failed: {e}"
                logging.error(error_msg)
                return error_msg

    except Exception as e:
        error_msg: str = f"Unexpected error: {e}"
        logging.error(error_msg)
        return error_msg

async def main() -> None:
    # Read from stdin
    input_text: str = sys.stdin.read().strip()

    if not input_text:
        logging.warning("No input received")
        print("No input received", file=sys.stderr)
        sys.exit(1)

    # Log input
    logging.info(f"Received input: {input_text}")

    # Send to ZeroGPT API
    result: str = await send_to_zerogpt(input_text)

    # Print result
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
