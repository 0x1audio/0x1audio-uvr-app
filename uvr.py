"""Vocal Extractor. One action, split: quality picks a larger Demucs model; the run itself matches UVR."""

from __future__ import annotations

import time
import traceback
from pathlib import Path

import ox1audio as ox

from separate import separate_file

# Official UVR Demucs defaults: segment Default, overlap 0.25, shifts 2, split on.
# Fast is the smaller hybrid. Standard is Demucs v4. Best is the fine-tuned bag of four.
_QUALITY = {
    "fast": "hdemucs_mmi",
    "standard": "htdemucs",
    "best": "htdemucs_ft",
}


@ox.action("Split song", timeout=3 * 3600)
def split(
    song: ox.Files("audio", multiple=False),
    quality: ox.Choice("fast", "standard", "best") = "standard",
    format: ox.Choice("mp3", "wav", "flac", "ogg", label="File type") = "mp3",
    output: ox.Folder(label="Save to") | None = None,
):
    """Split one song into its vocals and the music without them, next to the song or in output."""
    written = _separate([str(song)], str(output or song.parent), _QUALITY[quality], format)
    return [ox.sound(path, title=Path(path).stem) for path in written]


def _separate(files: list[str], output: str, quality: str, audio_format: str) -> list[str]:
    written: list[str] = []
    started = time.perf_counter()
    total = len(files)
    folder = Path(output)
    source_name = Path(files[0]).stem if files else ""
    before = {item.name for item in _owned(folder, source_name)}
    try:
        for index, source in enumerate(files):
            state = {"fraction": index / total, "label": "Getting ready"}
            ox.progress(state["fraction"], state["label"])

            def on_progress(fraction: float, index=index, total=total, state=state) -> None:
                _show(state, (index + max(0, min(1, fraction))) / total)

            def on_status(text: str, state=state) -> None:
                _show(state, state["fraction"], _phase(text, "Separating vocals"))

            gpu = _use_gpu()
            try:
                produced = _separate_one(source, output, quality, audio_format, gpu, on_progress, on_status)
            except (ox.Cancelled, ox.Problem, ValueError):
                raise
            except Exception:
                if not gpu:
                    raise
                traceback.print_exc()
                _cleanup(folder, source_name, before)
                state["fraction"] = index / total
                state["label"] = "Getting ready"
                ox.progress(state["fraction"], state["label"])
                produced = _separate_one(source, output, quality, audio_format, False, on_progress, on_status)
            written.extend(_present(path) for path in produced)
    except ox.Cancelled:
        _cleanup(folder, source_name, before)
        raise
    except (ox.Problem, ValueError) as exc:
        _cleanup(folder, source_name, before)
        raise ox.Problem(_plain(str(exc))) from exc
    except Exception as exc:
        traceback.print_exc()
        _cleanup(folder, source_name, before)
        raise ox.Problem("This song couldn't be separated. Try it again.") from exc
    ox.progress(1, "Both files are ready.")
    print(f"Split {source_name} in {time.strftime('%H:%M:%S', time.gmtime(int(time.perf_counter() - started)))}")
    return written


def _separate_one(source, output, quality, audio_format, gpu, on_progress, on_status):
    return separate_file(
        source,
        output,
        method="demucs",
        model=quality,
        secondary=None,
        algorithm="avg",
        stems=["Vocals", "Instrumental"],
        audio_format=audio_format,
        segment="Default",
        overlap=0.25,
        aggression=None,
        window=None,
        shifts=2,
        denoise=False,
        high_end=False,
        tta=False,
        gpu=gpu,
        on_progress=on_progress,
        on_status=on_status,
        console_prefix="",
    )


def _show(state: dict, fraction: float, label: str | None = None) -> None:
    state["fraction"] = max(state["fraction"], min(1, fraction))
    if label:
        state["label"] = label
    ox.progress(state["fraction"], state["label"])  # raises ox.Cancelled after Stop


def _phase(text: str, working: str) -> str | None:
    lowered = " ".join(str(text).split()).lower()
    if not lowered or lowered in {"done!", "done"}:
        return None
    if lowered.startswith("downloading model"):
        return " ".join(str(text).split())
    if "download" in lowered:
        return "Downloading model"
    if "install" in lowered or "runtime" in lowered:
        return "Getting ready"
    if "loading" in lowered:
        return "Loading the model"
    if "sav" in lowered or "export" in lowered:
        return "Saving"
    if "inference" in lowered or "process" in lowered:
        return working
    return None


def _use_gpu() -> bool:
    try:
        import torch
    except Exception:
        return False
    try:
        if torch.cuda.is_available():
            return True
    except Exception:
        pass
    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is None:
        return False
    try:
        return bool(mps.is_available())
    except Exception:
        return False


def _present(path: str) -> str:
    file = Path(path)
    name = file.name.replace("_(Vocals)", " (Vocals)").replace("_(Instrumental)", " (Music)")
    target = _unused(file.with_name(name))
    if target != file:
        file.replace(target)
    return str(target)


def _owned(folder: Path, stem: str):
    if not folder.is_dir() or not stem:
        return []
    return [child for child in folder.iterdir() if child.is_file() and child.name.startswith(stem)]


def _cleanup(folder: Path, stem: str, before: set[str]) -> None:
    for child in _owned(folder, stem):
        if child.name not in before:
            child.unlink(missing_ok=True)


def _unused(path: Path) -> Path:
    if not path.exists():
        return path
    number = 2
    while True:
        candidate = path.with_name(f"{path.stem} {number}{path.suffix}")
        if not candidate.exists():
            return candidate
        number += 1


def _plain(text: str) -> str:
    lowered = text.lower()
    if "download this model" in lowered:
        return "There isn't enough free space to download this model."
    if "stopped before it finished" in lowered:
        return "The model download stopped before it finished. Try it again."
    if "not a supported audio file" in lowered:
        return "That file isn't a song this app can read. Try an MP3, WAV, or M4A."
    if "no such file" in lowered or "not found" in lowered:
        return "That file can't be found. Choose it again."
    if "no space" in lowered or "not enough" in lowered:
        return "There isn't enough free space to save the two files."
    if "permission" in lowered:
        return "Those files can't be saved in that folder. Choose another folder."
    if text in {
        "Add a song first.",
        "That file isn't a song this app can read. Try an MP3, WAV, or M4A.",
        "That file can't be found. Choose it again.",
        "There isn't enough free space to save the two files.",
        "Those files can't be saved in that folder. Choose another folder.",
        "This song couldn't be separated. Try it again.",
        "There isn't enough free space to download this model.",
        "The model download stopped before it finished. Try it again.",
    }:
        return text
    return "This song couldn't be separated. Try it again."

