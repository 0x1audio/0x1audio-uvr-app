"""Ultimate Vocal Remover worker. The page asks the host to start a separation."""

from __future__ import annotations

import threading
from pathlib import Path

from ox1audio import serve

from separate import separate_file

_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_seq = 0


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
    job = _reserve()
    thread = threading.Thread(target=_run, args=(job, files, output, body, stems), daemon=True)
    thread.start()
    return {"id": job}


def status(call):
    body = call.body if isinstance(call.body, dict) else {}
    job = body.get("id")
    with _lock:
        found = _jobs.get(job) if isinstance(job, str) else None
        if found is None:
            raise ValueError("That separation is not running.")
        return dict(found)


def _reserve() -> str:
    global _seq
    with _lock:
        _seq += 1
        job = str(_seq)
        _jobs[job] = {"progress": 0, "message": "Starting", "done": False, "error": None, "outputs": []}
        if len(_jobs) > 8:
            oldest = next(iter(_jobs))
            if oldest != job:
                _jobs.pop(oldest, None)
        return job


def _update(job: str, **fields) -> None:
    with _lock:
        current = _jobs.get(job)
        if current is not None:
            current.update(fields)


def _run(job: str, files: list[str], output: str, body: dict, stems: list) -> None:
    written: list[str] = []
    try:
        total = len(files)
        for index, source in enumerate(files):
            _update(job, message=f"Separating {Path(source).name}", progress=index / total)

            def on_progress(fraction: float, index=index, total=total) -> None:
                _update(job, progress=(index + fraction) / total)

            written.extend(
                separate_file(
                    source,
                    output,
                    method=str(body.get("method") or "vr"),
                    model=str(body.get("model") or ""),
                    secondary=body.get("secondary") if isinstance(body.get("secondary"), str) else None,
                    algorithm=str(body.get("algorithm") or "avg"),
                    stems=[stem for stem in stems if isinstance(stem, str)],
                    audio_format="flac" if body.get("format") == "flac" else "wav",
                    segment=_number(body.get("segment"), 8),
                    overlap=_number(body.get("overlap"), 0.25),
                    aggression=_optional_number(body.get("aggression")),
                    window=_optional_int(body.get("window")),
                    shifts=int(_number(body.get("shifts"), 1)),
                    denoise=body.get("denoise") is True,
                    high_end=body.get("highEnd") is True,
                    tta=body.get("tta") is True,
                    on_progress=on_progress,
                )
            )
    except Exception as exc:
        _update(job, done=True, error=str(exc), message=str(exc))
        return
    _update(job, done=True, progress=1, message="Finished", outputs=written, error=None)


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
    serve({"start": start, "status": status})
