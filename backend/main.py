"""
main.py — Module 5: FastAPI Localhost Orchestrator
===================================================

Exposes the full P300 EEGNet BCI backend as a RESTful HTTP API on
``http://localhost:8000`` with CORS enabled for frontend integration.

Endpoints
---------
POST /api/framework/reset          — Reset matrix accumulators.
POST /api/framework/process_flash  — Single flash inference → P(target).
GET  /api/framework/decode         — Decode symbol from accumulated scores.
POST /api/simulate_sentence        — End-to-end sentence decode via injector.
GET  /api/llm_predict              — Top-3 LLM word predictions (query: context).
GET  /api/erp_diagnostics          — Target vs. non-target ERP waveform arrays.
GET  /health                       — Server + model status.

Running
-------
    cd backend/
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

    # Visit interactive docs:
    http://localhost:8000/docs

Environment variables
---------------------
    OPENAI_API_KEY   — Enable LLM tier-1 predictions (optional).
    LLM_MODEL        — Override LLM model name (default: gpt-3.5-turbo).
    MODEL_PATH       — Path to eegnet_p300.pt  (default: models/eegnet_p300.pt).
    S01_MAT_PATH     — Path to s01.mat for template/diagnostics
                       (default: data/s01.mat, falls back to ../data_explore/s01.mat).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Path setup — make sibling modules importable
# ---------------------------------------------------------------------------
_HERE   = Path(__file__).resolve().parent
_PARENT = _HERE.parent

# Ensure backend/ takes priority — prevents shadowing by parent-dir modules
if str(_HERE) in sys.path:
    sys.path.remove(str(_HERE))
sys.path.insert(0, str(_HERE))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_MODEL_PATH = Path(
    os.getenv("MODEL_PATH", str(_HERE / "models" / "eegnet_p300.pt"))
)

# Resolve s01.mat: prefer env var → backend/data/ → sibling data_explore → P300 Detection
_s01_env = os.getenv("S01_MAT_PATH", "").strip()
_S01_CANDIDATES = [
    *(([Path(_s01_env)] if _s01_env else [])),   # env var only if non-empty
    _HERE / "data" / "s01.mat",
    _PARENT / "data_explore" / "s01.mat",
    # Cross-project fallback (when running from Netsip-Prototype)
    Path("C:/Users/TANISHA SHARMA/Downloads/P300 Detection/data_explore/s01.mat"),
]
_S01_MAT_PATH: Optional[Path] = next(
    (p for p in _S01_CANDIDATES if p.exists()), None
)
logger.info("Model path : %s (exists=%s)", _MODEL_PATH, _MODEL_PATH.exists())
logger.info("s01.mat    : %s", _S01_MAT_PATH)

# ---------------------------------------------------------------------------
# Application state
# ---------------------------------------------------------------------------
class _AppState:
    framework: Any     = None   # BCIFramework singleton
    prep_result: Any   = None   # Cached PreprocessResult for s01
    loading: bool      = False  # True while init is in progress


_state = _AppState()


# ---------------------------------------------------------------------------
# Lifespan — load EEGNet on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise BCIFramework and cache s01 preprocessing."""
    logger.info("NeuroSpell AI backend starting up…")
    _state.loading = True
    try:
        from bci_framework import BCIFramework
        _state.framework = BCIFramework(model_path=_MODEL_PATH)
        logger.info("✅  BCIFramework initialised.")
    except Exception as exc:
        logger.warning("⚠️  BCIFramework init failed: %s", exc)

    if _S01_MAT_PATH and _S01_MAT_PATH.exists():
        try:
            loop = asyncio.get_event_loop()
            from prep_engine import load_and_preprocess_full
            _state.prep_result = await loop.run_in_executor(
                None,
                partial(load_and_preprocess_full, _S01_MAT_PATH, verbose=False),
            )
            logger.info("✅  s01.mat preprocessing cached.")
        except Exception as exc:
            logger.warning("⚠️  s01.mat preload failed: %s", exc)
    else:
        logger.warning(
            "s01.mat not found at any expected path — "
            "/api/erp_diagnostics and /api/simulate_sentence will be unavailable."
        )
    _state.loading = False
    yield
    logger.info("NeuroSpell AI backend shut down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title       = "NeuroSpell AI — P300 BCI Backend",
    description = (
        "Production-grade FastAPI backend for the NeuroSpell AI BCI Operating System. "
        "Integrates EEGNet (PyTorch), P300 ERP injection, and LLM word prediction."
    ),
    version     = "2.0.0",
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ProcessFlashRequest(BaseModel):
    flash_type: str = Field(
        ..., description="'row' or 'col'", examples=["row"]
    )
    index: int = Field(
        ..., ge=0, le=5, description="Row/column index 0–5"
    )
    epoch_data: List[List[float]] = Field(
        ...,
        description=(
            "Raw EEG epoch as nested list of shape (n_channels, n_samples) or "
            "(n_samples, n_channels). At least 307 samples required."
        ),
    )


class ProcessFlashResponse(BaseModel):
    p300_probability: float = Field(..., description="P(target P300) ∈ [0, 1]")
    flash_type:       str
    index:            int
    flash_count:      int


class DecodeResponse(BaseModel):
    decoded_character: str
    grid_position:     List[int]
    confidence:        float
    row_likelihoods:   List[float]
    col_likelihoods:   List[float]


class ResetResponse(BaseModel):
    status: str = "reset"
    message: str


class SimulateSentenceRequest(BaseModel):
    sentence: str = Field(
        ..., min_length=1, max_length=50,
        description="Target sentence (e.g. 'WHO ARE YOU')",
        examples=["WHO ARE YOU"],
    )
    n_reps: int = Field(
        10, ge=1, le=50,
        description="Flash repetitions per character",
    )
    snr_scale: float = Field(
        1.0, ge=0.1, le=5.0,
        description="P300 template amplitude multiplier (1.0 = natural)",
    )


class CharResult(BaseModel):
    target_char:  str
    decoded_char: str
    correct:      bool
    confidence:   float


class SimulateSentenceResponse(BaseModel):
    sentence:             str
    decoded_sentence:     str
    character_accuracy:   float
    results:              List[CharResult]
    total_epochs:         int
    duration_s:           float


class LLMPredictResponse(BaseModel):
    context:     str
    predictions: List[str]
    source:      str
    latency_ms:  float


class ERPPoint(BaseModel):
    time_ms:      float
    target_uv:    float
    nontarget_uv: float


class ERPDiagnosticsResponse(BaseModel):
    fs:                  float
    n_target:            int
    n_nontarget:         int
    channels:            List[str]
    time_axis_ms:        List[float]
    target_erp:          List[List[float]]   # [n_ch][n_time]
    nontarget_erp:       List[List[float]]
    difference_erp:      List[List[float]]
    p300_peak_ms:        List[float]
    p300_amplitude_uv:   List[float]


class HealthResponse(BaseModel):
    status:        str
    model_loaded:  bool
    data_cached:   bool
    mat_exists:    bool
    model_exists:  bool
    device:        str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_framework():
    if _state.framework is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "EEGNet model not loaded. "
                "Check server logs — model may have failed to initialise."
            ),
        )
    return _state.framework


