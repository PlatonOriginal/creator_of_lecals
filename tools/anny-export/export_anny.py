"""Exports the Anny body model (Apache 2.0, assets CC0) into a compact binary for the browser.

The browser recomputes the body shape itself, so we keep Anny's exact phenotype
weight formula and only compress the vertex deltas:

  rest(c) = template + c @ D,   c = phenotype blend shape weights (K = 1132 for "all")

We sample adult bodies, take the uncentered SVD of their deltas and keep the
first R directions U (R x 3V). Then rest(c) ~= template + (c @ M) @ U with
M = D @ U^T (K x R). Local changes (measure-*-incr/decr etc.) stay exact, as
sparse vertex deltas.

Output (in --out):
  anny.json  metadata, phenotype tables, M, sparse local change index
  anny.bin   template, faces, quantized U, local change deltas

Usage:
  pip install -r requirements.txt
  python export_anny.py --out ../../apps/web/public/body --rank 48
"""
import argparse
import json
import os
import time

import numpy as np
import torch

import anny
from anny.models.model_data import PHENOTYPE_VARIATIONS

LOCAL_CHANGES = [
    "measure-bust-circ-incr",
    "measure-underbust-circ-incr",
    "measure-waist-circ-incr",
    "measure-hips-circ-incr",
    "measure-napetowaist-dist-incr",
    "measure-waisttohip-dist-incr",
    "measure-shoulder-dist-incr",
    "measure-neck-circ-incr",
    "measure-thigh-circ-incr",
    "measure-upperarm-circ-incr",
    "breast-volume-vert-up",
    "buttocks-volume-incr",
    "stomach-pregnant-incr",
]

# Age anchors are linspace(-1/3, 1, 5): newborn, baby, child, young (2/3), old (1).
ADULT_AGE = (0.55, 1.0)


