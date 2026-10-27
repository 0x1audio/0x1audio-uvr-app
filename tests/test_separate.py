import unittest
import wave
from pathlib import Path

import numpy as np

from separate import separate_file


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


if __name__ == "__main__":
    unittest.main()
