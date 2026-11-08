import unittest
import wave
from pathlib import Path

import numpy as np
import soundfile as sf

import separate
from separate import _ensure_room, _finish, _stem_files, available_models, separate_file


class SeparateTest(unittest.TestCase):
    def test_vr_writes_two_different_stems(self):
        folder = Path(__file__).resolve().parent / "_out"
        folder.mkdir(exist_ok=True)
        source = folder / "tone.wav"
        rate = 44100
        length = rate
        time = np.arange(length) / rate
        vocal = (np.sin(2 * np.pi * 440 * time) * 0.25).astype(np.float32)
        side = (np.sin(2 * np.pi * 110 * time) * 0.15).astype(np.float32)
        stereo = np.stack((vocal + side, vocal - side), axis=1)
        with wave.open(str(source), "w") as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(rate)
            handle.writeframes((np.clip(stereo, -1, 1) * 32767).astype(np.int16).tobytes())
        outputs = separate_file(
            str(source),
            str(folder),
            method="vr",
            model="1_HP-UVR",
            secondary=None,
            algorithm="avg",
            stems=["Vocals", "Instrumental"],
            audio_format="wav",
            segment=8,
            overlap=0.25,
            aggression=5,
            window=512,
            shifts=0,
            denoise=False,
            high_end=False,
            tta=False,
            on_progress=lambda _fraction: None,
            on_status=lambda message: print(message, flush=True),
        )
        self.assertEqual(len(outputs), 2)
        vocals = np.fromfile(outputs[0], dtype=np.int16)
        instrumental = np.fromfile(outputs[1], dtype=np.int16)
        self.assertGreater(vocals.size, 100)
        self.assertGreater(float(np.mean(np.abs(vocals.astype(np.float32) - instrumental.astype(np.float32)))), 20)

    def test_finish_writes_the_chosen_format(self):
        folder = Path(__file__).resolve().parent / "_out" / "formats"
        folder.mkdir(parents=True, exist_ok=True)
        source = folder / "clip_(Vocals).wav"
        audio = np.zeros((1000, 2), dtype=np.float32)
        audio[:, 0] = 0.2
        sf.write(str(source), audio, 44100, subtype="PCM_16")
        for audio_format, suffix in (("flac", ".flac"), ("ogg", ".ogg"), ("mp3", ".mp3")):
            sf.write(str(source), audio, 44100, subtype="PCM_16")
            written = _finish(folder, "clip", [str(source)], ["Vocals"], audio_format)
            self.assertEqual(len(written), 1)
            self.assertTrue(written[0].endswith(suffix))
            self.assertTrue(Path(written[0]).is_file())
            self.assertGreater(Path(written[0]).stat().st_size, 0)
            self.assertFalse(source.is_file())

    def test_bracketed_title_is_still_a_written_stem(self):
        folder = Path(__file__).resolve().parent / "_out" / "brackets"
        folder.mkdir(parents=True, exist_ok=True)
        for child in folder.iterdir():
            if child.is_file():
                child.unlink()
        name = "Song [Official]_(Vocals).wav"
        (folder / name).write_bytes(b"wav")
        (folder / "Song [Official].wav").write_bytes(b"original")
        found = _stem_files(folder, "Song [Official]")
        self.assertEqual([Path(item).name for item in found], [name])

    def test_download_stops_when_the_disk_cannot_hold_the_model(self):
        real = separate.shutil.disk_usage
        separate.shutil.disk_usage = lambda _path: type("Usage", (), {"free": 1_000_000})()
        try:
            with self.assertRaises(ValueError) as caught:
                _ensure_room(Path("."), 80_000_000)
            _ensure_room(Path("."), 0)
        finally:
            separate.shutil.disk_usage = real
        self.assertEqual(str(caught.exception), "There isn't enough free space to download this model.")

    def test_download_finishes_when_the_server_keeps_the_connection(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import threading
        import time

        class Hold(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b"abcdefgh"
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()
                time.sleep(5)

            def log_message(self, _format, *_args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Hold)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        folder = Path(__file__).resolve().parent / "_out" / "download"
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / "weights.th"
        destination.unlink(missing_ok=True)
        try:
            separate._pull(f"http://127.0.0.1:{server.server_address[1]}/weights.th", destination, lambda _got, _length: None, timeout=1)
            self.assertEqual(destination.read_bytes(), b"abcdefgh")
        finally:
            server.shutdown()

    def test_download_center_lists_models_that_are_not_installed(self):
        catalog = available_models(refresh=False)
        vocals = [row["id"] for row in catalog["vr"]]
        demucs = [row["id"] for row in catalog["demucs"]]
        self.assertIn("1_HP-UVR", vocals)
        self.assertIn("htdemucs", demucs)
        self.assertNotIn("mdx_q", demucs)
        self.assertTrue(all(row["label"].split(": ", 1)[-1] == row["id"] for row in catalog["mdx"]))


if __name__ == "__main__":
    unittest.main()
