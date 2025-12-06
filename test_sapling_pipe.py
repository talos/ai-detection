import pytest
import sys
import io
import os
from unittest.mock import patch, AsyncMock, MagicMock
import aiohttp
import json
import asyncio
from typing import Any, Dict, Union

# Import the functions to test
from sapling_pipe import send_to_sapling, main

@pytest.mark.asyncio
async def test_send_to_sapling_success() -> None:
    """Test successful Sapling API call"""
    with patch.dict(os.environ, {'SAPLING_API_KEY': 'test_key'}), \
         patch('aiohttp.ClientSession.post') as mock_post:
        # Create a mock response
        mock_response: AsyncMock = AsyncMock()
        mock_response.json.return_value = {"is_ai_generated": False}
        mock_response.raise_for_status = AsyncMock()
        mock_post.return_value.__aenter__.return_value = mock_response

        # Call the function
        result: str = await send_to_sapling("Test input")
        
        # Assertions
        assert json.loads(result) == {"is_ai_generated": False}
        mock_post.assert_called_once_with(
            'https://api.sapling.ai/api/v1/aidetect', 
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test_key'
            },
            json={
                'text': "Test input", 
                'session_id': "cli_pipe_session"
            }
        )

def test_send_to_sapling_no_api_key() -> None:
    """Test API call without API key"""
    with patch.dict(os.environ, {}, clear=True):
        result: str = asyncio.run(send_to_sapling("Test input"))
        assert "SAPLING_API_KEY environment variable not set" in result

@pytest.mark.asyncio
async def test_send_to_sapling_api_failure() -> None:
    """Test API call failure"""
    with patch.dict(os.environ, {'SAPLING_API_KEY': 'test_key'}), \
         patch('aiohttp.ClientSession.post') as mock_post:
        # Simulate a client error
        mock_post.side_effect = aiohttp.ClientError("Network error")

        # Call the function
        result: str = await send_to_sapling("Test input")
        
        # Assertions
        assert "API request failed: Network error" in result

def test_main_stdin_input(monkeypatch: Any, capsys: Any) -> None:
    """Test main function with stdin input"""
    # Prepare mock stdin
    test_input: str = "Sample text for testing"
    
    with patch.dict(os.environ, {'SAPLING_API_KEY': 'test_key'}), \
         patch('sapling_pipe.send_to_sapling', return_value='{"is_ai_generated": true}') as mock_api:
        
        # Simulate stdin
        monkeypatch.setattr('sys.stdin', io.StringIO(test_input))
        
        # Call main
        asyncio.run(main())
        
        # Assertions
        mock_api.assert_called_once_with(test_input)
        
        # Check stdout
        captured: Any = capsys.readouterr()
        assert captured.out.strip() == '{"is_ai_generated": true}'

def test_main_empty_input(monkeypatch: Any, capsys: Any) -> None:
    """Test main function with empty input"""
    # Simulate empty stdin
    monkeypatch.setattr('sys.stdin', io.StringIO(""))
    
    with pytest.raises(SystemExit) as excinfo:
        asyncio.run(main())
    
    # Check that it exited with status code 1
    assert excinfo.value.code == 1
    
    # Check stderr
    captured: Any = capsys.readouterr()
    assert "No input received" in captured.err