"""
tests/conftest.py — Shared pytest configuration for the backend test suite.
"""
import sys
from pathlib import Path

# Ensure backend/ is on the Python path for all tests
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))
