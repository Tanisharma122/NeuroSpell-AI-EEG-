"""
prep_engine.py — Module 1: EEG Signal Preprocessing Engine
===========================================================

Converts continuous 32-channel raw EEG (µV) into clean, normalized
PyTorch tensors ready for EEGNet inference.

Pipeline
--------
1. Bandpass filter — 4th-order Butterworth (0.5 – 12 Hz), zero-phase.
2. Epoch extraction — −100 ms → +800 ms around stimulus onset.
3. Baseline correction — subtract pre-stimulus mean (−100 ms → 0 ms).
4. Truncation — crop post-stimulus window to exactly 256 samples
   (= 0.5 s @ 512 Hz), discarding the 100 ms pre-stimulus interval.
5. Tensor formatting — reshape to ``(1, 1, 32, 256)`` for EEGNet.

Public API
----------
    from prep_engine import preprocess_epoch, load_and_preprocess_full

    # Single-epoch path (real-time inference):
    tensor = preprocess_epoch(raw_epoch_np)          # (1, 1, 32, 256)

    # Batch path (diagnostics / injector):
    result = load_and_preprocess_full("data/s01.mat")
    result.epochs_full                               # (N, 32, T_full)
    result.epochs_256                                # (N, 32, 256)
    result.labels                                    # (N,)  1=target 2=nt
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from scipy import signal as sps

logger = logging.getLogger("prep_engine")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FS: float          = 512.0   # Hz
BANDPASS_LO: float = 0.5     # Hz
BANDPASS_HI: float = 12.0    # Hz
FILTER_ORDER: int  = 4

EPOCH_TMIN: float      = -0.100  # s  (100 ms pre-stimulus)
EPOCH_TMAX: float      =  0.800  # s  (800 ms post-stimulus)
BASELINE_END: float    =  0.000  # s  (stimulus onset)

N_SAMPLES_EEGNET: int  = 256     # target samples after truncation
N_CHANNELS: int        = 32

AMPLITUDE_THRESHOLD: float = 100.0  # µV artefact ceiling

MARKER_TARGET    = 1
MARKER_NONTARGET = 2

# P300-peak channels used for diagnostics (not for filtering in EEGNet path)
P300_CHANNELS: List[str] = ["Cz", "Pz", "Oz", "P3", "P4", "CP1", "CP2"]

_HERE = Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class PreprocessResult:
    """Batch preprocessing output.

    Attributes
    ----------
    epochs_full : np.ndarray   (N, 32, T_raw)  — full epoch (−100 ms → +800 ms)
    epochs_256  : np.ndarray   (N, 32, 256)    — post-stimulus 256-sample window
    labels      : np.ndarray   (N,)            — 1=target, 2=non-target
    chan_names  : list[str]    — electrode labels (32 names)
    fs          : float        — sampling rate
    event_samples : np.ndarray (N,) — onset sample indices in original recording
    n_target    : int
    n_nontarget : int
    """
    epochs_full:   np.ndarray
    epochs_256:    np.ndarray
    labels:        np.ndarray
    chan_names:    List[str]
    fs:            float
    event_samples: np.ndarray
    n_target:    int = field(init=False)
    n_nontarget: int = field(init=False)

    def __post_init__(self) -> None:
        self.n_target    = int(np.sum(self.labels == MARKER_TARGET))
        self.n_nontarget = int(np.sum(self.labels == MARKER_NONTARGET))

    def summary(self) -> str:
        return (
            f"PreprocessResult | {len(self.labels)} epochs "
            f"({self.n_target} target, {self.n_nontarget} non-target) | "
            f"full={self.epochs_full.shape} | 256={self.epochs_256.shape}"
        )

    # Alias for injector_engine compatibility
    @property
    def epochs(self) -> np.ndarray:
        return self.epochs_256

    @property
    def all_chan_names(self) -> List[str]:
        return self.chan_names


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

def butter_bandpass(
    data: np.ndarray,
    lowcut: float = BANDPASS_LO,
    highcut: float = BANDPASS_HI,
    fs: float = FS,
    order: int = FILTER_ORDER,
) -> np.ndarray:
    """Zero-phase 4th-order Butterworth bandpass filter.

    Parameters
    ----------
    data : (n_samples, n_channels) or (n_channels, n_samples)
        Raw continuous EEG.  Filtering is applied along axis 0 (samples axis).
    lowcut, highcut : float  — Hz
    fs : float               — Hz
    order : int

    Returns
    -------
    np.ndarray — same shape, float64
    """
    nyq = fs / 2.0
    lo_n = lowcut / nyq
    hi_n = highcut / nyq

    if lo_n <= 0.0 or hi_n >= 1.0:
        raise ValueError(
            f"Bandpass [{lowcut}, {highcut}] Hz out of valid range (0, {nyq}) Hz."
        )

    sos = sps.butter(order, [lo_n, hi_n], btype="bandpass", output="sos")
    return sps.sosfiltfilt(sos, data, axis=0).astype(np.float64)


# ---------------------------------------------------------------------------
# Epoch extraction helpers
# ---------------------------------------------------------------------------

def _extract_epochs(
    data: np.ndarray,
    markers: np.ndarray,
    fs: float,
    tmin: float = EPOCH_TMIN,
    tmax: float = EPOCH_TMAX,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cut continuous EEG into (N, C, T) epochs around flash onsets.

    Returns
    -------
    epochs        : (N, C, T)
    labels        : (N,)   1=target, 2=non-target
    event_samples : (N,)   onset sample indices
    """
    pre   = int(round(-tmin * fs))
    post  = int(round(tmax  * fs))
    T     = pre + post
    n_total = data.shape[0]

    event_mask = (markers == MARKER_TARGET) | (markers == MARKER_NONTARGET)
    diff_mask  = np.diff(event_mask.astype(np.int32), prepend=0)
    onsets     = np.nonzero(diff_mask > 0)[0]
    on_labels  = markers[onsets].astype(np.int32)

    ep_list, lbl_list, smp_list = [], [], []
    dropped = 0
    for idx, lbl in zip(onsets, on_labels):
        s0, s1 = idx - pre, idx + post
        if s0 < 0 or s1 > n_total:
            dropped += 1
            continue
        ep_list.append(data[s0:s1, :].T)   # (C, T)
        lbl_list.append(int(lbl))
        smp_list.append(int(idx))

    if dropped:
        logger.warning("Dropped %d boundary epochs.", dropped)

    epochs       = np.array(ep_list,  dtype=np.float64)
    labels       = np.array(lbl_list, dtype=np.int32)
    event_smpls  = np.array(smp_list, dtype=np.int64)
    return epochs, labels, event_smpls


