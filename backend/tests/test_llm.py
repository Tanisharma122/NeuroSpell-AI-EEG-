"""
tests/test_llm.py â€” Phase 4 Verification: LLM Predictive Completion Engine
===========================================================================

Verifies that llm_engine.py correctly:
  - Returns exactly 3 uppercase strings for all test inputs
  - Responds within < 150 ms (guaranteed by fallback dictionary path)
  - Handles empty string, single-char prefix, partial word, full-word contexts
  - Correctly predicts "YOU", "YOUR", "YOUNG" for prefix "Y" after "WHO ARE"

Run from the backend/ directory:
    pytest tests/test_llm.py -v
or standalone:
    python tests/test_llm.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

# (context_string, expected_prefix_or_none, description)
TEST_CONTEXTS = [
    ("",          None,  "empty string"),
    ("H",         "H",   "single char H"),
    ("HE",        "HE",  "prefix HE"),
    ("HELLO W",   "W",   "partial word W after HELLO"),
    ("WHO ARE Y", "Y",   "partial word Y â†’ YOU/YOUR/YOUNG"),
    ("WHO ARE",   None,  "complete word ARE â†’ next-word suggestions"),
    ("I NEED",    None,  "complete word NEED â†’ next-word suggestions"),
    ("WHAT IS",   None,  "complete word IS â†’ next-word suggestions"),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def predictor():
    """Import get_word_predictions once for the module."""
    from llm_engine import get_word_predictions
    return get_word_predictions


# ---------------------------------------------------------------------------
# Test 1: Output format correctness
# ---------------------------------------------------------------------------

class TestOutputFormat:
    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_returns_exactly_3_words(self, predictor, context, prefix, desc):
        """get_word_predictions() must return exactly 3 items."""
        result = predictor(context)
        assert len(result) == 3, (
            f"Expected 3 predictions for '{context}' ({desc}), got {len(result)}: {result}"
        )

    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_all_words_uppercase(self, predictor, context, prefix, desc):
        """All returned words must be uppercase strings."""
        result = predictor(context)
        for word in result:
            assert isinstance(word, str), f"Prediction '{word}' is not a string"
            assert word == word.upper(), f"Prediction '{word}' is not uppercase"

    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_all_words_alphabetic(self, predictor, context, prefix, desc):
        """All returned words must be purely alphabetic (A-Z)."""
        result = predictor(context)
        for word in result:
            assert word.isalpha(), (
                f"Prediction '{word}' contains non-alphabetic characters "
                f"(context='{context}')"
            )

    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_no_duplicates(self, predictor, context, prefix, desc):
        """Returned words must be distinct (no duplicates)."""
        result = predictor(context)
        assert len(result) == len(set(result)), (
            f"Duplicate predictions for '{context}': {result}"
        )

    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_no_empty_strings(self, predictor, context, prefix, desc):
        """Returned words must not be empty strings.

        Note: single-letter words ('A', 'I', 'O') are valid English words
        and may appear as high-frequency predictions.
        """
        result = predictor(context)
        for word in result:
            assert len(word) >= 1, (
                f"Word '{word}' is an empty string, context='{context}'"
            )


# ---------------------------------------------------------------------------
# Test 2: Response latency
# ---------------------------------------------------------------------------

class TestResponseLatency:
    LATENCY_LIMIT_MS = 150.0

    @pytest.mark.parametrize("context,prefix,desc", TEST_CONTEXTS)
    def test_responds_within_150ms(self, predictor, context, prefix, desc):
        """Each prediction must complete in < 150 ms.

        The fallback frequency-dict path runs in << 1 ms.
        LLM tiers have a 200 ms timeout, but the test verifies the overall
        call (including timeout handling) finishes quickly via the fallback.
        """
        t0     = time.perf_counter()
        result = predictor(context)
        ms     = (time.perf_counter() - t0) * 1000.0

        # The fallback dict path should always be < 5 ms.
        # We allow 150 ms for the full pipeline (including any fast LLM hits).
        assert ms < self.LATENCY_LIMIT_MS, (
            f"Prediction for '{context}' took {ms:.1f} ms "
            f"(limit={self.LATENCY_LIMIT_MS} ms)"
        )


# ---------------------------------------------------------------------------
# Test 3: Semantic correctness
# ---------------------------------------------------------------------------

class TestSemanticCorrectness:
    def test_y_prefix_contains_you(self, predictor):
        """'WHO ARE Y' â†’ predictions should include 'YOU' (most likely word)."""
        result = predictor("WHO ARE Y")
        assert "YOU" in result, (
            f"Expected 'YOU' in predictions for 'WHO ARE Y', got {result}"
        )

    def test_y_prefix_starts_with_y(self, predictor):
        """All 3 predictions for 'Y' prefix must start with 'Y'."""
        result = predictor("WHO ARE Y")
        for word in result:
            assert word.startswith("Y"), (
                f"Word '{word}' doesn't start with 'Y' "
                f"(context='WHO ARE Y', result={result})"
            )

    def test_h_prefix_starts_with_h(self, predictor):
        """All predictions for single 'H' prefix must start with 'H'."""
        result = predictor("H")
        for word in result:
            assert word.startswith("H"), (
                f"Word '{word}' doesn't start with 'H' (result={result})"
            )

    def test_he_prefix_starts_with_he(self, predictor):
        """All predictions for 'HE' prefix must start with 'HE'."""
        result = predictor("HE")
        for word in result:
            assert word.startswith("HE"), (
                f"Word '{word}' doesn't start with 'HE' (result={result})"
            )

    def test_hello_w_prefix(self, predictor):
        """'HELLO W' â†’ predictions should start with 'W'."""
        result = predictor("HELLO W")
        for word in result:
            assert word.startswith("W"), (
                f"Word '{word}' doesn't start with 'W' (context='HELLO W', result={result})"
            )

    def test_who_are_next_word(self, predictor):
        """'WHO ARE' (complete word) â†’ next-word suggestions."""
        result = predictor("WHO ARE")
        # Should suggest words like YOU, THEY, WE â€” not Y-prefix words
        for word in result:
            assert isinstance(word, str) and len(word) >= 2

    def test_empty_context_returns_high_frequency_words(self, predictor):
        """Empty context â†’ top global frequency words."""
        result = predictor("")
        assert len(result) == 3
        # All should be common English words (in our dict)
        from llm_engine import FREQUENCY_WORDS
        for word in result:
            assert word in FREQUENCY_WORDS, (
                f"'{word}' not in frequency word list for empty context"
            )


# ---------------------------------------------------------------------------
# Test 4: Fallback dictionary internals
# ---------------------------------------------------------------------------

class TestFallbackDictionary:
    def test_frequency_words_not_empty(self):
        """FREQUENCY_WORDS must not be empty."""
        from llm_engine import FREQUENCY_WORDS
        assert len(FREQUENCY_WORDS) > 100, "FREQUENCY_WORDS too short"

    def test_frequency_words_uppercase(self):
        """All words in FREQUENCY_WORDS must be uppercase."""
        from llm_engine import FREQUENCY_WORDS
        for word in FREQUENCY_WORDS:
            assert word == word.upper(), f"'{word}' is not uppercase"

    def test_frequency_words_no_duplicates(self):
        """FREQUENCY_WORDS must not contain duplicates."""
        from llm_engine import FREQUENCY_WORDS
        assert len(FREQUENCY_WORDS) == len(set(FREQUENCY_WORDS)), (
            "FREQUENCY_WORDS contains duplicates"
        )

    def test_fallback_includes_bci_vocabulary(self):
        """BCI-relevant words (HELP, WATER, YES, etc.) must be in the list."""
        from llm_engine import FREQUENCY_WORDS
        bci_words = {"HELP", "WATER", "YES", "HELLO", "PLEASE", "NEED", "STOP"}
        present = bci_words & set(FREQUENCY_WORDS)
        assert len(present) >= 4, (
            f"Too few BCI words in frequency list. Found: {present}"
        )


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback
    _PASS = _FAIL = 0

    def chk(cond, msg):
        global _PASS, _FAIL
        if cond: _PASS += 1; print(f"  [PASS] {msg}")
        else:    _FAIL += 1; print(f"  [FAIL] {msg}")

    print("\n" + "=" * 60)
    print("  test_llm.py â€” Phase 4 Verification")
    print("=" * 60)

    try:
        from llm_engine import get_word_predictions, FREQUENCY_WORDS

        contexts = ["", "H", "HE", "HELLO W", "WHO ARE Y", "WHO ARE", "I NEED"]

        print(f"\n{'Context':<25} {'Predictions':<40} {'Time (ms)':>10}")
        print("-" * 78)

        for ctx in contexts:
            t0    = time.perf_counter()
            preds = get_word_predictions(ctx)
            ms    = (time.perf_counter() - t0) * 1000
            print(f"  {repr(ctx):<23} {str(preds):<40} {ms:>8.1f} ms")
            chk(len(preds) == 3,            f"exactly 3 predictions for {repr(ctx)}")
            chk(all(w == w.upper() for w in preds), f"all uppercase for {repr(ctx)}")
            chk(all(w.isalpha() for w in preds),    f"all alphabetic for {repr(ctx)}")
            chk(len(set(preds)) == 3,       f"no duplicates for {repr(ctx)}")
            chk(ms < 150.0,                 f"response < 150 ms: {ms:.1f} ms")

        print()
        chk("YOU" in get_word_predictions("WHO ARE Y"),  "'YOU' in predictions for 'WHO ARE Y'")
        chk(len(FREQUENCY_WORDS) > 100,                   "FREQUENCY_WORDS not empty (>100 words)")
        chk(len(FREQUENCY_WORDS) == len(set(FREQUENCY_WORDS)), "FREQUENCY_WORDS has no duplicates")
        chk("HELP" in FREQUENCY_WORDS,                    "'HELP' in frequency dict")

    except Exception:
        traceback.print_exc()
        _FAIL += 1

    total = _PASS + _FAIL
    print(f"\n{'='*60}")
    print(f"  RESULTS: {_PASS}/{total} passed")
    print("  âœ…  ALL PHASE 4 TESTS PASSED" if _FAIL == 0 else f"  âŒ  {_FAIL} test(s) FAILED")
    print("=" * 60)
    sys.exit(0 if _FAIL == 0 else 1)


