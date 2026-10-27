import unittest
import wave
from pathlib import Path

import numpy as np

from separate import separate_file


class SeparateTest(unittest.TestCase):
    def test_a_stereo_file_writes_the_chosen_stems(self):
        folder = Path(__file__).resolve().parent / "_out"
        folder.mkdir(exist_ok=True)
        source = folder / "tone.wav"
        rate = 8000
        length = rate
        left = (np.sin(2 * np.pi * 440 * np.arange(length) / rate) * 0.4).astype(np.float32)
        right = (np.sin(2 * np.pi * 440 * np.arange(length) / rate) * 0.4).astype(np.float32)
        right += (np.sin(2 * np.pi * 180 * np.arange(length) / rate) * 0.2).astype(np.float32)
        stereo = np.stack((left, right), axis=1)
        with wave.open(str(source), "w") as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(rate)
            pcm = np.clip(stereo, -1, 1)
            handle.writeframes((pcm * 32767).astype(np.int16).tobytes())
        outputs = separate_file(
            str(source),
            str(folder),
            method="vr",
            model="1_HP-UVR",
            secondary=None,
            algorithm="avg",
            stems=["Vocals", "Instrumental"],
            audio_format="wav",
            segment=2,
            overlap=0.25,
            aggression=70,
            window=512,
            shifts=1,
            denoise=False,
            high_end=True,
            tta=False,
            on_progress=lambda _fraction: None,
        )
        self.assertEqual(len(outputs), 2)
        for output in outputs:
            self.assertTrue(Path(output).is_file())
            self.assertGreater(Path(output).stat().st_size, 44)


if __name__ == "__main__":
    unittest.main()