def to_y_up(v: np.ndarray) -> np.ndarray:
    """Anny is z-up with the front towards -y; three.js is y-up with the front towards +z."""
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def sample_phenotypes(model, n: int, rng: np.random.Generator) -> torch.Tensor:
    labels = model.phenotype_labels
    p = np.empty((n, len(labels)), dtype=np.float32)
    for i, label in enumerate(labels):
        p[:, i] = rng.uniform(*ADULT_AGE, n) if label == "age" else rng.uniform(0.0, 1.0, n)
    # Bias half of the samples to the target audience: women.
    p[: n // 2, labels.index("gender")] = rng.uniform(0.6, 1.0, n // 2)
    return torch.from_numpy(p)


def quantize_rows(a: np.ndarray):
    """int16 per row with a float32 scale per row."""
    scale = np.abs(a).max(axis=1) / 32767.0
    scale[scale == 0] = 1.0
    q = np.round(a / scale[:, None]).astype(np.int16)
    return q, scale.astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--rank", type=int, default=48)
    ap.add_argument("--samples", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rng = np.random.default_rng(args.seed)

    t0 = time.time()
    model = anny.Anny(
        local_changes=LOCAL_CHANGES,
        phenotypes="all",
        phenotype_blendshapes="original",
    ).to(dtype=torch.float64)
    print(f"model loaded in {time.time() - t0:.0f}s")

    labels = model.phenotype_labels
    mask = model.stacked_phenotype_blend_shapes_mask  # (K, 26)
    K = mask.shape[0]
    V = model.template_vertices.shape[0]
    template = to_y_up(model.template_vertices.numpy())  # (V, 3)
    D = to_y_up(model.blendshapes[:K].numpy()).reshape(K, -1)  # (K, 3V)

    def weights(p: torch.Tensor) -> torch.Tensor:
        return anny.models.phenotype.phenotype_blendshape_weights(
            p.to(torch.float64), labels, model.anchors, mask, extrapolate=False
        )

    # Training samples -> deltas -> uncentered SVD.
    p_train = sample_phenotypes(model, args.samples, rng)
    C = weights(p_train).numpy()  # (N, K)
    deltas = C @ D  # (N, 3V)
    _, s, vt = np.linalg.svd(deltas.astype(np.float32), full_matrices=False)
    energy = np.cumsum(s**2) / np.sum(s**2)

    # Held-out error per rank, in mm.
    p_test = sample_phenotypes(model, 300, np.random.default_rng(args.seed + 1))
    Ct = weights(p_test).numpy()
    true_t = (Ct @ D).reshape(len(Ct), V, 3)
    report = {}
    for r in (8, 16, 24, 32, 48, 64, 96):
        U = vt[:r].astype(np.float64)
        approx = ((Ct @ D) @ U.T @ U).reshape(len(Ct), V, 3)
        err = np.linalg.norm(approx - true_t, axis=-1) * 1000
        report[r] = {
            "energy": float(energy[r - 1]),
            "meanErrMm": float(err.mean()),
            "p99ErrMm": float(np.percentile(err, 99)),
            "maxErrMm": float(err.max()),
        }
        print(f"rank {r:3d}: mean {err.mean():.3f} mm, p99 {np.percentile(err, 99):.2f} mm, max {err.max():.2f} mm")

    R = args.rank
    U = vt[:R].astype(np.float64)  # (R, 3V)
    M = (D @ U.T).astype(np.float32)  # (K, R)
    Uq, Uscale = quantize_rows(U.astype(np.float32))

    # Local changes: incr and decr deltas, sparse.
    nloc = len(model.local_change_labels)
    local_entries = []
    local_idx_chunks, local_delta_chunks = [], []
    offset = 0
    for i, label in enumerate(model.local_change_labels):
        for j, direction in enumerate(("incr", "decr")):
            d = to_y_up(model.blendshapes[K + 2 * i + j].numpy())  # (V, 3)
            nz = np.nonzero(np.linalg.norm(d, axis=1) > 1e-7)[0].astype(np.uint32)
            vals = d[nz].astype(np.float32).reshape(-1)
            scale = float(np.abs(vals).max() / 32767.0) if len(vals) else 1.0
            local_idx_chunks.append(nz)
            local_delta_chunks.append(np.round(vals / scale).astype(np.int16))
            local_entries.append(
                {"label": label, "direction": direction, "count": int(len(nz)), "offset": offset, "scale": scale}
            )
            offset += len(nz)

    faces = model.faces.numpy().astype(np.uint16 if V < 65536 else np.uint32)

    # Binary layout, every block 4-byte aligned.
    blocks = []

    def add(name, arr):
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        blocks.append((name, str(arr.dtype), list(arr.shape), raw + b"\0" * pad, len(raw)))

    add("template", template.astype(np.float32))
    add("faces", faces)
    add("basis", Uq.reshape(R, V, 3))
    add("basisScale", Uscale)
    add("phenotypeToBasis", M)
    add("localIndices", np.concatenate(local_idx_chunks))
    add("localDeltas", np.concatenate(local_delta_chunks))

    layout = {}
    pos = 0
    with open(os.path.join(args.out, "anny.bin"), "wb") as f:
        for name, dtype, shape, raw, nbytes in blocks:
            layout[name] = {"dtype": dtype, "shape": shape, "byteOffset": pos, "byteLength": nbytes}
            f.write(raw)
            pos += len(raw)

    # Reference outputs for the TypeScript port test.
    ref_params = [
        {k: 0.5 for k in labels},
        {**{k: 0.5 for k in labels}, "gender": 1.0, "age": 0.75, "weight": 0.8, "height": 0.3, "cupsize": 0.7},
        {**{k: 0.5 for k in labels}, "gender": 0.0, "age": 0.9, "muscle": 0.9, "proportions": 0.1},
    ]
    ref_local = {"measure-waist-circ-incr": 0.6, "measure-bust-circ-incr": -0.4}
    references = []
    probe = [0, 1000, 5000, 9000, 13000]
    for rp in ref_params:
        p = torch.tensor([[rp[k] for k in labels]], dtype=torch.float64)
        c = weights(p).numpy()[0]
        for local in ({}, ref_local):
            out = model(
                phenotype_kwargs={k: torch.tensor([v], dtype=torch.float64) for k, v in rp.items()},
                local_changes_kwargs={k: torch.tensor([v], dtype=torch.float64) for k, v in local.items()} if local else None,
            )
            rest = to_y_up(out["rest_vertices"][0].numpy())
            references.append(
                {
                    "phenotypes": rp,
                    "localChanges": local,
                    "nonZeroWeights": int((np.abs(c) > 1e-12).sum()),
                    "weightSum": float(c.sum()),
                    "probe": {str(i): rest[i].tolist() for i in probe},
                }
            )

    meta = {
        "format": "lecals-anny-body",
        "version": 1,
        "source": {"package": "anny", "version": anny.__version__ if hasattr(anny, "__version__") else "0.6.2",
                   "license": "Apache-2.0 (code), CC0-1.0 (MakeHuman assets)"},
        "units": "metres, y up, front towards +z",
        "vertexCount": int(V),
        "faceCount": int(faces.shape[0]),
        "rank": R,
        "phenotypeLabels": labels,
        "phenotypeVariations": PHENOTYPE_VARIATIONS,
        "anchors": {k: model.anchors[k].tolist() for k in PHENOTYPE_VARIATIONS if k != "race"},
        "mask": [np.nonzero(row)[0].tolist() for row in mask.numpy()],
        "localChanges": local_entries,
        "localChangeLabels": list(model.local_change_labels),
        "compression": report,
        "blocks": layout,
        "references": references,
    }
    with open(os.path.join(args.out, "anny.json"), "w") as f:
        json.dump(meta, f)
    size = os.path.getsize(os.path.join(args.out, "anny.bin"))
    print(f"wrote anny.bin ({size / 1e6:.2f} MB), rank {R}, {len(local_entries)} local deltas")


if __name__ == "__main__":
    main()
