"""Ultimate Vocal Remover worker. The page asks the host to start a separation."""

from __future__ import annotations

import time
from pathlib import Path

from ox1audio import job, library, run

from separate import DownloadCancelled, available_models, download_named, separate_file


def models(call):
    body = call.body if isinstance(call.body, dict) else {}
    return available_models(refresh=body.get("refresh") is True)


@job
def start(call):
    body = call.body if isinstance(call.body, dict) else {}
    files = body.get("files")
    if not isinstance(files, list) or not all(isinstance(item, str) and item for item in files):
        raise ValueError("Choose an audio file.")
    output = body.get("output")
    if not isinstance(output, str) or not output:
        output = str(Path(files[0]).parent)
    stems = body.get("stems")
    if not isinstance(stems, list):
        stems = ["Vocals", "Instrumental"]
    return _separate(call, files, output, body, stems)


@job
def download(call):
    body = call.body if isinstance(call.body, dict) else {}
    method = body.get("method")
    model = body.get("model")
    if method not in {"vr", "mdx", "demucs"} or not isinstance(model, str) or not model:
        raise ValueError("No Model Selected")
    state = {"fraction": 0.0}

    def on_progress(fraction: float) -> None:
        state["fraction"] = fraction
        call.progress(fraction, "")

    def on_status(message: object) -> None:
        call.progress(state["fraction"], str(message).strip())

    try:
        download_named(method, model, on_progress=on_progress, on_status=on_status, cancel=call.cancelled)
    except DownloadCancelled:
        return {"stopped": True, "message": "Download Stopped", "error": None}
    return {"stopped": False, "message": "Download Complete", "error": None}


def _separate(call, files: list[str], output: str, body: dict, stems: list) -> dict:
    written: list[str] = []
    log: list[str] = []
    started = time.perf_counter()
    total = len(files)
    try:
        for index, source in enumerate(files):
            prefix = f"File {index + 1}/{total} "
            _note(call, log, f'{"" if index == 0 else chr(10)}{prefix}"{Path(source).name}".\n\n', index / total)

            state = {"fraction": index / total}

            def on_progress(fraction: float, index=index, total=total, state=state) -> None:
                state["fraction"] = (index + fraction) / total
                call.progress(state["fraction"], "")

            written.extend(
                separate_file(
                    source,
                    output,
                    method=str(body.get("method") or "vr"),
                    model=str(body.get("model") or ""),
                    secondary=body.get("secondary") if isinstance(body.get("secondary"), str) else None,
                    algorithm=str(body.get("algorithm") or "avg"),
                    stems=[stem for stem in stems if isinstance(stem, str)],
                    audio_format=body.get("format") if body.get("format") in {"wav", "flac", "mp3", "ogg"} else "wav",
                    segment=_number(body.get("segment"), 8),
                    overlap=_number(body.get("overlap"), 0.25),
                    aggression=_optional_number(body.get("aggression")),
                    window=_optional_int(body.get("window")),
                    shifts=int(_number(body.get("shifts"), 2)),
                    denoise=body.get("denoise") is True,
                    high_end=body.get("highEnd") is True,
                    tta=body.get("tta") is True,
                    gpu=body.get("gpu") is True,
                    on_progress=on_progress,
                    on_status=lambda text, state=state: _note(call, log, text, state["fraction"]),
                    console_prefix=prefix,
                )
            )
    except Exception as exc:
        _note(call, log, f"\n\nProcess failed, please see error log\n{exc}\nTime Elapsed: {_elapsed(started)}\n", None)
        raise
    for path in written:
        library.add("sound", path, Path(path).stem)
    _note(call, log, f"\nProcess complete\nTime Elapsed: {_elapsed(started)}\n", 1)
    return {"outputs": written, "log": "".join(log)}


def _note(call, log: list[str], text: str, fraction: float | None) -> None:
    if text:
        log.append(text)
    if fraction is not None:
        call.progress(fraction, text.strip())


def _elapsed(started: float) -> str:
    return time.strftime("%H:%M:%S", time.gmtime(int(time.perf_counter() - started)))


def _number(value, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _optional_number(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value):
    number = _optional_number(value)
    if number is None:
        return None
    return int(number)


if __name__ == "__main__":
    run(models=models)
