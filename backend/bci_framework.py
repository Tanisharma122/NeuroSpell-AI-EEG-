"""
bci_framework.py — Module 2: PyTorch EEGNet BCI Framework Engine
================================================================

Provides:
  - ``EEGNet`` — standalone PyTorch module (no bci_pipeline dependency).
  - ``BCIFramework`` — stateful inference class with row/column score
    accumulators and the matrix-intersection decode algorithm.

Design
------
``BCIFramework`` accumulates softmax P(target) scores per row and column
flash across multiple repetitions.  After all flashes for a character are
processed, ``decode_symbol()`` intersects the argmax row and column on the
6×6 matrix to recover the intended character.

Confidence formula
------------------
    confidence = sqrt( (P_best_row / sum(P_rows)) * (P_best_col / sum(P_cols)) ) * 100

Usage
-----
    from bci_framework import BCIFramework

    fw = BCIFramework("models/eegnet_p300.pt")
    fw.reset()

    for flash in flash_sequence:
        p = fw.process_flash_event(flash["type"], flash["index"], flash["epoch"])

    result = fw.decode_symbol()
    # → {"decoded_character": "W", "grid_position": [0, 4], "confidence": 95.2, ...}
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("bci_framework")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# 6×6 speller matrix
# ---------------------------------------------------------------------------
GRID_6X6: List[List[str]] = [
    ["A", "B", "C", "D", "E", "F"],
    ["G", "H", "I", "J", "K", "L"],
    ["M", "N", "O", "P", "Q", "R"],
    ["S", "T", "U", "V", "W", "X"],
    ["Y", "Z", "1", "2", "3", "4"],
    ["5", "6", "7", "8", "9", "_"],   # '_' = SPACE
]
N_ROWS = 6
N_COLS = 6

CHAR_TO_POS: Dict[str, Tuple[int, int]] = {
    ch: (r, c)
    for r, row in enumerate(GRID_6X6)
    for c, ch in enumerate(row)
}

# ---------------------------------------------------------------------------
# EEGNet Architecture (standalone, no bci_pipeline dependency)
# ---------------------------------------------------------------------------

def _build_eegnet_module(
    n_channels:   int = 32,
    n_samples:    int = 256,
    n_classes:    int = 2,
    F1:           int = 8,
    D:            int = 2,
    dropout_rate: float = 0.5,
) -> "torch.nn.Module":
    """Build the EEGNet PyTorch module.

    Architecture (Lawhern et al. 2018):
      Block 1 — Temporal conv (F1 filters, half-sampling-rate kernel)
               → Depthwise spatial conv (D*F1 filters over all channels)
               → BatchNorm → ELU → AvgPool(1×4) → Dropout
      Block 2 — Separable temporal conv (F2=D*F1 filters, kernel 16)
               → BatchNorm → ELU → AvgPool(1×8) → Dropout
      Classifier — Flatten → Linear(F2*T', n_classes)

    Parameters
    ----------
    n_channels : int   number of EEG channels (32)
    n_samples  : int   epoch length in samples (256)
    n_classes  : int   output classes (2)
    F1         : int   temporal filters (8)
    D          : int   depth multiplier (2)
    dropout_rate : float
    """
    import torch
    import torch.nn as nn

    F2       = F1 * D
    kern_len = n_samples // 2   # ~128 for 256-sample epochs

    class EEGNetModel(nn.Module):
        def __init__(self):
            super().__init__()
            # Block 1
            self.block1 = nn.Sequential(
                nn.Conv2d(1, F1, kernel_size=(1, kern_len),
                          padding=(0, kern_len // 2), bias=False),
                nn.BatchNorm2d(F1),
                nn.Conv2d(F1, F2, kernel_size=(n_channels, 1),
                          groups=F1, bias=False),
                nn.BatchNorm2d(F2),
                nn.ELU(),
                nn.AvgPool2d(kernel_size=(1, 4)),
                nn.Dropout(dropout_rate),
            )
            # Block 2
            self.block2 = nn.Sequential(
                nn.Conv2d(F2, F2, kernel_size=(1, 16),
                          padding=(0, 8), groups=F2, bias=False),
                nn.Conv2d(F2, F2, kernel_size=(1, 1), bias=False),
                nn.BatchNorm2d(F2),
                nn.ELU(),
                nn.AvgPool2d(kernel_size=(1, 8)),
                nn.Dropout(dropout_rate),
            )
            # Compute flat size via dummy forward
            with torch.no_grad():
                dummy = torch.zeros(1, 1, n_channels, n_samples)
                x = self.block1(dummy)
                x = self.block2(x)
                flat = int(x.numel())

            self.classifier = nn.Sequential(
                nn.Flatten(),
                nn.Linear(flat, n_classes),
            )

        def forward(self, x):
            x = self.block1(x)
            x = self.block2(x)
            return self.classifier(x)

    return EEGNetModel()


# ---------------------------------------------------------------------------
# BCIFramework
# ---------------------------------------------------------------------------

class BCIFramework:
    """Stateful EEGNet inference engine with P300 matrix-intersection decoder.

    Parameters
    ----------
    model_path : str | Path
        Path to ``eegnet_p300.pt`` PyTorch weights file.
        If the file doesn't exist or weights are incompatible, the model is
        initialised with random weights (useful for structural testing).
    n_channels : int   EEG channels expected by the model (default 32).
    n_samples  : int   Epoch samples expected by the model (default 256).
    """

    def __init__(
        self,
        model_path: str | Path = "models/eegnet_p300.pt",
        n_channels: int = 32,
        n_samples:  int = 256,
    ) -> None:
        import torch

        self._n_channels = n_channels
        self._n_samples  = n_samples
        self._device     = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._model      = self._load_model(Path(model_path))
        self._model.to(self._device)
        self._model.eval()
        self.reset()
        logger.info(
            "BCIFramework ready | device=%s | model=%s",
            self._device, Path(model_path).name,
        )

    # ------------------------------------------------------------------ #
    # Model loading                                                        #
    # ------------------------------------------------------------------ #

    def _load_model(self, model_path: Path) -> "torch.nn.Module":
        """Load weights into EEGNet; fall back to random init on any error."""
        import torch

        model = _build_eegnet_module(
            n_channels=self._n_channels,
            n_samples=self._n_samples,
        )

        if not model_path.exists():
            logger.warning(
                "Model file not found: %s — using random weights.", model_path
            )
            return model

        try:
            state = torch.load(str(model_path), map_location="cpu", weights_only=False)

            # Unwrap common containers
            if isinstance(state, dict):
                if "model_state_dict" in state:
                    state = state["model_state_dict"]
                elif "state_dict" in state:
                    state = state["state_dict"]

            if isinstance(state, dict):
                # Strict=False: silently ignore shape mismatches (e.g. 512→256 samples)
                missing, unexpected = model.load_state_dict(state, strict=False)
                if missing or unexpected:
                    logger.warning(
                        "Partial weight load — missing: %d, unexpected: %d. "
                        "Architecture mismatch (trained at different n_samples?). "
                        "Using partially loaded weights.",
                        len(missing), len(unexpected),
                    )
                else:
                    logger.info("✅  EEGNet weights loaded from %s", model_path.name)
            else:
                # state is the entire model object
                model = state
                logger.info("✅  Full EEGNet model object loaded from %s", model_path.name)

        except Exception as exc:
            logger.warning(
                "Could not load weights from %s (%s) — using random init.",
                model_path.name, exc,
            )

        return model

    # ------------------------------------------------------------------ #
    # State management                                                     #
    # ------------------------------------------------------------------ #

    def reset(self) -> None:
        """Reset all row/column score accumulators to zero."""
        self._row_scores: np.ndarray = np.zeros(N_ROWS,  dtype=np.float64)
        self._col_scores: np.ndarray = np.zeros(N_COLS,  dtype=np.float64)
        self._row_counts: np.ndarray = np.zeros(N_ROWS,  dtype=np.int32)
        self._col_counts: np.ndarray = np.zeros(N_COLS,  dtype=np.int32)
        self._flash_log: List[Dict] = []
        logger.debug("BCIFramework accumulators reset.")

    # ------------------------------------------------------------------ #
    # Flash processing                                                     #
    # ------------------------------------------------------------------ #

    def process_flash_event(
        self,
        flash_type: str,
        index: int,
        raw_epoch: np.ndarray,
    ) -> float:
        """Process one flash event and update row/column accumulators.

        Parameters
        ----------
        flash_type : str
            ``"row"`` or ``"col"`` (case-insensitive).
        index : int
            Row index 0–5 (for row flashes) or column index 0–5 (for col).
        raw_epoch : np.ndarray
            Raw EEG epoch, shape ``(n_channels, n_samples)`` or
            ``(n_samples, n_channels)``.  At least 307 samples required
            (100 ms pre + 500 ms post @512 Hz before truncation).

        Returns
        -------
        float
            P(target P300) ∈ [0, 1] from EEGNet softmax.
        """
        from prep_engine import preprocess_epoch

        tensor    = preprocess_epoch(raw_epoch)      # (1, 1, 32, 256)
        p_target  = self._run_inference(tensor)

        flash_type_lower = flash_type.lower()
        if flash_type_lower == "row":
            self._row_scores[index] += p_target
            self._row_counts[index] += 1
        elif flash_type_lower == "col":
            self._col_scores[index] += p_target
            self._col_counts[index] += 1
        else:
            raise ValueError(f"flash_type must be 'row' or 'col', got '{flash_type}'")

        self._flash_log.append({
            "type": flash_type_lower, "index": index, "p_target": p_target
        })
        return float(p_target)

    def process_flash_event_tensor(
        self,
        flash_type: str,
        index: int,
        tensor: "torch.Tensor",
    ) -> float:
        """Process a pre-formatted ``(1, 1, 32, 256)`` tensor directly.

        Used by the injector pipeline where preprocessing is done in batch.
        """
        p_target = self._run_inference(tensor)
        flash_type_lower = flash_type.lower()
        if flash_type_lower == "row":
            self._row_scores[index] += p_target
            self._row_counts[index] += 1
        elif flash_type_lower == "col":
            self._col_scores[index] += p_target
            self._col_counts[index] += 1
        else:
            raise ValueError(f"flash_type must be 'row' or 'col', got '{flash_type}'")
        return float(p_target)

    # ------------------------------------------------------------------ #
    # EEGNet inference                                                     #
    # ------------------------------------------------------------------ #

    def _run_inference(self, tensor: "torch.Tensor") -> float:
        """Run EEGNet forward pass and return P(target).

        Parameters
        ----------
        tensor : torch.Tensor   shape (1, 1, 32, 256)

        Returns
        -------
        float  P(target class = 1) from softmax.
        """
        import torch
        import torch.nn.functional as F

        with torch.no_grad():
            x      = tensor.to(self._device)
            logits = self._model(x)           # (1, 2)
            proba  = F.softmax(logits, dim=1) # (1, 2)
            p_tgt  = float(proba[0, 1].item())

        return p_tgt

    def predict_batch(self, epochs_np: np.ndarray) -> np.ndarray:
        """Run EEGNet on a batch of pre-cropped epochs.

        Parameters
        ----------
        epochs_np : np.ndarray   shape (N, 32, 256)  pre-processed

        Returns
        -------
        np.ndarray   shape (N,)  P(target) per epoch
        """
        import torch
        import torch.nn.functional as F
        from prep_engine import batch_preprocess

        # epochs_np may be (N, 32, T_full) — batch_preprocess handles cropping
        if epochs_np.shape[2] != 256:
            tensor = batch_preprocess(epochs_np)   # (N, 1, 32, 256)
        else:
            tensor = torch.from_numpy(
                epochs_np[:, np.newaxis, :, :].astype(np.float32)
            )

        with torch.no_grad():
            x      = tensor.to(self._device)
            logits = self._model(x)               # (N, 2)
            proba  = F.softmax(logits, dim=1)     # (N, 2)
            p_tgt  = proba[:, 1].cpu().numpy()    # (N,)

        return p_tgt.astype(np.float64)

    # ------------------------------------------------------------------ #
    # Decode                                                              #
    # ------------------------------------------------------------------ #

    def decode_symbol(self) -> Dict[str, Any]:
        """Decode the attended character from accumulated row/column scores.

        Returns
        -------
        dict with keys:
            ``decoded_character`` (str),
            ``grid_position``     (list[int] — [row, col]),
            ``confidence``        (float — 0..100),
            ``row_likelihoods``   (list[float] — 6 values),
            ``col_likelihoods``   (list[float] — 6 values),
            ``row_avg``           (list[float]),
            ``col_avg``           (list[float]).
        """
        # Mean-pool: divide accumulated scores by flash counts
        row_avg = np.divide(
            self._row_scores,
            np.maximum(self._row_counts, 1).astype(np.float64),
        )
        col_avg = np.divide(
            self._col_scores,
            np.maximum(self._col_counts, 1).astype(np.float64),
        )

        R_best = int(np.argmax(row_avg))
        C_best = int(np.argmax(col_avg))

        char = GRID_6X6[R_best][C_best]

        # Normalised likelihoods
        row_sum = float(np.sum(row_avg)) or 1.0
        col_sum = float(np.sum(col_avg)) or 1.0
        p_row   = float(row_avg[R_best]) / row_sum
        p_col   = float(col_avg[C_best]) / col_sum

        confidence = math.sqrt(max(p_row * p_col, 0.0)) * 100.0

        return {
            "decoded_character":  char,
            "grid_position":      [R_best, C_best],
            "confidence":         round(confidence, 2),
            "row_likelihoods":    [round(float(v), 4) for v in row_avg],
            "col_likelihoods":    [round(float(v), 4) for v in col_avg],
            "row_avg":            [round(float(v), 4) for v in row_avg],
            "col_avg":            [round(float(v), 4) for v in col_avg],
        }

    # ------------------------------------------------------------------ #
    # Properties                                                          #
    # ------------------------------------------------------------------ #

    @property
    def row_scores(self) -> np.ndarray:
        return self._row_scores.copy()

    @property
    def col_scores(self) -> np.ndarray:
        return self._col_scores.copy()

    @property
    def flash_count(self) -> int:
        return len(self._flash_log)


# ---------------------------------------------------------------------------
# Module-level singleton (used by FastAPI lifespan)
# ---------------------------------------------------------------------------

_framework_instance: Optional[BCIFramework] = None


def get_framework(model_path: str | Path = "models/eegnet_p300.pt") -> BCIFramework:
    """Return the module-level BCIFramework singleton, creating it if needed."""
    global _framework_instance
    if _framework_instance is None:
        _framework_instance = BCIFramework(model_path)
    return _framework_instance


def reset_framework() -> None:
    """Reset accumulators on the existing singleton (or create if missing)."""
    get_framework().reset()


# ---------------------------------------------------------------------------
# CLI self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="bci_framework — quick inference test")
    parser.add_argument("--model", default="models/eegnet_p300.pt")
    args = parser.parse_args()

    print("\n[bci_framework] Initialising framework…")
    fw = BCIFramework(args.model)
    print("[bci_framework] Running synthetic flash sequence (random noise)…")

    rng = np.random.default_rng(0)
    fw.reset()
    for flash_code in range(12):
        ftype = "row" if flash_code < 6 else "col"
        fidx  = flash_code if flash_code < 6 else flash_code - 6
        epoch = rng.normal(0, 5.0, size=(32, 307))  # (C, T)
        p     = fw.process_flash_event(ftype, fidx, epoch)
        print(f"  flash {flash_code:2d}  type={ftype}  idx={fidx}  P(target)={p:.4f}")

    result = fw.decode_symbol()
    print(f"\n[bci_framework] Decoded: '{result['decoded_character']}' "
          f"@ {result['grid_position']}  conf={result['confidence']:.1f}%")
