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
        song = folder / "clip.wav"
        sf.write(str(song), np.zeros((1000, 2), dtype=np.float32), 44100, subtype="PCM_16")
        source = folder / "clip_(Vocals).wav"
        audio = np.zeros((1000, 2), dtype=np.float32)
        audio[:, 0] = 0.2
        for audio_format, suffix in (("flac", ".flac"), ("ogg", ".ogg"), ("mp3", ".mp3")):
            sf.write(str(source), audio, 44100, subtype="FLOAT")
            written = _finish(folder, song, [str(source)], ["Vocals"], audio_format)
            self.assertEqual(len(written), 1)
            self.assertTrue(written[0].endswith(suffix))
            self.assertTrue(Path(written[0]).is_file())
            self.assertGreater(Path(written[0]).stat().st_size, 0)
            self.assertFalse(source.is_file())

    def test_stems_come_back_at_the_songs_rate_length_and_depth_without_clipping(self):
        # GAB-136: a 48 kHz / 24-bit take comes back 48 kHz / 24-bit, the same length, never clipped.
        import ox1audio as ox

        folder = Path(__file__).resolve().parent / "_out" / "studio"
        folder.mkdir(parents=True, exist_ok=True)
        for child in folder.iterdir():
            child.unlink()
        song = folder / "take.wav"
        t = np.arange(48000 * 2) / 48000
        sf.write(str(song), np.stack([0.5 * np.sin(2 * np.pi * 220 * t)] * 2, axis=1), 48000, subtype="PCM_24")
        t44 = np.arange(44100 * 2) / 44100
        loud = np.stack([1.5 * np.sin(2 * np.pi * 220 * t44)] * 2, axis=1).astype(np.float32)  # a stem over 0 dBFS
        quiet = (loud * 0.1).astype(np.float32)
        for audio_format in ("wav", "flac", "mp3"):
            vocals, music = folder / "take_(Vocals).wav", folder / "take_(Instrumental).wav"
            sf.write(str(vocals), loud, 44100, subtype="FLOAT")
            sf.write(str(music), quiet, 44100, subtype="FLOAT")
            written = _finish(folder, song, [str(vocals), str(music)], ["Vocals", "Instrumental"], audio_format)
            self.assertEqual(len(written), 2)
            outs = {Path(path).stem: path for path in written}
            info = ox.audio.probe(outs["take_(Vocals)"])
            self.assertEqual(info.rate, 48000, audio_format)
            got, _ = ox.audio.read(outs["take_(Vocals)"])
            other, _ = ox.audio.read(outs["take_(Instrumental)"])
            self.assertLess(float(np.max(np.abs(got))), 1.0, f"{audio_format}: not clipped")
            # The same gain on both stems: they still add up the way the model made them.
            ratio = float(np.max(np.abs(other)) / np.max(np.abs(got)))
            self.assertAlmostEqual(ratio, 0.1, delta=0.01)
            if audio_format == "mp3":
                self.assertGreaterEqual(info.bitrate or 0, 300)
            else:
                self.assertEqual(info.bits, 24, audio_format)
                self.assertEqual(len(got), 96000, f"{audio_format}: the same length as the song")
                # Not hard-clipped: a clipped sine sits at its peak for a tenth of every cycle.
                top = np.max(np.abs(got[:, 0]))
                self.assertLess(int(np.sum(np.abs(got[:, 0]) >= top - 1e-6)), len(got) // 100)
            for path in written:
                Path(path).unlink()

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
