"""Stand-in for the diffq package.

Demucs imports it while loading every model. The published wheels stop at
Python 3.10, and the non-quantized UVR models never call into it.
"""


class DiffQuantizer:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("Quantized Demucs models are not available in this build.")


class UniformQuantizer(DiffQuantizer):
    pass


def restore_quantized_state(*args, **kwargs):
    raise RuntimeError("Quantized Demucs models are not available in this build.")