def _require_mat(label: str = "s01.mat") -> Path:
    if _S01_MAT_PATH is None or not _S01_MAT_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"{label} not found. Place it at backend/data/s01.mat or "
                "set the S01_MAT_PATH environment variable."
            ),
        )
    return _S01_MAT_PATH


# ---------------------------------------------------------------------------
# POST /api/framework/reset
# ---------------------------------------------------------------------------

@app.post(
    "/api/framework/reset",
    response_model = ResetResponse,
    summary        = "Reset matrix score accumulators",
    tags           = ["Framework"],
)
async def framework_reset() -> ResetResponse:
    """Reset all row and column probability accumulators to zero.

    Call this at the start of each new character decoding trial.
    """
    fw = _require_framework()
    fw.reset()
    logger.info("Framework accumulators reset.")
    return ResetResponse(status="reset", message="Row and column accumulators cleared.")


# ---------------------------------------------------------------------------
# POST /api/framework/process_flash
# ---------------------------------------------------------------------------

@app.post(
    "/api/framework/process_flash",
    response_model = ProcessFlashResponse,
    summary        = "Process one flash event through EEGNet",
    tags           = ["Framework"],
)
async def process_flash(req: ProcessFlashRequest) -> ProcessFlashResponse:
    """Run EEGNet inference on a single flash epoch and accumulate scores.

    Parameters
    ----------
    flash_type : 'row' or 'col'
    index      : row/column index 0–5
    epoch_data : nested list (n_channels × n_samples) raw EEG in µV

    Returns
    -------
    p300_probability : P(target P300) ∈ [0, 1]
    """
    fw = _require_framework()

    try:
        epoch_np = np.array(req.epoch_data, dtype=np.float64)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid epoch_data: {exc}")

    loop   = asyncio.get_event_loop()
    p_tgt  = await loop.run_in_executor(
        None,
        partial(fw.process_flash_event, req.flash_type, req.index, epoch_np),
    )
    return ProcessFlashResponse(
        p300_probability = round(float(p_tgt), 6),
        flash_type       = req.flash_type,
        index            = req.index,
        flash_count      = fw.flash_count,
    )


