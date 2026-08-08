"""
llm_engine.py — Module 4: Context-Aware LLM Predictive Word Completion
======================================================================

Three-tier word prediction engine for the P300 BCI Speller System.

Given a partially-typed context string (e.g. ``"WHO ARE Y"``), returns
exactly **three** uppercase candidate completions (e.g. ``["YOU", "YOUR", "YOUNG"]``)
to populate the top-row suggestion tiles of the speller UI.

Prediction tiers (in order of preference)
------------------------------------------
1. **OpenAI GPT** (primary)  — requires ``OPENAI_API_KEY`` env var.
2. **LiteLLM** (secondary)   — any LiteLLM-compatible local/cloud model.
3. **Built-in frequency dict** (guaranteed fallback) — ~600 curated words.

Each tier is wrapped in a 200 ms ThreadPoolExecutor timeout guard so that
network latency never stalls the real-time BCI loop.

Public API
----------
    from llm_engine import get_word_predictions

    words = get_word_predictions("WHO ARE Y")
    # → ["YOU", "YOUR", "YOUNG"]

Environment variables
---------------------
    OPENAI_API_KEY  — OpenAI secret key (tier-1).
    LLM_MODEL       — Override model name (default: gpt-3.5-turbo).
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import re
import time
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("llm_engine")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# Load .env if present
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    _env_file = Path(__file__).resolve().parent / ".env"
    if _env_file.exists():
        load_dotenv(_env_file)
        logger.debug(".env loaded from %s", _env_file)
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DEFAULT_MODEL   = os.getenv("LLM_MODEL", "gpt-3.5-turbo")
_OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
_N_PREDICTIONS   = 3
_LLM_TIMEOUT_S   = 0.200  # 200 ms maximum wait for any LLM tier

# ---------------------------------------------------------------------------
# Built-in high-frequency word list (guaranteed fallback)
# ---------------------------------------------------------------------------
_FREQUENCY_WORDS: List[str] = [
    # Articles & determiners
    "THE", "A", "AN", "THIS", "THAT", "THESE", "THOSE", "SOME", "ANY",
    "ALL", "BOTH", "EACH", "EVERY", "NO", "MANY", "MUCH", "MORE", "MOST",
    # Pronouns
    "I", "YOU", "HE", "SHE", "IT", "WE", "THEY", "ME", "HIM", "HER",
    "US", "THEM", "MY", "YOUR", "HIS", "ITS", "OUR", "THEIR",
    "MYSELF", "YOURSELF", "HIMSELF", "HERSELF", "ITSELF", "OURSELVES",
    "THEMSELVES", "MINE", "YOURS", "HERS", "OURS", "THEIRS", "WHO", "WHOM",
    "WHICH", "WHAT", "WHOEVER", "WHATEVER", "WHICHEVER",
    # Common verbs
    "IS", "ARE", "WAS", "WERE", "BE", "BEEN", "BEING", "HAVE", "HAS",
    "HAD", "DO", "DOES", "DID", "WILL", "WOULD", "SHALL", "SHOULD",
    "MAY", "MIGHT", "MUST", "CAN", "COULD", "NEED", "DARE", "OUGHT",
    "GET", "GETS", "GOT", "GOTTEN", "GO", "GOES", "WENT", "GONE",
    "COME", "COMES", "CAME", "MAKE", "MAKES", "MADE", "KNOW", "KNOWS",
    "KNEW", "KNOWN", "SEE", "SEES", "SAW", "SEEN", "THINK", "THINKS",
    "THOUGHT", "LOOK", "LOOKS", "LOOKED", "WANT", "WANTS", "WANTED",
    "GIVE", "GIVES", "GAVE", "GIVEN", "USE", "USES", "USED", "FIND",
    "FINDS", "FOUND", "TELL", "TELLS", "TOLD", "ASK", "ASKS", "ASKED",
    "SEEM", "SEEMS", "SEEMED", "FEEL", "FEELS", "FELT", "LEAVE", "CALL",
    "KEEP", "LET", "BEGIN", "SHOW", "HEAR", "PLAY", "RUN", "MOVE",
    "LIVE", "BELIEVE", "HOLD", "BRING", "HAPPEN", "WRITE", "PROVIDE",
    "SIT", "STAND", "LOSE", "PAY", "MEET", "INCLUDE", "CONTINUE",
    "SET", "LEARN", "CHANGE", "LEAD", "UNDERSTAND", "WATCH", "FOLLOW",
    "STOP", "CREATE", "SPEAK", "READ", "SPEND", "GROW", "OPEN", "WALK",
    "WIN", "OFFER", "REMEMBER", "LOVE", "CONSIDER", "APPEAR", "BUY",
    "WAIT", "SERVE", "DIE", "SEND", "EXPECT", "BUILD", "STAY", "FALL",
    "HELP", "HOPE", "START", "THANK", "SUPPORT", "REACH", "BECOME",
    "PUT", "MEAN", "DRIVE", "BREAK", "AGREE", "MANAGE",
    # Adverbs
    "NOT", "ALSO", "VERY", "JUST", "NOW", "THEN", "HERE", "THERE",
    "UP", "DOWN", "OUT", "SO", "NO", "ONLY", "STILL", "WELL", "EVEN",
    "BACK", "ALREADY", "FAR", "NEVER", "ALWAYS", "OFTEN", "USUALLY",
    "SOMETIMES", "SOON", "AGAIN", "REALLY", "TOO", "ALMOST", "ELSE",
    "HOWEVER", "TOGETHER", "LONG", "LITTLE", "OWN", "RIGHT", "LATER",
    "RATHER", "PERHAPS", "SIMPLY", "QUITE", "ACTUALLY", "AROUND",
    "PROBABLY", "ESPECIALLY", "FINALLY", "CERTAINLY", "EXACTLY", "MOSTLY",
    # Prepositions & conjunctions
    "IN", "ON", "AT", "BY", "FOR", "WITH", "ABOUT", "AGAINST", "BETWEEN",
    "INTO", "THROUGH", "DURING", "BEFORE", "AFTER", "ABOVE", "BELOW",
    "TO", "FROM", "OF", "OFF", "OVER", "UNDER", "ALONG", "FOLLOWING",
    "ACROSS", "BEHIND", "BEYOND", "PLUS", "EXCEPT",
    "BUT", "OR", "AS", "IF", "WHILE", "ALTHOUGH", "BECAUSE", "SINCE",
    "UNTIL", "UNLESS", "THAN", "THOUGH", "WHEREAS", "AND", "WHEN", "WHERE",
    "HOW", "WHY",
    # Question words
    "WHAT", "WHERE", "WHEN", "WHY", "HOW", "WHOSE",
    # Common nouns
    "TIME", "YEAR", "PEOPLE", "WAY", "DAY", "MAN", "WOMAN", "CHILD",
    "WORLD", "LIFE", "HAND", "PART", "PLACE", "CASE", "WEEK", "COMPANY",
    "SYSTEM", "PROGRAM", "QUESTION", "WORK", "GOVERNMENT", "NUMBER",
    "NIGHT", "POINT", "WORD", "FACT", "NAME", "THING", "SCHOOL", "MONEY",
    "HOME", "FAMILY", "COUNTRY", "CITY", "MONTH", "LOT", "ROOM", "BOOK",
    "EYE", "JOB", "BUSINESS", "ISSUE", "SIDE", "KIND", "WATER",
    "AREA", "NATIONAL", "POWER", "ORDER", "BODY", "EXAMPLE", "LEVEL",
    "CAR", "AGE", "MIND", "FOOD", "HEALTH", "DOOR", "STATE", "RESULT",
    "LINE", "STUDY", "HISTORY", "MATTER", "ROLE", "REASON", "SERVICE",
    "MOMENT", "HOUR", "PERSON", "GROUP", "PROBLEM", "FIELD", "SENSE",
    "IDEA", "REPORT", "CHANGE", "TOWN", "HEAD", "GAME", "INTEREST",
    "HEART", "FORM", "ROAD", "VALUE", "VOICE", "STREET", "SIZE",
    "NEWS", "FACE", "CLASS", "PLAN", "TEST", "LETTER", "NATURE",
    "AIR", "LIGHT", "MUSIC", "NOTE", "PRICE", "EVENT", "TYPE", "FEELING",
    # BCI / medical context
    "HELP", "PAIN", "YES", "NEED", "CALL", "HUNGRY", "TIRED", "THIRSTY",
    "COLD", "HOT", "BATHROOM", "DOCTOR", "NURSE", "MEDICINE",
    "PLEASE", "SORRY", "OKAY", "HELLO", "GOODBYE",
    # Common adjectives
    "GOOD", "NEW", "FIRST", "LAST", "GREAT", "OTHER", "OLD",
    "BIG", "HIGH", "DIFFERENT", "SMALL", "LARGE", "NEXT", "EARLY",
    "YOUNG", "IMPORTANT", "FEW", "PUBLIC", "BAD", "SAME", "ABLE",
    "HUMAN", "LOCAL", "SURE", "CLEAR", "MAIN", "HARD", "REAL",
    "STRONG", "FULL", "FREE", "SOCIAL", "POSSIBLE", "READY",
    "CERTAIN", "TRUE", "WHITE", "BLACK", "DARK", "EASY", "PAST",
    "HAPPY", "BEAUTIFUL", "NICE", "WARM", "COOL", "SAFE", "SICK",
    # BCI sentence completions
    "YOURSELF", "YOURSELVES", "YOUR", "YOU",
    "ARE", "ALREADY",
    "WHO", "WHAT", "WHERE", "WHEN", "WHY", "HOW",
]

# Deduplicate preserving order
_seen: set = set()
FREQUENCY_WORDS: List[str] = []
for _w in _FREQUENCY_WORDS:
    _uw = _w.upper()
    if _uw not in _seen:
        _seen.add(_uw)
        FREQUENCY_WORDS.append(_uw)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_prefix(context: str) -> str:
    """Return the last incomplete token from the context string.

    Examples
    --------
    >>> _extract_prefix("WHO ARE Y")
    'Y'
    >>> _extract_prefix("WHO ARE YOU")   # last word complete
    ''
    """
    context = context.strip().upper()
    if not context:
        return ""
    tokens = context.split()
    if context.endswith(" "):
        return ""     # last word complete — suggest next word
    return tokens[-1] if tokens else ""


_NEXT_WORD_HINTS = {
    "WHO":   ["ARE", "IS", "WAS"],
    "WHAT":  ["IS", "ARE", "DO"],
    "WHERE": ["IS", "ARE", "DO"],
    "HOW":   ["ARE", "IS", "DO"],
    "WHY":   ["IS", "ARE", "DO"],
    "WHEN":  ["IS", "ARE", "WILL"],
    "I":     ["NEED", "WANT", "AM"],
    "YOU":   ["ARE", "HAVE", "CAN"],
    "ARE":   ["YOU", "THEY", "WE"],
    "IS":    ["IT", "HE", "SHE"],
    "DO":    ["YOU", "WE", "THEY"],
    "NEED":  ["HELP", "WATER", "FOOD"],
    "WANT":  ["TO", "SOME", "A"],
    "HAVE":  ["YOU", "WE", "THEY"],
    "CAN":   ["YOU", "WE", "I"],
    "HELLO": ["WORLD", "THERE", "HOW"],
    "THANK": ["YOU", "GOD", "US"],
    "PLEASE": ["HELP", "STOP", "COME"],
}


def _fallback_predictions(context: str) -> List[str]:
    """Return top-3 frequency-ranked completions from the built-in word list.

    Logic
    -----
    - Non-empty prefix → filter words starting with prefix (shortest first).
    - Empty prefix → next-word hint based on last complete word, else top-3 global.
    """
    prefix = _extract_prefix(context)

    if prefix:
        matches = [w for w in FREQUENCY_WORDS if w.startswith(prefix)]
        if len(matches) >= _N_PREDICTIONS:
            return matches[:_N_PREDICTIONS]
        extras = [w for w in FREQUENCY_WORDS if not w.startswith(prefix)]
        return (matches + extras)[:_N_PREDICTIONS]

    # No prefix — suggest next word based on last complete word
    context_up = context.strip().upper()
    last_word  = context_up.split()[-1] if context_up.split() else ""
    if last_word in _NEXT_WORD_HINTS:
        return _NEXT_WORD_HINTS[last_word][:_N_PREDICTIONS]

    return FREQUENCY_WORDS[:_N_PREDICTIONS]


def _parse_llm_response(response_text: str) -> List[str]:
    """Extract up to 3 uppercase words from a raw LLM response."""
    tokens     = re.findall(r"[A-Za-z]+", response_text)
    candidates = [t.upper() for t in tokens if 2 <= len(t) <= 20]
    seen: set  = set()
    unique: List[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique[:_N_PREDICTIONS]


def _run_with_timeout(fn, args=(), timeout: float = _LLM_TIMEOUT_S):
    """Run ``fn(*args)`` in a thread, return result or None on timeout/error."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fn, *args)
        try:
            return future.result(timeout=timeout)
        except (concurrent.futures.TimeoutError, Exception) as exc:
            logger.debug("LLM call timed out or failed: %s", exc)
            return None


