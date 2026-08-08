"""
injector_engine.py — Module 3: Synthetic P300 ERP Template Injector
====================================================================

Builds a deterministic epoch stream generator that enables live demonstrations
of custom target phrases (e.g. "WHO ARE YOU") by injecting a data-derived
grand-average P300 ERP template into EEG noise epochs.

Architecture
------------
1.  Load ``s01.mat`` via :mod:`prep_engine` to obtain the full 32-channel
    preprocessed epoch pool.
2.  Compute the **canonical P300 template** as the grand average of all
    target epochs across all 32 channels.
3.  For each character in the target sentence:
    - Map character → (row, col) in 6×6 matrix.
    - For each of ``n_reps`` repetitions, randomly permute the 12 flash codes
      (6 rows + 6 cols) and emit one epoch per flash.
    - Non-target flashes: sample a random non-target epoch from s01.mat.
    - Target flashes (row or col matches character): overlay P300 template at +300 ms.
4.  Return the full stream tensor (N_total, 32, T) ready for EEGNet inference.

Public API
----------
    from injector_engine import (
        build_p300_template_full32ch,
        synthesize_sentence_stream_eegnet,
        decode_sentence_eegnet,
    )
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("injector_engine")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# 6×6 Matrix layout (standard P300 speller)
# ---------------------------------------------------------------------------
GRID_6X6: List[List[str]] = [
    ["A", "B", "C", "D", "E", "F"],
    ["G", "H", "I", "J", "K", "L"],
    ["M", "N", "O", "P", "Q", "R"],
    ["S", "T", "U", "V", "W", "X"],
    ["Y", "Z", "1", "2", "3", "4"],
    ["5", "6", "7", "8", "9", "_"],   # '_' = SPACE
]

CHAR_TO_POS: Dict[str, Tuple[int, int]] = {
    ch: (r, c)
    for r, row in enumerate(GRID_6X6)
    for c, ch in enumerate(row)
}

N_ROWS:        int = 6
N_COLS:        int = 6
N_FLASH_CODES: int = N_ROWS + N_COLS   # 12

MARKER_TARGET:    int = 1
MARKER_NONTARGET: int = 0

P300_LATENCY_S: float = 0.300   # canonical P300 peak at +300 ms

# P300-sensitive channel names (for template quality logging only)
P300_CHANNELS = ["Cz", "Pz", "CP1", "CP2"]


# ---------------------------------------------------------------------------
# Template construction — 32-channel grand-average ERP
# ---------------------------------------------------------------------------

def build_p300_template_full32ch(
    mat_path: str | Path,
    *,
    verbose: bool = True,
) -> Tuple[np.ndarray, "PreprocessResult"]:  # type: ignore[name-defined]
    """Compute the grand-average P300 ERP template from all 32 channels.

    Parameters
    ----------
    mat_path : str | Path
        Path to a reference .mat file (typically ``data/s01.mat``).
    verbose : bool

    Returns
    -------
    template : np.ndarray   shape ``(32, T_full)``
        Grand-average target ERP across all 32 channels.
    result   : PreprocessResult
        Cached preprocessing result (contains non-target epoch pool).
    """
    from prep_engine import load_and_preprocess_full, MARKER_TARGET

    result = load_and_preprocess_full(str(mat_path), verbose=verbose)

    target_mask = result.labels == MARKER_TARGET
    n_target    = int(np.sum(target_mask))

    if n_target == 0:
        raise ValueError(
            "No target epochs found in the .mat file. "
            "Verify that StimulusType / markers_target are correctly encoded."
        )

    # Use epochs_full (full time window) for the template so we can inject at +300 ms
    target_epochs = result.epochs_full[target_mask]  # (N_t, 32, T_full)
    template      = target_epochs.mean(axis=0)       # (32, T_full)

    if verbose:
        # Report peak amplitude on canonical P300 channels
        chan_names = result.chan_names
        for ch in P300_CHANNELS:
            if ch in chan_names:
                idx = chan_names.index(ch)
                ch_template = template[idx]
                # Peak in 250-400 ms window
                fs       = result.fs
                tmin_s   = -0.100  # epoch start
                win_s    = int((0.250 - abs(tmin_s)) * fs)
                win_e    = int((0.400 - abs(tmin_s)) * fs)
                if win_e <= len(ch_template):
                    peak = float(np.max(ch_template[win_s:win_e]))
                    logger.info("  P300 template peak [%s]: %.2f µV", ch, peak)

    logger.info(
        "P300 template built from %d target epochs | shape=%s",
        n_target, template.shape,
    )
    return template.astype(np.float64), result


# ---------------------------------------------------------------------------
# Legacy build_p300_template — for backward compatibility with test_injector
# ---------------------------------------------------------------------------

def build_p300_template(result: "PreprocessResult") -> np.ndarray:  # type: ignore[name-defined]
    """Build grand-average P300 template from a PreprocessResult.

    Parameters
    ----------
    result : PreprocessResult  output of prep_engine.load_and_preprocess_full

    Returns
    -------
    np.ndarray  shape (C, T)  mean target ERP
    """
    from prep_engine import MARKER_TARGET as _MT
    target_mask = result.labels == _MT
    n_target    = int(np.sum(target_mask))
    if n_target == 0:
        raise ValueError("No target epochs in PreprocessResult.")
    # Use epochs_full if available, fall back to epochs_256
    pool = result.epochs_full if hasattr(result, "epochs_full") else result.epochs
    return pool[target_mask].mean(axis=0).astype(np.float64)


# ---------------------------------------------------------------------------
# Epoch stream synthesiser — EEGNet path (32-channel)
# ---------------------------------------------------------------------------

def synthesize_sentence_stream_eegnet(
    target_text: str,
    mat_path:    str | Path,
    n_reps:      int    = 10,
    snr_scale:   float  = 1.0,
    rng:         Optional[np.random.Generator] = None,
    verbose:     bool   = True,
) -> Tuple[np.ndarray, np.ndarray, List[dict]]:
    """Synthesise a 32-channel P300 flash-sequence stream for a sentence.

    For each character in ``target_text``:
    1. Look up (row, col) in the 6×6 matrix.
    2. Repeat the 12-flash sequence ``n_reps`` times with random permutation.
    3. For each flash:
       - Sample a random **non-target** epoch from ``mat_path`` as EEG noise.
       - If flash hits the target row **or** column, inject the P300 template
         onto all 32 channels at the +300 ms offset.
    4. Assign binary label: 1 = target flash, 0 = non-target.

    Parameters
    ----------
    target_text : str  Sentence to synthesise (e.g. ``"WHO ARE YOU"``).
    mat_path    : str | Path  Path to reference s01.mat.
    n_reps      : int  Flash repetitions per character (default 10).
    snr_scale   : float  Amplitude multiplier for P300 template injection.
    rng         : np.random.Generator | None  RNG (fixed seed 42 if None).
    verbose     : bool

    Returns
    -------
    stream       : np.ndarray  shape (N_total, 32, T_full)
    stream_labels: np.ndarray  shape (N_total,)  1=target, 0=non-target
    metadata     : list[dict]  per-character info dicts
    """
    if rng is None:
        rng = np.random.default_rng(42)

    # Load template + non-target pool
    template, result = build_p300_template_full32ch(mat_path, verbose=verbose)
    C, T_full = template.shape  # (32, T_full)

    nt_mask   = result.labels != 1          # non-target mask (MARKER_TARGET=1)
    nt_epochs = result.epochs_full[nt_mask]  # (N_nt, 32, T_full)
    n_nt      = len(nt_epochs)

    if n_nt == 0:
        raise ValueError("No non-target epochs available for noise sampling.")

    # P300 injection offset: epoch starts at tmin=-100ms; +300ms → sample 205
    fs         = result.fs
    tmin_s     = -0.100
    p300_onset = int(round((P300_LATENCY_S - tmin_s) * fs))  # ≈ 205 @ 512 Hz
    p300_onset = min(p300_onset, T_full)

    # Normalise text
    text_norm   = target_text.upper().replace(" ", "_")
    stream_epochs:  List[np.ndarray] = []
    stream_labels_: List[int]        = []
    metadata:       List[dict]       = []

    for char in text_norm:
        if char not in CHAR_TO_POS:
            raise ValueError(
                f"Character '{char}' not in 6×6 grid. "
                f"Supported: {sorted(CHAR_TO_POS.keys())}"
            )
        row, col    = CHAR_TO_POS[char]
        flash_start = len(stream_epochs)

        for _rep in range(n_reps):
            flash_codes = rng.permutation(N_FLASH_CODES).tolist()
            for code in flash_codes:
                is_target = (code < N_ROWS and code == row) or \
                            (code >= N_ROWS and (code - N_ROWS) == col)

                # Sample random non-target epoch as noise base
                noise_idx = int(rng.integers(0, n_nt))
                epoch     = nt_epochs[noise_idx].copy()   # (32, T_full)

                # Inject P300 template at +300 ms on all 32 channels
                if is_target:
                    inject_end = min(p300_onset + T_full, T_full)
                    t_len      = inject_end - p300_onset
                    epoch[:, p300_onset:inject_end] += snr_scale * template[:, :t_len]

                stream_epochs.append(epoch)
                stream_labels_.append(MARKER_TARGET if is_target else MARKER_NONTARGET)

        flash_end = len(stream_epochs)
        metadata.append({
            "char":             char,
            "row":              row,
            "col":              col,
            "flash_start_idx":  flash_start,
            "flash_end_idx":    flash_end,
            "n_target_flashes": n_reps * 2,
        })

    stream        = np.stack(stream_epochs, axis=0).astype(np.float64)
    stream_labels = np.array(stream_labels_, dtype=np.int32)
    n_tgt         = int(np.sum(stream_labels == MARKER_TARGET))

    logger.info(
        "Stream synthesised | '%s' | %d chars | %d total epochs | "
        "%d target (%.1f%%) | shape=%s",
        target_text, len(text_norm), len(stream_labels),
        n_tgt, 100 * n_tgt / max(1, len(stream_labels)), stream.shape,
    )
    return stream, stream_labels, metadata


# ---------------------------------------------------------------------------
# Legacy synthesize_sentence_stream — uses PreprocessResult directly
# ---------------------------------------------------------------------------

def synthesize_sentence_stream(
    target_text: str,
    result: "PreprocessResult",  # type: ignore[name-defined]
    n_reps: int = 10,
    rng: Optional[np.random.Generator] = None,
    snr_scale: float = 1.0,
) -> Tuple[np.ndarray, np.ndarray, List[dict]]:
    """Legacy interface: synthesise stream from an existing PreprocessResult.

    Compatible with the ``p300_backend/injector_engine.py`` calling convention
    used in the existing ``main.py`` / ``decode_character()`` flow.
    """
    if rng is None:
        rng = np.random.default_rng(42)

    template = build_p300_template(result)
    C, T_full = template.shape

    # Non-target pool — use epochs_full if available for 32-ch compatibility
    nt_mask   = result.labels != 1
    nt_epochs = (
        result.epochs_full[nt_mask]
        if hasattr(result, "epochs_full") and result.epochs_full.shape[1] > result.epochs_256.shape[1]
        else result.epochs[nt_mask]
    )
    n_nt = len(nt_epochs)
    if n_nt == 0:
        raise ValueError("No non-target epochs available.")

    fs       = result.fs
    tmin_s   = -0.100
    p300_onset = int(round((P300_LATENCY_S - tmin_s) * fs))
    p300_onset = min(p300_onset, T_full)

    text_norm   = target_text.upper().replace(" ", "_")
    stream_eps: List[np.ndarray] = []
    stream_lbl: List[int]        = []
    metadata:   List[dict]       = []

    for char in text_norm:
        if char not in CHAR_TO_POS:
            raise ValueError(f"Character '{char}' not in 6×6 grid.")
        row, col    = CHAR_TO_POS[char]
        flash_start = len(stream_eps)

        for _rep in range(n_reps):
            flash_codes = rng.permutation(N_FLASH_CODES).tolist()
            for code in flash_codes:
                is_target = (code < N_ROWS and code == row) or \
                            (code >= N_ROWS and (code - N_ROWS) == col)
                noise_idx = int(rng.integers(0, n_nt))
                epoch     = nt_epochs[noise_idx].copy()
                if is_target:
                    inject_end = min(p300_onset + T_full, T_full)
                    t_len      = inject_end - p300_onset
                    epoch[:, p300_onset:inject_end] += snr_scale * template[:, :t_len]
                stream_eps.append(epoch)
                stream_lbl.append(MARKER_TARGET if is_target else MARKER_NONTARGET)

        flash_end = len(stream_eps)
        metadata.append({
            "char":             char, "row": row, "col": col,
            "flash_start_idx":  flash_start, "flash_end_idx": flash_end,
            "n_target_flashes": n_reps * 2,
        })

    stream        = np.stack(stream_eps, axis=0).astype(np.float64)
    stream_labels = np.array(stream_lbl, dtype=np.int32)
    return stream, stream_labels, metadata


# ---------------------------------------------------------------------------
# Full end-to-end sentence decode — EEGNet path
# ---------------------------------------------------------------------------

def decode_sentence_eegnet(
    target_text: str,
    framework:   "BCIFramework",  # type: ignore[name-defined]
    mat_path:    str | Path,
    n_reps:      int   = 10,
    snr_scale:   float = 1.0,
    verbose:     bool  = True,
) -> Tuple[str, List[dict]]:
    """Decode a full sentence using the BCIFramework and synthetic ERP stream.

    Parameters
    ----------
    target_text : str    Sentence to decode (e.g. ``"WHO ARE YOU"``).
    framework   : BCIFramework   Loaded EEGNet inference engine.
    mat_path    : str | Path     Path to s01.mat for template extraction.
    n_reps      : int            Flash repetitions per character.
    snr_scale   : float          P300 template amplitude multiplier.
    verbose     : bool

    Returns
    -------
    decoded_text : str  Decoded sentence (space-separated chars, '_' → ' ').
    char_results : list[dict]  Per-character decode details.
    """
    from prep_engine import batch_preprocess

    # Synthesise stream
    stream, stream_labels, metadata = synthesize_sentence_stream_eegnet(
        target_text=target_text,
        mat_path=mat_path,
        n_reps=n_reps,
        snr_scale=snr_scale,
        verbose=verbose,
    )

    # Pre-process entire stream to (N, 1, 32, 256) tensors in one batch
    import torch
    stream_tensor = batch_preprocess(stream)  # (N, 1, 32, 256)
    p_all = framework.predict_batch(stream.astype(np.float64))  # (N,)

    char_results: List[dict] = []
    text_norm   = target_text.upper().replace(" ", "_")

    for meta in metadata:
        start = meta["flash_start_idx"]
        end   = meta["flash_end_idx"]
        char  = meta["char"]
        row   = meta["row"]
        col   = meta["col"]

        p_seg  = p_all[start:end]  # (n_reps*12,)
        n_seg  = end - start

        # Reconstruct flash codes (same permutation order as synthesiser with seed=42)
        rng_decode = np.random.default_rng(42)
        # Skip characters before this one
        char_idx = list(text_norm).index(char)
        for _ in range(char_idx * n_reps):
            rng_decode.permutation(N_FLASH_CODES)

        flash_codes_list: List[int] = []
        for _rep in range(n_reps):
            flash_codes_list.extend(rng_decode.permutation(N_FLASH_CODES).tolist())
        flash_codes = np.array(flash_codes_list[:n_seg], dtype=np.int32)

        # Accumulate scores
        row_scores = np.zeros(N_ROWS)
        col_scores = np.zeros(N_COLS)
        row_counts = np.zeros(N_ROWS, dtype=int)
        col_counts = np.zeros(N_COLS, dtype=int)

        for i, code in enumerate(flash_codes):
            if code < N_ROWS:
                row_scores[code] += p_seg[i]
                row_counts[code] += 1
            else:
                col_scores[code - N_ROWS] += p_seg[i]
                col_counts[code - N_ROWS] += 1

        row_avg = np.divide(row_scores, np.maximum(row_counts, 1).astype(float))
        col_avg = np.divide(col_scores, np.maximum(col_counts, 1).astype(float))

        best_row = int(np.argmax(row_avg))
        best_col = int(np.argmax(col_avg))
        decoded  = GRID_6X6[best_row][best_col]

        row_sum    = float(np.sum(row_avg)) or 1.0
        col_sum    = float(np.sum(col_avg)) or 1.0
        p_row_norm = float(row_avg[best_row]) / row_sum
        p_col_norm = float(col_avg[best_col]) / col_sum
        confidence = np.sqrt(max(p_row_norm * p_col_norm, 0.0)) * 100.0

        char_results.append({
            "target_char":  char if char != "_" else " ",
            "decoded_char": decoded if decoded != "_" else " ",
            "correct":      decoded == char,
            "confidence":   round(confidence, 2),
            "row_avg":      row_avg.tolist(),
            "col_avg":      col_avg.tolist(),
        })

        if verbose:
            status = "✅" if decoded == char else "❌"
            logger.info(
                "%s  Target='%s'  Decoded='%s'  conf=%.1f%%",
                status, char, decoded, confidence,
            )

    decoded_text = "".join(
        r["decoded_char"] for r in char_results
    )

    n_correct = sum(r["correct"] for r in char_results)
    accuracy  = n_correct / max(1, len(char_results)) * 100
    logger.info(
        "Sentence decode complete | '%s' → '%s' | accuracy=%.1f%%",
        target_text, decoded_text, accuracy,
    )

    return decoded_text, char_results


# ---------------------------------------------------------------------------
# decode_character — legacy compatibility shim for existing main.py
# ---------------------------------------------------------------------------

def decode_character(
    epoch_segment: np.ndarray,
    flash_codes:   np.ndarray,
    clf:           object,
) -> Tuple[str, float]:
    """Score one character's flash segment and return the decoded char.

    Legacy compatibility shim. If ``clf`` is a BCIFramework, uses predict_batch.
    Otherwise calls predict_proba from model_engine.
    """
    from bci_framework import BCIFramework

    if isinstance(clf, BCIFramework):
        p_all = clf.predict_batch(epoch_segment)
    else:
        # Fallback to old model_engine path
        from model_engine import predict_proba
        p_all = predict_proba(clf, epoch_segment)

    row_scores = np.zeros(N_ROWS)
    col_scores = np.zeros(N_COLS)
    row_counts = np.zeros(N_ROWS, dtype=int)
    col_counts = np.zeros(N_COLS, dtype=int)

    for i, code in enumerate(flash_codes):
        code = int(code)
        if code < N_ROWS:
            row_scores[code] += p_all[i]
            row_counts[code] += 1
        else:
            col_scores[code - N_ROWS] += p_all[i]
            col_counts[code - N_ROWS] += 1

    row_avg  = np.divide(row_scores, np.maximum(row_counts, 1).astype(float))
    col_avg  = np.divide(col_scores, np.maximum(col_counts, 1).astype(float))
    best_row = int(np.argmax(row_avg))
    best_col = int(np.argmax(col_avg))
    confidence = float((row_avg[best_row] + col_avg[best_col]) / 2.0)
    return GRID_6X6[best_row][best_col], confidence


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse, sys
    sys.path.insert(0, str(Path(__file__).parent))

    parser = argparse.ArgumentParser(description="injector_engine — synthesise P300 stream")
    parser.add_argument("--mat", required=True, help="Path to s01.mat")
    parser.add_argument("--text", default="WHO", help="Target text (default: WHO)")
    parser.add_argument("--reps", type=int, default=5, help="Flash repetitions")
    args = parser.parse_args()

    stream, labels, meta = synthesize_sentence_stream_eegnet(
        target_text=args.text, mat_path=args.mat, n_reps=args.reps
    )
    print(f"\nStream shape  : {stream.shape}")
    print(f"Labels shape  : {labels.shape}")
    print(f"Target flashes: {int(np.sum(labels==1))}")
    print(f"Characters    : {[m['char'] for m in meta]}")