# ---------------------------------------------------------------------------
# GET /api/framework/decode
# ---------------------------------------------------------------------------

@app.get(
    "/api/framework/decode",
    response_model = DecodeResponse,
    summary        = "Decode symbol from accumulated scores",
    tags           = ["Framework"],
)
async def framework_decode() -> DecodeResponse:
    """Intersect best row and column to decode the attended character.

    Returns the decoded character, its (row, col) grid position, a
    confidence score (0–100), and the full row/column likelihood arrays.

    Call this after all flashes for a character have been processed
    via ``POST /api/framework/process_flash``.
    """
    fw     = _require_framework()
    result = fw.decode_symbol()
    return DecodeResponse(
        decoded_character = result["decoded_character"],
        grid_position     = result["grid_position"],
        confidence        = result["confidence"],
        row_likelihoods   = result["row_likelihoods"],
        col_likelihoods   = result["col_likelihoods"],
    )


# ---------------------------------------------------------------------------
# POST /api/simulate_sentence
# ---------------------------------------------------------------------------

def _simulate_task(
    sentence:  str,
    n_reps:    int,
    snr_scale: float,
    mat_path:  Path,
    framework: Any,
) -> Dict[str, Any]:
    """Blocking sentence simulation — runs in executor."""
    from injector_engine import synthesize_sentence_stream_eegnet, CHAR_TO_POS, GRID_6X6

    t0 = time.perf_counter()

    stream, stream_labels, metadata = synthesize_sentence_stream_eegnet(
        target_text = sentence,
        mat_path    = mat_path,
        n_reps      = n_reps,
        snr_scale   = snr_scale,
        verbose     = False,
    )

    # Batch EEGNet inference
    p_all = framework.predict_batch(stream)   # (N,)

    char_results: List[CharResult] = []
    text_norm  = sentence.upper().replace(" ", "_")

    # Replay flash codes deterministically (same RNG seed as synthesiser)
    rng_replay = np.random.default_rng(42)

    for meta_idx, meta in enumerate(metadata):
        start = meta["flash_start_idx"]
        end   = meta["flash_end_idx"]
        char  = meta["char"]
        row   = meta["row"]
        col   = meta["col"]
        p_seg = p_all[start:end]
        n_seg = end - start

        # Reconstruct flash codes with same seed as synthesiser
        # Fast-forward RNG past previous characters
        _rng_fwd = np.random.default_rng(42)
        for _ci in range(meta_idx):
            for _ in range(n_reps):
                _rng_fwd.permutation(12)
        flash_codes_list: List[int] = []
        for _ in range(n_reps):
            flash_codes_list.extend(_rng_fwd.permutation(12).tolist())
        flash_codes = np.array(flash_codes_list[:n_seg], dtype=np.int32)

        # Score accumulation
        row_scores = np.zeros(6); row_counts = np.zeros(6, dtype=int)
        col_scores = np.zeros(6); col_counts = np.zeros(6, dtype=int)
        for i, code in enumerate(flash_codes):
            if code < 6:
                row_scores[code] += p_seg[i]; row_counts[code] += 1
            else:
                col_scores[code - 6] += p_seg[i]; col_counts[code - 6] += 1

        row_avg = np.divide(row_scores, np.maximum(row_counts, 1).astype(float))
        col_avg = np.divide(col_scores, np.maximum(col_counts, 1).astype(float))
        best_row = int(np.argmax(row_avg))
        best_col = int(np.argmax(col_avg))
        decoded  = GRID_6X6[best_row][best_col]

        row_sum    = float(np.sum(row_avg)) or 1.0
        col_sum    = float(np.sum(col_avg)) or 1.0
        p_rn = float(row_avg[best_row]) / row_sum
        p_cn = float(col_avg[best_col]) / col_sum
        conf = float(np.sqrt(max(p_rn * p_cn, 0.0))) * 100.0

        char_results.append(CharResult(
            target_char  = char if char != "_" else " ",
            decoded_char = decoded if decoded != "_" else " ",
            correct      = decoded == char,
            confidence   = round(conf, 2),
        ))

    decoded_sentence = "".join(r.decoded_char for r in char_results)
    n_correct        = sum(r.correct for r in char_results)
    accuracy         = round(n_correct / max(1, len(char_results)), 4)
    duration         = time.perf_counter() - t0

    return {
        "sentence":           sentence,
        "decoded_sentence":   decoded_sentence,
        "character_accuracy": accuracy,
        "results":            char_results,
        "total_epochs":       len(stream_labels),
        "duration_s":         round(duration, 2),
    }