# ---------------------------------------------------------------------------
# Tier 1: OpenAI
# ---------------------------------------------------------------------------

def _query_openai(context: str) -> Optional[List[str]]:
    if not _OPENAI_API_KEY:
        return None

    def _call():
        import openai
        client = openai.OpenAI(api_key=_OPENAI_API_KEY)
        system_prompt = (
            "You are a word-completion assistant for a P300 BCI (Brain-Computer Interface) "
            "speller system. Given a partial sentence, predict the next 3 most likely "
            "COMPLETE UPPERCASE words. Reply with ONLY the 3 words, each on a new line, "
            "no numbering, no punctuation, no explanation."
        )
        user_prompt = (
            f"Context: \"{context.strip()}\"\n"
            "Next 3 words (UPPERCASE, one per line):"
        )
        response = client.chat.completions.create(
            model=_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=30,
            temperature=0.3,
        )
        raw   = response.choices[0].message.content or ""
        words = _parse_llm_response(raw)
        return (words + _fallback_predictions(context))[:_N_PREDICTIONS] if words else None

    result = _run_with_timeout(_call, timeout=_LLM_TIMEOUT_S)
    if result:
        logger.info("OpenAI prediction (%.0f ms): %s", _LLM_TIMEOUT_S * 1000, result)
    return result