def _baseline_correct(
    epochs: np.ndarray,
    fs: float,
    tmin: float = EPOCH_TMIN,
    bl_end: float = BASELINE_END,
) -> np.ndarray:
    """Subtract pre-stimulus mean from every epoch/channel.

    Parameters
    ----------
    epochs : (N, C, T)
    """
    n_bl = int(round((bl_end - tmin) * fs))
    bl_mean = epochs[:, :, :n_bl].mean(axis=2, keepdims=True)
    return (epochs - bl_mean).astype(np.float64)


def _reject_artefacts(
    epochs: np.ndarray,
    labels: np.ndarray,
    event_samples: np.ndarray,
    threshold: float = AMPLITUDE_THRESHOLD,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Discard epochs where any channel/sample exceeds amplitude threshold."""
    peak = np.max(np.abs(epochs), axis=(1, 2))
    keep = peak <= threshold
    n_drop = int(np.sum(~keep))
    if n_drop:
        logger.warning("Artefact rejection: removed %d/%d epochs.", n_drop, len(epochs))
    return epochs[keep], labels[keep], event_samples[keep]


# ---------------------------------------------------------------------------
# .mat loader (HDF5 → scipy fallback, RSVP-schema aware)
# ---------------------------------------------------------------------------

def _load_mat(
    mat_path: Path,
) -> Tuple[np.ndarray, np.ndarray, List[str], float]:
    """Load raw EEG from a MATLAB .mat file.

    Returns
    -------
    data     : (n_samples, 32)   float64  µV
    markers  : (n_samples,)      int32    1=target, 2=non-target, 0=none
    chan_names : list[str]
    fs       : float
    """
    if not mat_path.exists():
        raise FileNotFoundError(f"Mat file not found: {mat_path}")

    # ── Attempt 1: MATLAB v7.3 / HDF5 (RSVP schema) ──────────────────────
    try:
        import h5py

        with h5py.File(str(mat_path), "r") as f:
            logger.info("Loading %s via h5py (RSVP HDF5 schema).", mat_path.name)

            # RSVP dataset structure — try canonical paths first
            def _try(keys):
                for k in keys:
                    if k in f:
                        return np.array(f[k])
                return None

            data = _try(["/RSVP/data", "Signal", "signal", "X", "data", "eeg"])
            if data is None:
                raise KeyError(f"EEG data not found. Keys: {list(f.keys())}")

            if data.ndim == 2 and data.shape[0] < data.shape[1]:
                data = data.T   # → (T, C)

            # Markers
            markers_raw = _try([
                "/RSVP/markers_target", "Flashing", "flashing",
                "StimulusType", "stimulus_type", "y", "markers",
            ])
            if markers_raw is not None:
                markers = markers_raw.ravel().astype(np.int32)
            else:
                st = _try(["StimulusType", "stimulus_type"])
                sc = _try(["StimulusCode", "stimulus_code"])
                if st is not None and sc is not None:
                    st = st.ravel().astype(np.int32)
                    sc = sc.ravel().astype(np.int32)
                    markers = np.where(
                        sc > 0,
                        np.where(st == 1, MARKER_TARGET, MARKER_NONTARGET),
                        0,
                    ).astype(np.int32)
                else:
                    raise KeyError("Cannot reconstruct markers.")

            # Sampling rate
            fs_arr = _try(["/RSVP/srate", "fs", "Fs", "srate", "SampleRate"])
            fs = float(fs_arr.ravel()[0]) if fs_arr is not None else FS

            # Channel names — RSVP schema: /RSVP/chanlocs/labels
            chan_names: List[str] = []
            lbl_ref = None
            if "/RSVP/chanlocs/labels" in f:
                lbl_ref = f["/RSVP/chanlocs/labels"]
            elif "chanlocs" in f:
                g = f["chanlocs"]
                if "labels" in g:
                    lbl_ref = g["labels"]

            if lbl_ref is not None:
                try:
                    for i in range(lbl_ref.shape[0]):
                        ref = lbl_ref[i, 0]
                        codes = f[ref][()].flatten()
                        chan_names.append("".join(chr(int(c)) for c in codes))
                except Exception:
                    chan_names = []

            if not chan_names:
                # Fallback: standard 32-ch names matching bci_pipeline config
                chan_names = [
                    "FP1", "AF3", "F7", "F3", "FC1", "FC5", "T7", "C3",
                    "CP1", "CP5", "P7", "P3", "Pz", "PO3", "O1", "Oz",
                    "O2", "PO4", "P4", "P8", "CP6", "CP2", "C4", "T8",
                    "FC6", "FC2", "F4", "F8", "AF4", "FP2", "FZ", "Cz",
                ]

            return data.astype(np.float64), markers, chan_names, fs

    except (OSError, ImportError) as err:
        logger.warning("h5py failed (%s). Trying scipy.io.loadmat…", err)

    # ── Attempt 2: Old MATLAB format ──────────────────────────────────────
    import scipy.io as sio
    mat = sio.loadmat(str(mat_path))
    data_key = next(
        (k for k in mat if not k.startswith("__") and
         isinstance(mat[k], np.ndarray) and mat[k].ndim == 2),
        None,
    )
    if data_key is None:
        raise KeyError(f"No 2D array in scipy-loaded mat. Keys: {list(mat.keys())}")
    data = mat[data_key].astype(np.float64)
    if data.shape[0] < data.shape[1]:
        data = data.T

    mk_key = next(
        (k for k in ["Flashing", "flashing", "y", "StimulusType", "markers"] if k in mat),
        None,
    )
    markers = mat[mk_key].ravel().astype(np.int32) if mk_key else np.zeros(data.shape[0], dtype=np.int32)
    fs_key  = next((k for k in ["fs", "Fs", "srate"] if k in mat), None)
    fs      = float(mat[fs_key].ravel()[0]) if fs_key else FS
    chan_names = [f"CH{i+1}" for i in range(data.shape[1])]
    return data, markers, chan_names, fs


# ---------------------------------------------------------------------------
# Module 1 public API — single-epoch real-time path
# ---------------------------------------------------------------------------

def preprocess_epoch(
    raw_epoch: np.ndarray,
    fs: float = FS,
    already_filtered: bool = False,
) -> "torch.Tensor":
    """Preprocess a single raw EEG epoch for EEGNet inference.

    Parameters
    ----------
    raw_epoch : np.ndarray
        Shape ``(n_channels, n_samples)`` **or** ``(n_samples, n_channels)``.
        Raw EEG in µV, covering at minimum the −100 ms → +800 ms window
        (460 samples @ 512 Hz) or more.
    fs : float
        Sampling rate in Hz (default 512).
    already_filtered : bool
        If True, skip bandpass filtering (e.g., pre-filtered batch data).

    Returns
    -------
    torch.Tensor  shape ``(1, 1, 32, 256)``  float32, on CPU.

    Notes
    -----
    * If ``raw_epoch`` has fewer than 32 channels, channels are zero-padded.
    * The 256-sample window corresponds to the post-stimulus 0 ms → +500 ms
      interval (samples 51 onward out of the 460-sample epoch, then first 256).
    """
    import torch

    epoch = np.array(raw_epoch, dtype=np.float64)

    # Ensure (n_channels, n_samples)
    if epoch.ndim == 2 and epoch.shape[0] > epoch.shape[1]:
        epoch = epoch.T   # was (T, C) → (C, T)

    C, T = epoch.shape

    # ── Step 1: Bandpass filter ──────────────────────────────────────────
    if not already_filtered:
        # Filter operates on (T, C); transpose in/out
        epoch = butter_bandpass(epoch.T, fs=fs).T   # back to (C, T)

    # ── Step 2: Baseline correction ───────────────────────────────────────
    n_pre = int(round(abs(EPOCH_TMIN) * fs))        # 51 samples @ 512 Hz
    if T >= n_pre:
        bl_mean = epoch[:, :n_pre].mean(axis=1, keepdims=True)
        epoch   = epoch - bl_mean

    # ── Step 3: Pad channels to 32 if needed ─────────────────────────────
    if C < N_CHANNELS:
        pad = np.zeros((N_CHANNELS - C, T), dtype=np.float64)
        epoch = np.vstack([epoch, pad])
    elif C > N_CHANNELS:
        epoch = epoch[:N_CHANNELS, :]

    # ── Step 4: Crop to post-stimulus 256-sample window ──────────────────
    # Start at sample n_pre (stimulus onset), take next 256 samples
    post_start = n_pre
    post_end   = post_start + N_SAMPLES_EEGNET
    if epoch.shape[1] >= post_end:
        epoch_256 = epoch[:, post_start:post_end]
    else:
        # Pad with zeros if epoch is shorter than expected
        available = epoch[:, post_start:]
        pad_len   = N_SAMPLES_EEGNET - available.shape[1]
        epoch_256 = np.hstack([available, np.zeros((N_CHANNELS, pad_len))])

    # ── Step 5: Format as (1, 1, 32, 256) float32 tensor ─────────────────
    tensor = torch.from_numpy(epoch_256.astype(np.float32)).unsqueeze(0).unsqueeze(0)
    # Shape: (1, 32, 256) → unsqueeze(0) → (1, 1, 32, 256)
    # Actually: epoch_256 shape (32, 256) → unsqueeze(0) → (1, 32, 256) → unsqueeze(0) → (1, 1, 32, 256)
    return tensor


# ---------------------------------------------------------------------------
# Module 1 public API — batch path (for diagnostics, injector, tests)
# ---------------------------------------------------------------------------

def load_and_preprocess_full(
    mat_path: str | Path,
    *,
    amplitude_threshold: float = AMPLITUDE_THRESHOLD,
    verbose: bool = True,
) -> PreprocessResult:
    """Load a .mat file and run the full batch preprocessing pipeline.

    Parameters
    ----------
    mat_path : str | Path
        Path to a MATLAB .mat EEG file (HDF5 or legacy format).
    amplitude_threshold : float
        Artefact rejection ceiling in µV (default 100).
    verbose : bool
        Print step-by-step progress.

    Returns
    -------
    PreprocessResult
        Contains ``epochs_full`` (N,32,T_raw), ``epochs_256`` (N,32,256),
        ``labels``, ``chan_names``, ``fs``, ``event_samples``.
    """
    mat_path = Path(mat_path).resolve()

    if verbose:
        print(f"\n[prep_engine] Loading {mat_path.name} …")

    # 1. Load raw data
    raw_data, markers, chan_names, fs = _load_mat(mat_path)
    if verbose:
        print(f"  Raw shape : {raw_data.shape}  (samples × channels)")
        print(f"  fs        : {fs} Hz  |  channels: {len(chan_names)}")

    # 2. Bandpass filter
    data_filt = butter_bandpass(raw_data, fs=fs)
    if verbose:
        print(f"  Filtered  : {BANDPASS_LO}–{BANDPASS_HI} Hz")

    # 3. Extract epochs
    epochs_full, labels, event_smpls = _extract_epochs(data_filt, markers, fs)
    if verbose:
        n_t  = int(np.sum(labels == MARKER_TARGET))
        n_nt = int(np.sum(labels == MARKER_NONTARGET))
        print(f"  Epochs    : {len(labels)} ({n_t} target, {n_nt} non-target) | shape {epochs_full.shape}")

    # 4. Baseline correction
    epochs_full = _baseline_correct(epochs_full, fs)

    # 5. Artefact rejection
    epochs_full, labels, event_smpls = _reject_artefacts(
        epochs_full, labels, event_smpls, threshold=amplitude_threshold
    )

    # 6. Crop to post-stimulus 256-sample window
    n_pre     = int(round(abs(EPOCH_TMIN) * fs))
    post_end  = n_pre + N_SAMPLES_EEGNET
    T_full    = epochs_full.shape[2]

    if T_full >= post_end:
        epochs_256 = epochs_full[:, :, n_pre:post_end]
    else:
        available  = epochs_full[:, :, n_pre:]
        pad_len    = N_SAMPLES_EEGNET - available.shape[2]
        epochs_256 = np.concatenate(
            [available, np.zeros((len(labels), N_CHANNELS, pad_len))], axis=2
        )

    # Pad channels to 32 if needed
    C_actual = epochs_256.shape[1]
    if C_actual < N_CHANNELS:
        pad = np.zeros((len(labels), N_CHANNELS - C_actual, N_SAMPLES_EEGNET))
        epochs_256 = np.concatenate([epochs_256, pad], axis=1)
    elif C_actual > N_CHANNELS:
        epochs_256 = epochs_256[:, :N_CHANNELS, :]

    if verbose:
        print(f"\n[prep_engine] ✅  Done:")
        print(f"  epochs_full  : {epochs_full.shape}")
        print(f"  epochs_256   : {epochs_256.shape}")
        print(f"  labels       : {epochs_256.shape[0]} epochs")

    return PreprocessResult(
        epochs_full   = epochs_full.astype(np.float64),
        epochs_256    = epochs_256.astype(np.float64),
        labels        = labels,
        chan_names    = chan_names[:N_CHANNELS] if len(chan_names) >= N_CHANNELS else chan_names,
        fs            = fs,
        event_samples = event_smpls,
    )


# ---------------------------------------------------------------------------
# Convenience: batch preprocess_epoch for a numpy array (N, C, T) → Tensor
# ---------------------------------------------------------------------------

def batch_preprocess(
    epochs: np.ndarray,
    fs: float = FS,
) -> "torch.Tensor":
    """Convert a batch of (N, 32, T) pre-filtered, baseline-corrected epochs
    into an EEGNet-ready tensor ``(N, 1, 32, 256)``.

    Parameters
    ----------
    epochs : np.ndarray   shape (N, 32, T)
        Already baseline-corrected epochs (output from load_and_preprocess_full).
    fs : float

    Returns
    -------
    torch.Tensor  shape (N, 1, 32, 256)
    """
    import torch

    N, C, T = epochs.shape
    n_pre   = int(round(abs(EPOCH_TMIN) * fs))
    post_end = n_pre + N_SAMPLES_EEGNET

    if T >= post_end:
        ep256 = epochs[:, :N_CHANNELS, n_pre:post_end]
    else:
        avail  = epochs[:, :N_CHANNELS, n_pre:]
        p_len  = N_SAMPLES_EEGNET - avail.shape[2]
        ep256  = np.concatenate([avail, np.zeros((N, N_CHANNELS, p_len))], axis=2)

    # Ensure exactly N_CHANNELS channels
    if ep256.shape[1] < N_CHANNELS:
        pad = np.zeros((N, N_CHANNELS - ep256.shape[1], N_SAMPLES_EEGNET))
        ep256 = np.concatenate([ep256, pad], axis=1)

    tensor = torch.from_numpy(ep256[:, np.newaxis, :, :].astype(np.float32))
    return tensor   # (N, 1, 32, 256)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="prep_engine — preprocess an EEG .mat file")
    parser.add_argument("--mat", required=True, help="Path to .mat file")
    args = parser.parse_args()

    res = load_and_preprocess_full(args.mat)
    print(res.summary())
