"""Ultimate Vocal Remover worker. The page asks the host to start a separation."""

from __future__ import annotations

import threading
import time
from pathlib import Path

from ox1audio import serve

from separate import DownloadCancelled, available_models, download_named, separate_file

_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_seq = 0
_download: dict | None = None
_download_cancel = threading.Event()


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


def models(call):
    body = call.body if isinstance(call.body, dict) else {}
    return available_models(refresh=body.get("refresh") is True)


def download(call):
    global _download
    body = call.body if isinstance(call.body, dict) else {}
    method = body.get("method")
    model = body.get("model")
    if method not in {"vr", "mdx", "demucs"} or not isinstance(model, str) or not model:
        raise ValueError("No Model Selected")
    with _lock:
        if _download is not None and not _download["done"]:
            raise ValueError("A download is already running.")
        _download_cancel.clear()
        _download = {"progress": 0, "message": "", "done": False, "error": None, "stopped": False}
    threading.Thread(target=_download_run, args=(method, model), daemon=True).start()
    return {"ok": True}


def downloadStatus(call):
    with _lock:
        if _download is None:
            return {"progress": 0, "message": "", "done": True, "error": None, "stopped": False}
        return dict(_download)


def stopDownload(call):
    _download_cancel.set()
    return {"ok": True}


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
        _jobs[job] = {"progress": 0, "message": "Starting", "log": "", "done": False, "error": None, "outputs": []}
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
    started = time.perf_counter()
    try:
        total = len(files)
        for index, source in enumerate(files):
            prefix = f"File {index + 1}/{total} "
            _append(job, f'{"" if index == 0 else chr(10)}{prefix}"{Path(source).name}".\n\n')
            _update(job, progress=index / total)

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
                    shifts=int(_number(body.get("shifts"), 2)),
                    denoise=body.get("denoise") is True,
                    high_end=body.get("highEnd") is True,
                    tta=body.get("tta") is True,
                    gpu=body.get("gpu") is True,
                    on_progress=on_progress,
                    on_status=lambda text: _append(job, text),
                    console_prefix=prefix,
                )
            )
    except Exception as exc:
        _append(job, f"\n\nProcess failed, please see error log\n{exc}\nTime Elapsed: {_elapsed(started)}\n")
        _update(job, done=True, error=str(exc), message=str(exc))
        return
    _append(job, f"\nProcess complete\nTime Elapsed: {_elapsed(started)}\n")
    _update(job, done=True, progress=1, message="Finished", outputs=written, error=None)


def _download_run(method: str, model: str) -> None:
    try:
        download_named(
            method,
            model,
            on_progress=lambda fraction: _download_update(progress=fraction),
            on_status=lambda message: _download_update(message=str(message).strip()),
            cancel=_download_cancel.is_set,
        )
    except DownloadCancelled:
        _download_update(done=True, stopped=True, message="Download Stopped")
        return
    except Exception as exc:
        _download_update(done=True, error=str(exc), message="Download Failed")
        return
    _download_update(done=True, progress=1, message="Download Complete", error=None, stopped=False)


def _download_update(**fields) -> None:
    with _lock:
        if _download is not None:
            _download.update(fields)


def _elapsed(started: float) -> str:
    return time.strftime("%H:%M:%S", time.gmtime(int(time.perf_counter() - started)))


def _append(job: str, text: str) -> None:
    if not text:
        return
    with _lock:
        current = _jobs.get(job)
        if current is None:
            return
        current["log"] = current.get("log", "") + text
        visible = text.strip()
        if visible:
            current["message"] = visible


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
    serve({"start": start, "status": status, "models": models, "download": download, "downloadStatus": downloadStatus, "stopDownload": stopDownload})
