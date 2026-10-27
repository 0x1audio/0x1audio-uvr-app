"""Run Ultimate Vocal Remover's own separation code.

The networks, stem math, and ensemble live in ``engine/``, which is the MIT
licensed backend from https://github.com/Anjok07/ultimatevocalremovergui.
Weights are downloaded from UVR's public model repository the first time a
model is used.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent
ENGINE = ROOT / "engine"
WEIGHTS = ROOT / "models"
CATALOG = WEIGHTS / "catalog"

AUDIO = {".wav", ".flac", ".ogg", ".aiff", ".aif", ".mp3", ".m4a"}
RUNTIME = [
    "numpy>=2.1",
    "scipy>=1.13",
    "soundfile>=0.13",
    "librosa>=0.10",
    "onnxruntime>=1.17",
    "onnx>=1.16",
    "onnx2pytorch>=0.4",
    "einops>=0.7",
    "julius>=0.2",
    "pyyaml>=6",
    "omegaconf>=2.3",
    "pydub>=0.25",
    "audioop-lts>=0.2.1",
    "audioread>=3",
    "six>=1.16",
    "tqdm>=4",
    "samplerate>=0.2",
    "resampy>=0.4",
]


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
    gpu: bool = False,
    on_progress,
    on_status=None,
    console_prefix: str = "File 1/1 ",
) -> list[str]:
    path = Path(source)
    if path.suffix.lower() not in AUDIO or not path.is_file():
        raise ValueError(f"{path.name} is not a supported audio file.")
    chosen = [stem for stem in stems if isinstance(stem, str)]
    if not chosen:
        raise ValueError("Choose at least one stem.")
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    _ensure_runtime(on_status)
    if method == "ensemble":
        return _ensemble(
            path,
            destination,
            primary=model,
            secondary=secondary,
            algorithm=algorithm,
            stems=chosen,
            audio_format=audio_format,
            segment=segment,
            overlap=overlap,
            aggression=aggression,
            window=window,
            shifts=shifts,
            denoise=denoise,
            high_end=high_end,
            tta=tta,
            gpu=gpu,
            on_progress=on_progress,
            on_status=on_status,
            console_prefix=console_prefix,
        )
    written = _separate_one(
        path,
        destination,
        method=method,
        model=model,
        stems=chosen,
        segment=segment,
        overlap=overlap,
        aggression=aggression,
        window=window,
        shifts=shifts,
        denoise=denoise,
        high_end=high_end,
        tta=tta,
        gpu=gpu,
        on_progress=on_progress,
        on_status=on_status,
        console_prefix=console_prefix,
    )
    return _finish(destination, path.stem, written, chosen, audio_format)


def _ensemble(path, destination, *, primary, secondary, algorithm, stems, audio_format, segment, overlap, aggression, window, shifts, denoise, high_end, tta, gpu, on_progress, on_status, console_prefix):
    if not secondary or secondary == primary:
        raise ValueError("Choose two different models.")
    staging = destination / ".ensemble"
    if staging.exists():
        for child in staging.rglob("*"):
            if child.is_file():
                child.unlink()
    first = staging / "a"
    second = staging / "b"
    _write(on_status, f"Ensemble Mode - {primary} - Model 1/2\n\n")
    _separate_one(path, first, method=_method_for(primary), model=primary, stems=stems, segment=segment, overlap=overlap, aggression=aggression, window=window, shifts=shifts, denoise=denoise, high_end=high_end, tta=tta, gpu=gpu, on_progress=lambda fraction: on_progress(fraction * 0.45), on_status=on_status, console_prefix=console_prefix)
    _write(on_status, f"\nEnsemble Mode - {secondary} - Model 2/2\n\n")
    _separate_one(path, second, method=_method_for(secondary), model=secondary, stems=stems, segment=segment, overlap=overlap, aggression=aggression, window=window, shifts=shifts, denoise=denoise, high_end=high_end, tta=tta, gpu=gpu, on_progress=lambda fraction: on_progress(0.45 + fraction * 0.45), on_status=on_status, console_prefix=console_prefix)
    _write(on_status, f"{console_prefix}Ensembling outputs...")
    engine = _engine()
    spec_utils = engine.spec_utils
    algorithms = {"avg": spec_utils.AVERAGE, "max": spec_utils.MAX_SPEC, "min": spec_utils.MIN_SPEC}
    chosen = algorithms.get(algorithm, spec_utils.AVERAGE)
    written = []
    for stem in stems:
        left = first / f"{path.stem}_({stem}).wav"
        right = second / f"{path.stem}_({stem}).wav"
        if not left.is_file() or not right.is_file():
            continue
        target = destination / f"{path.stem}_({stem}).wav"
        spec_utils.ensemble_inputs([str(left), str(right)], chosen, False, "PCM_16", str(target), is_wave=False)
        written.append(str(target))
    shutil.rmtree(staging, ignore_errors=True)
    if not written:
        raise ValueError("The ensemble did not produce a stem.")
    _write(on_status, " Done!\n")
    on_progress(1)
    return _finish(destination, path.stem, written, stems, audio_format)


def _separate_one(path, destination, *, method, model, stems, segment, overlap, aggression, window, shifts, denoise, high_end, tta, gpu, on_progress, on_status, console_prefix="File 1/1 "):
    engine = _engine()
    constants = engine.constants
    kind = {"vr": constants.VR_ARCH_TYPE, "mdx": constants.MDX_ARCH_TYPE, "demucs": constants.DEMUCS_ARCH_TYPE}.get(method)
    if kind is None:
        raise ValueError("Choose VR Architecture, MDX-Net, Demucs, or Ensemble.")
    destination.mkdir(parents=True, exist_ok=True)
    model_path, settings, demucs_version = _prepare_model(method, model, on_status, on_progress)
    _write(on_status, f"{console_prefix}Loading model ({model})...")
    data = _model_data(
        engine,
        constants,
        kind=kind,
        model=model,
        model_path=model_path,
        settings=settings,
        demucs_version=demucs_version,
        stems=stems,
        segment=segment,
        overlap=overlap,
        aggression=aggression,
        window=window,
        shifts=shifts,
        denoise=denoise,
        high_end=high_end,
        tta=tta,
        gpu=gpu,
    )
    base = path.stem

    def report(step, inference_iterations=0):
        try:
            value = float(step) + float(inference_iterations)
        except (TypeError, ValueError):
            return
        on_progress(min(1, max(0, value)))

    process_data = {
        "model_data": data,
        "export_path": str(destination),
        "audio_file_base": base,
        "audio_file": str(path),
        "set_progress_bar": report,
        "write_to_console": lambda text, base_text=console_prefix: _write(on_status, f"{base_text}{text}"),
        "process_iteration": lambda: None,
        "cached_source_callback": lambda *_args, **_kwargs: (None, None),
        "cached_model_source_holder": {},
        "list_all_models": [],
        "is_ensemble_master": False,
        "is_4_stem_ensemble": False,
    }
    if kind == constants.VR_ARCH_TYPE:
        separator = engine.separate.SeperateVR(data, process_data)
    elif kind == constants.MDX_ARCH_TYPE:
        separator = engine.separate.SeperateMDXC(data, process_data) if data.is_mdx_c else engine.separate.SeperateMDX(data, process_data)
    else:
        separator = engine.separate.SeperateDemucs(data, process_data)
    separator.seperate()
    written = [str(item) for item in destination.glob(f"{base}_(*).wav")]
    if data.demucs_stems == constants.ALL_STEMS and constants.INST_STEM in stems and not (destination / f"{base}_({constants.INST_STEM}).wav").is_file():
        instrumental = _sum_instrumental(destination, base)
        if instrumental:
            written.append(str(instrumental))
    if not written:
        raise ValueError("Separation finished without writing a stem.")
    return written


def _model_data(engine, constants, *, kind, model, model_path, settings, demucs_version, stems, segment, overlap, aggression, window, shifts, denoise, high_end, tta, gpu):
    primary = settings.get("primary_stem") or constants.VOCAL_STEM
    if kind == constants.DEMUCS_ARCH_TYPE:
        two_stem = constants.DEMUCS_UVR_MODEL in model
        sources, mapping, count = (constants.DEMUCS_2_SOURCE, constants.DEMUCS_2_SOURCE_MAPPER, 2) if two_stem else (constants.DEMUCS_4_SOURCE, constants.DEMUCS_4_SOURCE_MAPPER, 4)
        parts = {constants.DRUM_STEM, constants.BASS_STEM, constants.OTHER_STEM}
        demucs_stems = constants.ALL_STEMS if count == 4 and parts.intersection(stems) else constants.VOCAL_STEM
        primary = constants.VOCAL_STEM if demucs_stems == constants.VOCAL_STEM else constants.PRIMARY_STEM
        secondary = constants.secondary_stem(primary)
    else:
        sources, mapping, count = [], {}, 0
        demucs_stems = constants.VOCAL_STEM
        secondary = constants.secondary_stem(primary)
    param = None
    if kind == constants.VR_ARCH_TYPE:
        name = settings.get("vr_model_param")
        if not name:
            raise ValueError(f"{model} has no VR parameter file.")
        param = engine.ModelParameters(str(ENGINE / "lib_v5" / "vr_network" / "modelparams" / f"{name}.json"))
    capacity = (32, 128)
    vr_51 = False
    if "nout" in settings and "nout_lstm" in settings:
        capacity = (settings["nout"], settings["nout_lstm"])
        vr_51 = True
    return SimpleNamespace(
        is_pitch_change=False,
        semitone_shift=0,
        is_match_frequency_pitch=True,
        overlap=float(overlap),
        overlap_mdx=float(overlap),
        overlap_mdx23=8,
        is_mdx_combine_stems=True,
        is_mdx_c=False,
        mdx_c_configs=None,
        mdxnet_stem_select=constants.VOCAL_STEM,
        mixer_path=str(ENGINE / "lib_v5" / "mixer.ckpt"),
        model_samplerate=param.param["sr"] if param else 44100,
        model_capacity=capacity,
        is_vr_51_model=vr_51,
        is_pre_proc_model=False,
        is_secondary_model_activated=False,
        is_secondary_model=False,
        process_method=kind,
        model_path=str(model_path),
        model_name=model,
        model_basename=Path(model_path).stem,
        wav_type_set="PCM_16",
        mp3_bit_set="320k",
        save_format=constants.WAV,
        is_gpu_conversion=0 if gpu else -1,
        is_normalization=False,
        is_primary_stem_only=False,
        is_secondary_stem_only=False,
        is_primary_model_primary_stem_only=False,
        is_primary_model_secondary_stem_only=False,
        is_ensemble_mode=False,
        secondary_model=None,
        primary_model_primary_stem=None,
        primary_stem_native=primary,
        primary_stem=primary,
        secondary_stem=secondary,
        is_invert_spec=False,
        is_deverb_vocals=False,
        is_mixer_mode=False,
        secondary_model_scale=None,
        is_demucs_pre_proc_model_inst_mix=False,
        ensemble_primary_stem=None,
        is_multi_stem_ensemble=False,
        DENOISER_MODEL="",
        DEVERBER_MODEL="",
        vocal_split_model=None,
        is_vocal_split_model=False,
        is_save_inst_vocal_splitter=False,
        is_inst_only_voc_splitter=False,
        is_karaoke=bool(settings.get("is_karaoke")),
        is_bv_model=bool(settings.get("is_bv_model")),
        bv_model_rebalance=settings.get("is_bv_model_rebalanced") or 0,
        is_sec_bv_rebalance=False,
        deverb_vocal_opt="Main Vocals Only",
        is_save_vocal_only=False,
        device_set="Default",
        is_use_opencl=False,
        is_mdx_ckpt=False,
        is_denoise=denoise if kind == constants.MDX_ARCH_TYPE else False,
        is_denoise_model=False,
        is_mdx_c_seg_def=False,
        mdx_batch_size=1,
        compensate=settings.get("compensate", 1.0),
        mdx_segment_size=2 ** int(settings.get("mdx_dim_t_set", 8)),
        mdx_dim_f_set=settings.get("mdx_dim_f_set"),
        mdx_dim_t_set=settings.get("mdx_dim_t_set"),
        mdx_n_fft_scale_set=settings.get("mdx_n_fft_scale_set"),
        chunks=0,
        margin=44100,
        demucs_stems=demucs_stems,
        secondary_model_4_stem=[],
        secondary_model_4_stem_scale=[],
        is_chunk_demucs=False,
        segment=str(int(segment)),
        demucs_version=demucs_version or "v4",
        demucs_source_list=sources,
        demucs_source_map=mapping,
        is_demucs_combine_stems=True,
        demucs_stem_count=count,
        pre_proc_model=None,
        shifts=max(0, int(shifts)),
        is_split_mode=True,
        vr_model_param=param,
        is_high_end_process="mirroring" if high_end else "None",
        is_tta=bool(tta) if kind == constants.VR_ARCH_TYPE else False,
        is_post_process=False,
        batch_size=1,
        window_size=int(window or 512),
        post_process_threshold=0.2,
        aggression_setting=(5 if aggression is None else float(aggression)) / 100,
    )


def _prepare_model(method, model, on_status, on_progress):
    catalog = _download_lists()
    table = {"vr": "vr_download_list", "mdx": "mdx_download_list", "demucs": "demucs_download_list"}[method]
    target = None
    for label, value in catalog[table].items():
        if label.split(": ", 1)[-1] == model:
            target = value
            break
    if target is None:
        raise ValueError("Choose a model.")
    if method == "demucs":
        folder = WEIGHTS / "Demucs_Models" / "v3_v4_repo"
        yaml_path = None
        files = list(target.items())
        for index, (name, url) in enumerate(files):
            destination = folder / name
            _download(url, destination, on_status, on_progress, f"{model} ({index + 1}/{len(files)})")
            if name.endswith(".yaml"):
                yaml_path = destination
        if yaml_path is None:
            raise ValueError(f"{model} did not include a Demucs configuration.")
        version = "v3" if "v3" in model or model.startswith("mdx") else "v4"
        mapper_path = ENGINE / "models" / "Demucs_Models" / "model_data" / "model_name_mapper.json"
        if mapper_path.is_file():
            label = json.loads(mapper_path.read_text()).get(yaml_path.name, "")
            if label.startswith("v3"):
                version = "v3"
            elif label.startswith("v4"):
                version = "v4"
        return yaml_path, {}, version
    folder = WEIGHTS / ("VR_Models" if method == "vr" else "MDX_Net_Models")
    destination = folder / target
    _download(f"https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/{target}", destination, on_status, on_progress, model)
    settings = _settings(method, _hash_model(destination))
    if settings is None:
        raise ValueError(f"UVR has no settings for {model}.")
    return destination, settings, None


def _settings(method, digest):
    remote = {
        "vr": "https://raw.githubusercontent.com/TRvlvr/application_data/main/vr_model_data/model_data_new.json",
        "mdx": "https://raw.githubusercontent.com/TRvlvr/application_data/main/mdx_model_data/model_data_new.json",
    }[method]
    cached = CATALOG / f"{method}.json"
    if not cached.is_file():
        try:
            _download(remote, cached, None, lambda _fraction: None, "model settings")
        except Exception:
            bundled = ENGINE / "models" / ("VR_Models" if method == "vr" else "MDX_Net_Models") / "model_data" / "model_data.json"
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(bundled.read_text())
    data = json.loads(cached.read_text())
    if digest in data:
        return data[digest]
    for key, value in data.items():
        if digest in key:
            return value
    return None


def _hash_model(path: Path) -> str:
    with path.open("rb") as handle:
        try:
            handle.seek(-10000 * 1024, 2)
        except OSError:
            handle.seek(0)
        return hashlib.md5(handle.read()).hexdigest()


def _download_lists():
    path = ENGINE / "gui_data" / "model_manual_download.json"
    return json.loads(path.read_text())


def _download(url, destination: Path, on_status, on_progress, label):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and destination.stat().st_size > 0:
        return
    _status(on_status, f"Downloading {label}")
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "0x1audio-uvr"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
        total = int(response.headers.get("Content-Length") or 0)
        got = 0
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            handle.write(chunk)
            got += len(chunk)
            if total and on_progress:
                on_progress(min(0.2, 0.2 * got / total))
    temporary.replace(destination)


def _finish(destination: Path, base: str, written: list[str], stems: list[str], audio_format: str):
    import soundfile as sf

    kept = []
    for item in written:
        file = Path(item)
        if not file.is_file():
            continue
        stem = file.stem[len(base) + 2 : -1] if file.stem.startswith(f"{base}_(") and file.stem.endswith(")") else ""
        if stem not in stems:
            file.unlink(missing_ok=True)
            continue
        if audio_format == "flac":
            audio, rate = sf.read(str(file), always_2d=True)
            target = file.with_suffix(".flac")
            sf.write(str(target), audio, rate, format="FLAC")
            file.unlink(missing_ok=True)
            kept.append(str(target))
        else:
            kept.append(str(file))
    if not kept:
        raise ValueError("Choose at least one stem.")
    return kept


def _sum_instrumental(folder: Path, base: str):
    import numpy as np
    import soundfile as sf

    parts = []
    rate = None
    for stem in ("Drums", "Bass", "Other"):
        file = folder / f"{base}_({stem}).wav"
        if not file.is_file():
            continue
        audio, rate = sf.read(str(file), always_2d=True)
        parts.append(audio)
    if not parts or rate is None:
        return None
    length = max(len(part) for part in parts)
    total = np.zeros((length, parts[0].shape[1]), dtype=np.float32)
    for part in parts:
        total[: len(part)] += part
    target = folder / f"{base}_(Instrumental).wav"
    sf.write(str(target), total, rate, subtype="PCM_16")
    return target


def _method_for(model: str) -> str:
    lists = _download_lists()
    for method, key in (("vr", "vr_download_list"), ("mdx", "mdx_download_list"), ("demucs", "demucs_download_list")):
        for label in lists[key]:
            if label.split(": ", 1)[-1] == model:
                return method
    raise ValueError("Choose a model.")


def _engine():
    if str(ENGINE) not in sys.path:
        sys.path.insert(0, str(ENGINE))
    if "uvr_engine" in sys.modules:
        return sys.modules["uvr_engine"]
    spec = importlib.util.spec_from_file_location("uvr_engine_separate", ENGINE / "separate.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("The UVR separator is missing.")
    module = importlib.util.module_from_spec(spec)
    sys.modules["uvr_engine_separate"] = module
    spec.loader.exec_module(module)
    import gui_data.constants as constants
    from lib_v5 import spec_utils
    from lib_v5.vr_network.model_param_init import ModelParameters

    loaded = SimpleNamespace(separate=module, constants=constants, spec_utils=spec_utils, ModelParameters=ModelParameters)
    sys.modules["uvr_engine"] = loaded
    return loaded


def _ensure_runtime(on_status) -> None:
    missing = [package for module, package in _MODULES if not _importable(module)]
    if not missing:
        return
    _status(on_status, "Installing the separation runtime. The first run takes a while.")
    if not _importable("torch"):
        command = [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--only-binary=:all:", "torch>=2.2"]
        if sys.platform == "linux":
            command.extend(["--index-url", "https://download.pytorch.org/whl/cpu"])
        _pip(command)
        missing = [package for package in missing if not package.startswith("torch")]
    if missing:
        _pip([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--only-binary=:all:", *missing])


_MODULES = [
    ("numpy", "numpy>=2.1"),
    ("scipy", "scipy>=1.13"),
    ("soundfile", "soundfile>=0.13"),
    ("librosa", "librosa>=0.10"),
    ("onnxruntime", "onnxruntime>=1.17"),
    ("onnx", "onnx>=1.16"),
    ("onnx2pytorch", "onnx2pytorch>=0.4"),
    ("einops", "einops>=0.7"),
    ("julius", "julius>=0.2"),
    ("yaml", "pyyaml>=6"),
    ("omegaconf", "omegaconf>=2.3"),
    ("pydub", "pydub>=0.25"),
    ("audioop", "audioop-lts>=0.2.1"),
    ("audioread", "audioread>=3"),
    ("six", "six>=1.16"),
    ("tqdm", "tqdm>=4"),
    ("samplerate", "samplerate>=0.2"),
    ("resampy", "resampy>=0.4"),
    ("torch", "torch>=2.2"),
]


def _importable(module: str) -> bool:
    try:
        __import__(module)
    except ImportError:
        return False
    except Exception:
        return True
    return True


def _pip(command: list[str]) -> None:
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "pip failed").strip().splitlines()
        raise RuntimeError(detail[-1] if detail else "Could not install the separation runtime.")


def _write(on_status, text: str) -> None:
    if on_status and text:
        on_status(text)


def _status(on_status, message: str) -> None:
    if not message:
        return
    if not str(message).endswith("\n"):
        message = f"{message}\n"
    _write(on_status, message)
