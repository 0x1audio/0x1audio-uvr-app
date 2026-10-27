"""Separate a stereo mix into stems.

The screen follows Ultimate Vocal Remover: a process method, a model, and the
same controls. The models here are presets for this worker. They are not the
UVR weight files.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

AUDIO = {".wav", ".flac", ".ogg", ".aiff", ".aif", ".mp3", ".m4a"}

PRESETS = {
    "vr": {
        "1_HP-UVR": {"window": 1024, "aggression": 70, "karaoke": False},
        "2_HP-UVR": {"window": 2048, "aggression": 55, "karaoke": False},
        "3_HP-UVR": {"window": 512, "aggression": 80, "karaoke": False},
        "4_HP-UVR": {"window": 320, "aggression": 40, "karaoke": False},
        "5_HP-Karaoke-UVR": {"window": 1024, "aggression": 85, "karaoke": True},
        "6_HP-Karaoke-UVR": {"window": 2048, "aggression": 90, "karaoke": True},
    },
    "mdx": {
        "UVR-MDX-NET Inst HQ 3": {"window": 2048, "aggression": 62, "karaoke": False},
        "UVR-MDX-NET Voc FT": {"window": 2048, "aggression": 78, "karaoke": False},
        "UVR-MDX-NET Kim Vocal 2": {"window": 1024, "aggression": 74, "karaoke": False},
        "UVR-MDX-NET Main": {"window": 2048, "aggression": 50, "karaoke": False},
    },
    "demucs": {
        "htdemucs": {"window": 2048, "aggression": 60, "karaoke": False, "stems": 4},
        "htdemucs_ft": {"window": 4096, "aggression": 68, "karaoke": False, "stems": 4},
        "hdemucs_mmi": {"window": 2048, "aggression": 58, "karaoke": False, "stems": 4},
        "mdx_extra": {"window": 2048, "aggression": 72, "karaoke": False, "stems": 2},
    },
}


def models(method: str) -> list[str]:
    table = PRESETS.get(method)
    if table is None:
        raise ValueError("Choose VR Architecture, MDX-Net, Demucs, or Ensemble.")
    return list(table)


def separate_file(
    source: str,
    output_dir: str,
    *,
    method: str,
    model: str,
    secondary: str | None,
    algorithm: str,
    stems: list[str],
    audio_format: str,
    segment: float,
    overlap: float,
    aggression: float | None,
    window: int | None,
    shifts: int,
    denoise: bool,
    high_end: bool,
    tta: bool,
    on_progress,
) -> list[str]:
    path = Path(source)
    if path.suffix.lower() not in AUDIO or not path.is_file():
        raise ValueError(f"{path.name} is not a supported audio file.")
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    audio, rate = sf.read(str(path), always_2d=True, dtype="float32")
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    preset = _preset(method, model)
    other = _preset(method, secondary) if method == "ensemble" and secondary else None
    strength = preset["aggression"] if aggression is None else float(aggression)
    size = int(window or preset["window"])
    if size < 320 or size > 8192:
        raise ValueError("Window size is out of range.")
    hops = max(1, int(shifts))
    masks = [_mask(audio, rate, size, strength, bool(preset["karaoke"]), denoise, high_end)]
    if tta or hops > 1:
        masks.append(_mask(audio[::-1], rate, size, strength, bool(preset["karaoke"]), denoise, high_end)[::-1])
    for index in range(1, hops):
        shift = index * (size // 8)
        rolled = np.roll(audio, shift, axis=0)
        moved = _mask(rolled, rate, size, strength, bool(preset["karaoke"]), denoise, high_end)
        masks.append(np.roll(moved, -shift, axis=0))
    vocal = _combine(masks, "avg")
    if other is not None:
        second = _mask(audio, rate, int(other["window"]), float(other["aggression"]), bool(other["karaoke"]), denoise, high_end)
        vocal = _combine([vocal, second], algorithm)
    on_progress(0.7)
    vocal = _chunk(vocal, audio, rate, segment, overlap)
    instrumental = np.clip(audio - vocal, -1, 1)
    vocal = np.clip(vocal, -1, 1)
    written = _write_stems(path.stem, destination, audio_format, rate, vocal, instrumental, audio, stems, int(preset.get("stems", 2)))
    on_progress(1)
    return written


def _preset(method: str, model: str | None) -> dict:
    if method == "ensemble":
        method = "mdx"
    table = PRESETS.get(method)
    if not table or not model or model not in table:
        raise ValueError("Choose a model.")
    return table[model]


def _mask(audio: np.ndarray, rate: int, window: int, aggression: float, karaoke: bool, denoise: bool, high_end: bool) -> np.ndarray:
    left = audio[:, 0]
    right = audio[:, 1]
    mid = (left + right) * 0.5
    side = (left - right) * 0.5
    hop = max(window // 4, 1)
    mid_spec = _stft(mid, window, hop)
    side_spec = _stft(side, window, hop)
    mid_mag = np.abs(mid_spec)
    side_mag = np.abs(side_spec)
    center = mid_mag / (mid_mag + side_mag + 1e-8)
    threshold = 0.62 - 0.28 * (float(np.clip(aggression, 0, 100)) / 100)
    mask = np.clip((center - threshold) / 0.22, 0, 1)
    if karaoke:
        mask = 1 - mask
    if denoise:
        mask = _smooth(mask, 3)
    vocal_spec = mid_spec * mask
    if high_end:
        keep = int(window * 16000 / max(rate, 1))
        vocal_spec[keep:] *= 0.25
    vocal_mid = _istft(vocal_spec, window, hop, len(mid))
    stereo = np.stack((vocal_mid, vocal_mid), axis=1)
    return stereo.astype(np.float32)


def _stft(channel: np.ndarray, window: int, hop: int) -> np.ndarray:
    padded = np.pad(channel, (window // 2, window // 2))
    count = 1 + max(0, (len(padded) - window) // hop)
    if count <= 0:
        return np.zeros((window // 2 + 1, 1), dtype=np.complex64)
    shape = (count, window)
    strides = (hop * padded.strides[0], padded.strides[0])
    framed = np.lib.stride_tricks.as_strided(padded, shape=shape, strides=strides)
    taper = np.hanning(window).astype(np.float32)
    return np.fft.rfft(framed * taper, axis=1).T.astype(np.complex64)


def _istft(spec: np.ndarray, window: int, hop: int, length: int) -> np.ndarray:
    taper = np.hanning(window).astype(np.float32)
    frames = np.fft.irfft(spec.T, n=window, axis=1).astype(np.float32) * taper
    padded = length + window
    output = np.zeros(padded, dtype=np.float32)
    weight = np.zeros(padded, dtype=np.float32)
    for index, frame in enumerate(frames):
        start = index * hop
        output[start : start + window] += frame
        weight[start : start + window] += taper**2
    weight = np.maximum(weight, 1e-8)
    restored = output / weight
    start = window // 2
    return restored[start : start + length]


def _smooth(mask: np.ndarray, width: int) -> np.ndarray:
    kernel = np.ones(width, dtype=np.float32) / width
    smoothed = np.empty_like(mask)
    for index, row in enumerate(mask):
        smoothed[index] = np.convolve(row, kernel, mode="same")
    return smoothed


def _combine(masks: list[np.ndarray], algorithm: str) -> np.ndarray:
    stack = np.stack([_fit(mask, masks[0].shape[0]) for mask in masks], axis=0)
    if algorithm == "max":
        mixed = np.max(stack, axis=0)
    elif algorithm == "min":
        mixed = np.min(stack, axis=0)
    else:
        mixed = np.mean(stack, axis=0)
    return mixed.astype(np.float32)


def _fit(audio: np.ndarray, length: int) -> np.ndarray:
    if len(audio) == length:
        return audio
    if len(audio) > length:
        return audio[:length]
    return np.pad(audio, ((0, length - len(audio)), (0, 0)))


def _chunk(vocal: np.ndarray, mix: np.ndarray, rate: int, segment: float, overlap: float) -> np.ndarray:
    seconds = float(np.clip(segment, 1, 60))
    size = max(int(rate * seconds), 1)
    if len(mix) <= size:
        return vocal
    fade = int(size * float(np.clip(overlap, 0, 0.9)))
    output = np.zeros_like(vocal)
    weight = np.zeros((len(vocal), 1), dtype=np.float32)
    cursor = 0
    while cursor < len(vocal):
        end = min(cursor + size, len(vocal))
        window = np.ones((end - cursor, 1), dtype=np.float32)
        if fade > 1 and end - cursor > fade:
            if cursor > 0:
                window[:fade, 0] = np.linspace(0, 1, fade, dtype=np.float32)
            if end < len(vocal):
                window[-fade:, 0] = np.linspace(1, 0, fade, dtype=np.float32)
        output[cursor:end] += vocal[cursor:end] * window
        weight[cursor:end] += window
        if end == len(vocal):
            break
        cursor += max(size - fade, 1)
    return output / np.maximum(weight, 1e-8)


def _write_stems(name: str, folder: Path, audio_format: str, rate: int, vocal, instrumental, mix, stems: list[str], count: int) -> list[str]:
    chosen = [stem for stem in stems if isinstance(stem, str)]
    if not chosen:
        raise ValueError("Choose at least one stem.")
    parts = {"Vocals": vocal, "Instrumental": instrumental}
    if count == 4:
        bass, drums, other = _split_four(instrumental, mix, rate)
        parts.update({"Bass": bass, "Drums": drums, "Other": other})
    suffix = ".flac" if audio_format == "flac" else ".wav"
    subtype = "PCM_16"
    written = []
    for stem in chosen:
        audio = parts.get(stem)
        if audio is None:
            continue
        target = folder / f"{name}_({stem}){suffix}"
        sf.write(str(target), audio, rate, subtype=subtype)
        written.append(str(target))
    if not written:
        raise ValueError("Choose at least one stem.")
    return written


def _split_four(instrumental: np.ndarray, mix: np.ndarray, rate: int):
    spectrum = np.fft.rfft(instrumental, axis=0)
    bins = spectrum.shape[0]
    bass_bin = max(1, int(bins * 160 / max(rate / 2, 1)))
    bass_spec = np.zeros_like(spectrum)
    bass_spec[:bass_bin] = spectrum[:bass_bin]
    bass = np.fft.irfft(bass_spec, n=len(instrumental), axis=0).astype(np.float32)
    residual = instrumental - bass
    blurred = _blur(residual, max(1, rate // 80))
    drums = np.clip(residual - blurred, -1, 1)
    other = np.clip(blurred, -1, 1)
    return bass, drums, other


def _blur(audio: np.ndarray, width: int) -> np.ndarray:
    kernel = np.ones(width, dtype=np.float32) / width
    blurred = np.empty_like(audio)
    for channel in range(audio.shape[1]):
        blurred[:, channel] = np.convolve(audio[:, channel], kernel, mode="same")
    return blurred