@app.post(
    "/api/simulate_sentence",
    response_model = SimulateSentenceResponse,
    summary        = "Simulate P300 spelling of a custom sentence",
    tags           = ["Simulation"],
)
async def simulate_sentence(req: SimulateSentenceRequest) -> SimulateSentenceResponse:
    """Synthesise a P300 epoch stream for ``sentence`` and decode it.

    For each character in ``sentence``:
    1. Injector synthesises ``n_reps × 12`` flash epochs with P300 template.
    2. EEGNet scores every epoch.
    3. Row/column argmax intersection decodes the character.

    Raises 404 if s01.mat is not found.
    Raises 503 if EEGNet model is not loaded.
    """
    fw       = _require_framework()
    mat_path = _require_mat()

    sentence_norm = req.sentence.upper().replace(" ", "_")
    from injector_engine import CHAR_TO_POS
    for ch in sentence_norm:
        if ch not in CHAR_TO_POS:
            raise HTTPException(
                status_code=422,
                detail=f"Character '{ch}' not in the 6×6 grid (A-Z, 0-9, space)."
            )

    loop   = asyncio.get_event_loop()
    output = await loop.run_in_executor(
        None,
        partial(_simulate_task, req.sentence, req.n_reps, req.snr_scale, mat_path, fw),
    )
    return SimulateSentenceResponse(**output)


# ---------------------------------------------------------------------------
# GET /api/llm_predict
# ---------------------------------------------------------------------------

@app.get(
    "/api/llm_predict",
    response_model = LLMPredictResponse,
    summary        = "Get top-3 LLM word predictions",
    tags           = ["LLM"],
)
async def llm_predict(
    context: str = Query(
        ..., min_length=0, max_length=200,
        description="Partial sentence typed so far (e.g. 'WHO ARE Y')",
        examples=["WHO ARE Y"],
    )
) -> LLMPredictResponse:
    """Return 3 predicted next/completion words for the BCI speller top row.

    Tries: OpenAI → LiteLLM → built-in frequency dictionary.
    Each tier has a 200 ms timeout so BCI latency is never blocked.
    """
    from llm_engine import get_word_predictions, _OPENAI_API_KEY

    openai_avail = bool(_OPENAI_API_KEY)
    try:
        import litellm  # type: ignore
        litellm_avail = True
    except ImportError:
        litellm_avail = False

    loop  = asyncio.get_event_loop()
    t0    = time.perf_counter()
    preds = await loop.run_in_executor(None, partial(get_word_predictions, context))
    ms    = (time.perf_counter() - t0) * 1000

    source = "openai" if openai_avail else ("litellm" if litellm_avail else "frequency_dict")

    return LLMPredictResponse(
        context     = context,
        predictions = preds,
        source      = source,
        latency_ms  = round(ms, 1),
    )


