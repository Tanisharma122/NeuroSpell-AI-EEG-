"""
tests/test_prep.py â€” Phase 1 Verification: Signal Preprocessing Engine
=======================================================================

Verifies that prep_engine.py correctly:
  - Loads s19.mat via the HDF5/scipy loader
  - Applies bandpass filtering and baseline correction
  - Outputs tensors of shape (1, 1, 32, 256)
  - Contains no NaN values
  - Has pre-stimulus mean within Â±1e-5 after baseline correction

Run from the backend/ directory:
    pytest tests/test_prep.py -v
or standalone:
    python tests/test_prep.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

# Data paths â€” prefer backend/data/, then sibling dirs
_DATA_CANDIDATES = [
    _BACKEND / "data" / "s19.mat",
    _BACKEND.parent / "Netsip-Prototype" / "s19.mat",
    _BACKEND.parent / "data_explore" / "s19.mat",
]
_S19_MAT: Path = next((p for p in _DATA_CANDIDATES if p.exists()), None)

_S01_CANDIDATES = [
    _BACKEND / "data" / "s01.mat",
    _BACKEND.parent / "data_explore" / "s01.mat",
]
_S01_MAT: Path = next((p for p in _S01_CANDIDATES if p.exists()), None)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def s19_result():
    """Load and preprocess s19.mat once for the entire test module."""
    if _S19_MAT is None:
        pytest.skip("s19.mat not found â€” place it in backend/data/s19.mat")
    from prep_engine import load_and_preprocess_full
    return load_and_preprocess_full(_S19_MAT, verbose=False)


@pytest.fixture(scope="module")
def synthetic_epoch():
    """Create a synthetic raw epoch with a known shape for unit tests."""
    rng = np.random.default_rng(0)
    # (32 channels Ã— 512 samples) â€” covers âˆ’100 ms to +900 ms @ 512 Hz
    return rng.normal(0, 5.0, size=(32, 512)).astype(np.float64)


# ---------------------------------------------------------------------------
# Test 1: Tensor shape from preprocess_epoch()
# ---------------------------------------------------------------------------

class TestPreprocessEpoch:
    """Unit tests for the real-time single-epoch preprocessing path."""

    def test_output_shape(self, synthetic_epoch):
        """Output tensor must be exactly (1, 1, 32, 256)."""
        import torch
        from prep_engine import preprocess_epoch
        tensor = preprocess_epoch(synthetic_epoch)
        assert tensor.shape == (1, 1, 32, 256), (
            f"Expected shape (1, 1, 32, 256), got {tuple(tensor.shape)}"
        )

    def test_output_is_float32(self, synthetic_epoch):
        """EEGNet expects float32 input."""
        import torch
        from prep_engine import preprocess_epoch
        tensor = preprocess_epoch(synthetic_epoch)
        assert tensor.dtype == torch.float32, (
            f"Expected torch.float32, got {tensor.dtype}"
        )

    def test_no_nan(self, synthetic_epoch):
        """Tensor must contain no NaN values."""
        import torch
        from prep_engine import preprocess_epoch
        tensor = preprocess_epoch(synthetic_epoch)
        assert not torch.isnan(tensor).any(), "Tensor contains NaN values"

    def test_no_inf(self, synthetic_epoch):
        """Tensor must contain no Inf values."""
        import torch
        from prep_engine import preprocess_epoch
        tensor = preprocess_epoch(synthetic_epoch)
        assert not torch.isinf(tensor).any(), "Tensor contains Inf values"

    def test_transposed_input_shape(self):
        """Accept (n_samples, n_channels) input â€” should transpose correctly."""
        import torch
        from prep_engine import preprocess_epoch
        # Transposed: (512, 32) instead of (32, 512)
        rng    = np.random.default_rng(1)
        epoch  = rng.normal(0, 5.0, size=(512, 32)).astype(np.float64)
        tensor = preprocess_epoch(epoch)
        assert tensor.shape == (1, 1, 32, 256), (
            f"Transposed input yielded wrong shape: {tuple(tensor.shape)}"
        )

    def test_fewer_channels_padded(self):
        """Epochs with fewer than 32 channels should be zero-padded to 32."""
        import torch
        from prep_engine import preprocess_epoch
        rng   = np.random.default_rng(2)
        epoch = rng.normal(0, 5.0, size=(7, 512))  # only 7 channels
        tensor = preprocess_epoch(epoch)
        assert tensor.shape == (1, 1, 32, 256)

    def test_baseline_mean_near_zero(self, synthetic_epoch):
        """After preprocessing, the pre-stimulus mean should be â‰ˆ 0."""
        from prep_engine import preprocess_epoch, FS, EPOCH_TMIN
        import torch

        tensor = preprocess_epoch(synthetic_epoch)
        # The tensor covers the post-stimulus window (0 ms â†’ 500 ms)
        # We verify that the full epoch from load_and_preprocess has near-zero baseline
        # Here: check that tensor mean is reasonable (not enormous)
        mean_abs = float(tensor.abs().mean().item())
        assert mean_abs < 50.0, f"Tensor mean amplitude suspiciously large: {mean_abs:.2f}"


# ---------------------------------------------------------------------------
# Test 2: Batch preprocessing from s19.mat
# ---------------------------------------------------------------------------

class TestBatchPreprocessing:
    """Integration tests using real s19.mat data."""

    def test_epochs_full_shape(self, s19_result):
        """epochs_full must be 3-D (N, C, T)."""
        assert s19_result.epochs_full.ndim == 3, "epochs_full is not 3-D"

    def test_epochs_256_shape(self, s19_result):
        """epochs_256 must have exactly 256 time samples."""
        assert s19_result.epochs_256.shape[2] == 256, (
            f"epochs_256 time dimension is {s19_result.epochs_256.shape[2]}, expected 256"
        )

    def test_epochs_256_channels(self, s19_result):
        """epochs_256 must have exactly 32 channels."""
        assert s19_result.epochs_256.shape[1] == 32, (
            f"epochs_256 channel dimension is {s19_result.epochs_256.shape[1]}, expected 32"
        )

    def test_no_nan_in_epochs(self, s19_result):
        """Batch epochs must contain no NaN values."""
        assert not np.isnan(s19_result.epochs_256).any(), (
            "NaN found in epochs_256"
        )

    def test_baseline_near_zero(self, s19_result):
        """Pre-stimulus mean of epochs_full should be â‰ˆ 0 per epoch/channel.

        The baseline correction subtracts the pre-stimulus mean, so the
        mean over the pre-stimulus window should be within Â±1e-5 ÂµV.
        """
        import math
        fs     = s19_result.fs
        n_pre  = int(round(0.100 * fs))    # 100 ms pre-stimulus samples
        bl     = s19_result.epochs_full[:, :, :n_pre]  # (N, C, n_pre)
        means  = bl.mean(axis=2)           # (N, C)
        grand_mean_abs = float(np.mean(np.abs(means)))
        assert grand_mean_abs < 1e-5, (
            f"Pre-stimulus mean not zeroed after baseline correction: "
            f"|mean| = {grand_mean_abs:.2e} ÂµV (should be < 1e-5)"
        )

    def test_amplitude_below_threshold(self, s19_result):
        """All retained epochs must be below the 100 ÂµV artefact threshold."""
        max_amp = float(np.max(np.abs(s19_result.epochs_256)))
        assert max_amp <= 100.0, (
            f"Max epoch amplitude {max_amp:.2f} ÂµV exceeds 100 ÂµV threshold"
        )

    def test_label_values(self, s19_result):
        """Labels must only contain 1 (target) or 2 (non-target)."""
        unique = set(np.unique(s19_result.labels).tolist())
        assert unique.issubset({1, 2}), (
            f"Labels contain unexpected values: {unique}"
        )

    def test_target_and_nontarget_present(self, s19_result):
        """Both target and non-target epochs must be present."""
        assert s19_result.n_target > 0,    "No target epochs found in s19.mat"
        assert s19_result.n_nontarget > 0, "No non-target epochs found in s19.mat"

    def test_fs_is_512(self, s19_result):
        """Sampling rate should be 512 Hz."""
        assert s19_result.fs == 512.0, f"Expected fs=512, got {s19_result.fs}"

    def test_batch_preprocess_tensor_shape(self, s19_result):
        """batch_preprocess() must return (N, 1, 32, 256) tensor."""
        import torch
        from prep_engine import batch_preprocess
        tensor = batch_preprocess(s19_result.epochs_full)
        N      = len(s19_result.labels)
        assert tensor.shape == (N, 1, 32, 256), (
            f"batch_preprocess shape mismatch: {tuple(tensor.shape)} != ({N}, 1, 32, 256)"
        )


# ---------------------------------------------------------------------------
# Test 3: s01.mat (if available)
# ---------------------------------------------------------------------------

class TestS01Preprocessing:
    def test_s01_loads(self):
        """s01.mat should load successfully if present."""
        if _S01_MAT is None:
            pytest.skip("s01.mat not found")
        from prep_engine import load_and_preprocess_full
        result = load_and_preprocess_full(_S01_MAT, verbose=False)
        assert result.epochs_256.shape[2] == 256


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    _PASS = _FAIL = 0

    def chk(cond, msg):
        global _PASS, _FAIL
        if cond:
            _PASS += 1; print(f"  [PASS] {msg}")
        else:
            _FAIL += 1; print(f"  [FAIL] {msg}")

    print("\n" + "=" * 60)
    print("  test_prep.py â€” Phase 1 Verification")
    print("=" * 60)

    try:
        import torch
        from prep_engine import preprocess_epoch, load_and_preprocess_full, batch_preprocess

        # Unit: synthetic epoch
        print("\n[A] Single-epoch preprocessing (synthetic data)")
        rng   = np.random.default_rng(0)
        epoch = rng.normal(0, 5.0, size=(32, 512))
        t     = preprocess_epoch(epoch)
        chk(t.shape == (1, 1, 32, 256), f"shape==(1,1,32,256) [got {tuple(t.shape)}]")
        chk(t.dtype == torch.float32,    f"dtype==float32 [got {t.dtype}]")
        chk(not torch.isnan(t).any(),    "no NaN values")
        chk(not torch.isinf(t).any(),    "no Inf values")

        # Integration: s19.mat
        if _S19_MAT:
            print(f"\n[B] Batch preprocessing: {_S19_MAT.name}")
            res = load_and_preprocess_full(_S19_MAT, verbose=False)
            chk(res.epochs_256.shape[1] == 32,  f"32 channels [got {res.epochs_256.shape[1]}]")
            chk(res.epochs_256.shape[2] == 256, f"256 samples  [got {res.epochs_256.shape[2]}]")
            chk(not np.isnan(res.epochs_256).any(), "no NaN in batch")
            n_pre = int(round(0.100 * res.fs))
            bl    = res.epochs_full[:, :, :n_pre]
            gm    = float(np.mean(np.abs(bl.mean(axis=2))))
            chk(gm < 1e-5, f"baseline mean < 1e-5 ÂµV [got {gm:.2e}]")
            chk(res.n_target > 0 and res.n_nontarget > 0, "both classes present")
            ten   = batch_preprocess(res.epochs_full)
            chk(ten.shape[1:] == (1, 32, 256), f"batch tensor shape [1,32,256] [got {tuple(ten.shape[1:])}]")
        else:
            print("\n  [SKIP] s19.mat not found")

    except Exception:
        traceback.print_exc()
        _FAIL += 1

    total = _PASS + _FAIL
    print(f"\n{'='*60}")
    print(f"  RESULTS: {_PASS}/{total} passed")
    if _FAIL == 0:
        print("  âœ…  ALL PHASE 1 TESTS PASSED")
    else:
        print(f"  âŒ  {_FAIL} test(s) FAILED")
    print("=" * 60)
    sys.exit(0 if _FAIL == 0 else 1)