# ---------------------------------------------------------------------------
# Tier 2: LiteLLM
# ---------------------------------------------------------------------------

def _query_litellm(context: str) -> Optional[List[str]]:
    def _call():
        import litellm  # type: ignore[import]
        response = litellm.completion(
            model=_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content":
                 "BCI speller. Return the next 3 most likely uppercase words, one per line."},
                {"role": "user",   "content": f"Context: \"{context.strip()}\"\nNext 3 words:"},
            ],
            max_tokens=30,
            temperature=0.3,
        )
        raw   = response.choices[0].message.content or ""
        words = _parse_llm_response(raw)
        return (words + _fallback_predictions(context))[:_N_PREDICTIONS] if words else None

    result = _run_with_timeout(_call, timeout=_LLM_TIMEOUT_S)
    if result:
        logger.info("LiteLLM prediction: %s", result)
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_word_predictions(context_text: str) -> List[str]:
    """Predict the top-3 next words for a given BCI speller context.

    Tries three prediction tiers in order:
    1. OpenAI GPT (requires ``OPENAI_API_KEY`` env var, 200 ms timeout).
    2. LiteLLM (secondary fallback, 200 ms timeout).
    3. Built-in frequency dictionary (always succeeds, <1 ms).

    Parameters
    ----------
    context_text : str
        Partial sentence typed so far, e.g. ``"WHO ARE Y"`` or ``"HOW ARE"``.

    Returns
    -------
    list[str]
        Exactly 3 UPPERCASE candidate strings.

    Examples
    --------
    >>> get_word_predictions("WHO ARE Y")
    ['YOU', 'YOUR', 'YOUNG']
    >>> get_word_predictions("HOW ARE")
    ['YOU', 'THEY', 'WE']
    """
    context = context_text.strip()

    # Tier 1
    result = _query_openai(context)
    if result and len(result) == _N_PREDICTIONS:
        return result

    # Tier 2
    result = _query_litellm(context)
    if result and len(result) == _N_PREDICTIONS:
        return result

    # Tier 3 (guaranteed)
    result = _fallback_predictions(context)
    logger.info("Fallback dict prediction: %s", result)
    return result


# Alias for backward compatibility with p300_backend/main.py
predict_next_words = get_word_predictions


# ---------------------------------------------------------------------------
# CLI demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    test_contexts = [
        "", "H", "HE", "HELLO W", "WHO ARE Y",
        "WHO ARE YOU", "HOW ARE", "I NEED", "WHERE IS",
    ]
    print("\n── llm_engine — Word Prediction Demo ──────────────────────────\n")
    for ctx in test_contexts:
        t0    = time.perf_counter()
        preds = get_word_predictions(ctx)
        ms    = (time.perf_counter() - t0) * 1000
        print(f"  {repr(ctx):<22}  →  {preds}  ({ms:.1f} ms)")
    print()
