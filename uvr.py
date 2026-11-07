"""Vocal Extractor worker. Every run uses htdemucs. Quality only changes speed."""

from __future__ import annotations

import time
import traceback
from pathlib import Path

from ox1audio import job, library, run

from separate import separate_file

# Fast is the quick pass. Best spends more time on the same htdemucs model.
_QUALITY = {
    "fast": {"segment": 7, "overlap": 0.1, "shifts": 0},
    "standard": {"segment": 8, "overlap": 0.25, "shifts": 1},
    "best": {"segment": 8, "overlap": 0.5, "shifts": 2},
}
_QUALITY["low"] = _QUALITY["fast"]
_QUALITY["medium"] = _QUALITY["standard"]
_QUALITY["high"] = _QUALITY["best"]


class _Stopped(Exception):
    pass


@job
def start(call):
    body = call.body if isinstance(call.body, dict) else {}
    files = body.get("files")
    if not isinstance(files, list) or not all(isinstance(item, str) and item for item in files):
        raise ValueError("Add a song first.")
    output = body.get("output")
    if not isinstance(output, str) or not output:
        output = str(Path(files[0]).parent)
    quality = _QUALITY.get(body.get("quality"), _QUALITY["standard"])
    audio_format = body.get("format") if body.get("format") in {"wav", "flac", "mp3", "ogg"} else "mp3"
    return _separate(call, files[:1], output, quality, audio_format)


def _separate(call, files: list[str], output: str, quality: dict, audio_format: str) -> dict:
    written: list[str] = []
    started = time.perf_counter()
    total = len(files)
    folder = Path(output)
    source_name = Path(files[0]).stem if files else ""
    before = {item.name for item in folder.glob(f"{source_name}*")} if folder.is_dir() and source_name else set()
    try:
        for index, source in enumerate(files):
            state = {"fraction": index / total, "label": "Getting ready"}
            call.progress(state["fraction"], state["label"])

            def on_progress(fraction: float, index=index, total=total, state=state) -> None:
                _show(call, state, (index + max(0, min(1, fraction))) / total)

            def on_status(text: str, state=state) -> None:
                _show(call, state, state["fraction"], _phase(text, "Separating vocals"))

            if _cancelled(call):
                return {"outputs": [], "stopped": True}
            gpu = _use_gpu()
            try:
                produced = _separate_one(source, output, quality, audio_format, gpu, on_progress, on_status)
            except _Stopped:
                raise
            except Exception:
                if not gpu:
                    raise
                traceback.print_exc()
                _cleanup(folder, source_name, before)
                state["fraction"] = index / total
                state["label"] = "Getting ready"
                call.progress(state["fraction"], state["label"])
                produced = _separate_one(source, output, quality, audio_format, False, on_progress, on_status)
            written.extend(_present(path) for path in produced)
    except _Stopped:
        _cleanup(folder, source_name, before)
        return {"outputs": [], "stopped": True}
    except ValueError as exc:
        _cleanup(folder, source_name, before)
        raise ValueError(_plain(str(exc))) from exc
    except Exception as exc:
        traceback.print_exc()
        _cleanup(folder, source_name, before)
        raise ValueError("This song couldn't be separated. Try it again.") from exc
    for path in written:
        library.add("sound", path, Path(path).stem)
    call.progress(1, "Both files are ready.")
    return {"outputs": written, "elapsed": time.strftime("%H:%M:%S", time.gmtime(int(time.perf_counter() - started)))}


def _separate_one(source, output, quality, audio_format, gpu, on_progress, on_status):
    return separate_file(
        source,
        output,
        method="demucs",
        model="htdemucs",
        secondary=None,
        algorithm="avg",
        stems=["Vocals", "Instrumental"],
        audio_format=audio_format,
        segment=quality["segment"],
        overlap=quality["overlap"],
        aggression=None,
        window=None,
        shifts=quality["shifts"],
        denoise=False,
        high_end=False,
        tta=False,
        gpu=gpu,
        on_progress=on_progress,
        on_status=on_status,
        console_prefix="",
    )


def _show(call, state: dict, fraction: float, label: str | None = None) -> None:
    if _cancelled(call):
        raise _Stopped()
    state["fraction"] = max(state["fraction"], min(1, fraction))
    if label:
        state["label"] = label
    call.progress(state["fraction"], state["label"])


def _phase(text: str, working: str) -> str | None:
    lowered = " ".join(str(text).split()).lower()
    if not lowered or lowered in {"done!", "done"}:
        return None
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


def _cancelled(call) -> bool:
    check = getattr(call, "cancelled", None)
    return bool(check()) if callable(check) else False


def _present(path: str) -> str:
    file = Path(path)
    name = file.name.replace("_(Vocals)", " (Vocals)").replace("_(Instrumental)", " (Music)")
    target = _unused(file.with_name(name))
    if target != file:
        file.replace(target)
    return str(target)


def _cleanup(folder: Path, stem: str, before: set[str]) -> None:
    if not folder.is_dir() or not stem:
        return
    for child in folder.glob(f"{stem}*"):
        if child.is_file() and child.name not in before:
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
    }:
        return text
    return "This song couldn't be separated. Try it again."


if __name__ == "__main__":
    run()