# ---------------------------------------------------------------------------
# GET /api/erp_diagnostics
# ---------------------------------------------------------------------------

def _erp_task(prep_result: Any) -> Dict[str, Any]:
    """Compute averaged ERP waveforms from cached preprocessing result."""
    result  = prep_result
    tgt_msk = result.labels == 1
    nt_msk  = result.labels != 1

    n_tgt = int(np.sum(tgt_msk))
    n_nt  = int(np.sum(nt_msk))

    # Use the full-window epochs for the ERP (−100 ms → +800 ms)
    eps_tgt = result.epochs_full[tgt_msk]   # (N_t, C, T)
    eps_nt  = result.epochs_full[nt_msk]    # (N_nt, C, T)

    erp_tgt  = eps_tgt.mean(axis=0)         # (C, T)
    erp_nt   = eps_nt.mean(axis=0)
    erp_diff = erp_tgt - erp_nt

    T     = result.epochs_full.shape[2]
    fs    = result.fs
    tmin_ms = -100.0
    time_ms = (tmin_ms + np.arange(T) / fs * 1000.0).tolist()

    # P300 peak in 250–500 ms window
    p300_ws = int(round((250 - abs(tmin_ms)) / 1000.0 * fs))
    p300_we = int(round((500 - abs(tmin_ms)) / 1000.0 * fs))
    p300_ws = max(0, p300_ws)
    p300_we = min(T, p300_we)

    peaks_ms, peaks_uv = [], []
    for ch_diff in erp_diff:
        window   = ch_diff[p300_ws:p300_we]
        peak_idx = int(np.argmax(window)) + p300_ws
        peaks_ms.append(round(float(time_ms[peak_idx]), 1))
        peaks_uv.append(round(float(ch_diff[peak_idx]), 3))

    return {
        "fs":              fs,
        "n_target":        n_tgt,
        "n_nontarget":     n_nt,
        "channels":        result.chan_names,
        "time_axis_ms":    [round(t, 2) for t in time_ms],
        "target_erp":      [[round(v, 4) for v in row] for row in erp_tgt.tolist()],
        "nontarget_erp":   [[round(v, 4) for v in row] for row in erp_nt.tolist()],
        "difference_erp":  [[round(v, 4) for v in row] for row in erp_diff.tolist()],
        "p300_peak_ms":    peaks_ms,
        "p300_amplitude_uv": peaks_uv,
    }


@app.get(
    "/api/erp_diagnostics",
    response_model = ERPDiagnosticsResponse,
    summary        = "Target vs. Non-Target ERP waveforms for UI plotting",
    tags           = ["Diagnostics"],
)
async def erp_diagnostics() -> ERPDiagnosticsResponse:
    """Return grand-averaged Target and Non-Target ERP waveforms.

    Computes target ERP, non-target ERP, difference waveform, and per-channel
    P300 peak latency/amplitude in the 250–500 ms window.

    Returns time axis (−100 ms → +800 ms) and per-channel µV arrays.
    """
    if _state.prep_result is None:
        mat_path = _require_mat()
        loop = asyncio.get_event_loop()
        from prep_engine import load_and_preprocess_full
        _state.prep_result = await loop.run_in_executor(
            None, partial(load_and_preprocess_full, mat_path, verbose=False)
        )

    loop   = asyncio.get_event_loop()
    output = await loop.run_in_executor(
        None, partial(_erp_task, _state.prep_result)
    )
    return ERPDiagnosticsResponse(**output)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    response_model = HealthResponse,
    summary        = "Server health and model status",
    tags           = ["Utility"],
)
async def health() -> HealthResponse:
    """Return server health, model load status, and data file availability."""
    import torch
    device = "cpu"
    if _state.framework is not None:
        device = str(_state.framework._device)

    return HealthResponse(
        status       = "ok",
        model_loaded = _state.framework is not None,
        data_cached  = _state.prep_result is not None,
        mat_exists   = (_S01_MAT_PATH is not None and _S01_MAT_PATH.exists()),
        model_exists = _MODEL_PATH.exists(),
        device       = device,
    )


# ---------------------------------------------------------------------------
# Root redirect to docs
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host      = "0.0.0.0",
        port      = 8000,
        reload    = True,
        log_level = "info",
    )
