"""
AeroTrack Pro delay-risk model training.

Trains a logistic-regression model on labelled prediction snapshots exported by
`npm run export:training -w server` and writes a JSON artifact the Node server
can load (DELAY_MODEL_PATH). Logistic regression keeps the model explainable:
each factor's contribution is visible in the UI.

Data-leakage controls
  * Features are computed at prediction time only (see shared/src/prediction.ts).
  * Split is by time: the newest 20% of snapshots form the validation set.
  * All snapshots of one bag fall on the same side of the split (grouped by
    the bag's first snapshot time), so a bag never appears in both sets.
  * Scaling statistics are fitted on the training split only.

--synthetic generates a clearly labelled SYNTHETIC dataset for pipeline testing.
Metrics on synthetic data say nothing about real airport performance, and the
exported model records dataOrigin="synthetic" so the app shows that warning.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "stageIndex",
    "minutesSinceLastScan",
    "dwellRatio",
    "skippedCheckpoints",
    "openAnomalies",
    "flightDelayed",
    "flightCancelled",
    "minutesToDeparture",
    "notLoadedNearDeparture",
]
MIN_ROWS = 200
MIN_POSITIVES = 20


def synthetic(n_bags: int, seed: int) -> pd.DataFrame:
    """Synthetic snapshots with a known, noisy relationship. NOT real data."""
    rng = np.random.default_rng(seed)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for b in range(n_bags):
        t0 = start + timedelta(minutes=int(rng.integers(0, 60 * 24 * 90)))
        flight_delayed = int(rng.random() < 0.15)
        cancelled = int(rng.random() < 0.01)
        skipped = int(rng.random() < 0.06)
        latent = -2.2 + 1.3 * flight_delayed + 2.5 * cancelled + 1.1 * skipped + rng.normal(0, 0.6)
        for snap in range(int(rng.integers(2, 6))):
            stage = min(7, snap + int(rng.integers(0, 2)))
            dwell = max(0.0, rng.gamma(2.0, 0.35) + (0.6 if latent > -1 else 0))
            anomalies = int(rng.poisson(0.2 + 0.4 * skipped))
            to_dep = float(np.clip(120 - snap * 40 + rng.normal(0, 20), -600, 1440))
            near = int(1 <= stage < 3 and 0 < to_dep < 45)
            rows.append(
                {
                    "computed_at": (t0 + timedelta(minutes=snap * 25)).isoformat(),
                    "baggage_id": f"syn-{b}",
                    "stageIndex": stage,
                    "minutesSinceLastScan": round(dwell * 60),
                    "dwellRatio": round(dwell, 2),
                    "skippedCheckpoints": skipped,
                    "openAnomalies": anomalies,
                    "flightDelayed": flight_delayed,
                    "flightCancelled": cancelled,
                    "minutesToDeparture": round(to_dep),
                    "notLoadedNearDeparture": near,
                    "_z": latent + 0.9 * dwell + 0.5 * anomalies + 1.2 * near,
                }
            )
    df = pd.DataFrame(rows)
    # Label is per bag (outcome of the journey), shared by all its snapshots.
    bag_z = df.groupby("baggage_id")["_z"].mean()
    bag_label = pd.Series((rng.random(len(bag_z)) < 1 / (1 + np.exp(-(bag_z - 1.0)))).astype(int), index=bag_z.index)
    df["delayed"] = df["baggage_id"].map(bag_label)
    return df.drop(columns="_z")


def time_split(df: pd.DataFrame, valid_frac: float):
    first_seen = df.groupby("baggage_id")["computed_at"].transform("min")
    order = first_seen.sort_values(kind="stable")
    cutoff = order.iloc[int(len(order) * (1 - valid_frac))]
    train = df[first_seen < cutoff]
    valid = df[first_seen >= cutoff]
    return train, valid, cutoff


def baseline_scores(df: pd.DataFrame) -> np.ndarray:
    """Python port of the rules baseline (shared/src/prediction.ts) for comparison."""
    s = 0.05 + np.minimum(0.4, np.maximum(0, df["dwellRatio"] - 0.5) * 0.25)
    s += np.minimum(0.25, df["skippedCheckpoints"] * 0.12) + np.minimum(0.2, df["openAnomalies"] * 0.08)
    s += df["flightDelayed"] * 0.15 + df["flightCancelled"] * 0.35 + df["notLoadedNearDeparture"] * 0.3
    s = np.where(df["stageIndex"] == 7, 0.05, s)
    return np.clip(s, 0, 1)


def metrics(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    out = {"accuracy@0.5": float(accuracy_score(y, p >= 0.5)), "brier": float(brier_score_loss(y, p))}
    if len(np.unique(y)) == 2:
        out["rocAuc"] = float(roc_auc_score(y, p))
        out["prAuc"] = float(average_precision_score(y, p))
    return {k: round(v, 4) for k, v in out.items()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--data", help="CSV exported by `npm run export:training -w server`")
    src.add_argument("--synthetic", type=int, metavar="N_BAGS", help="generate SYNTHETIC data for pipeline testing")
    ap.add_argument("--out", default="ml/models/delay_model.json")
    ap.add_argument("--report", default="ml/models/delay_model_report.json")
    ap.add_argument("--valid-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if args.synthetic:
        df, origin = synthetic(args.synthetic, args.seed), "synthetic"
    else:
        df, origin = pd.read_csv(args.data), f"operational export ({args.data})"
    missing = [c for c in FEATURES + ["computed_at", "baggage_id", "delayed"] if c not in df.columns]
    if missing:
        print(f"Missing columns: {missing}", file=sys.stderr)
        return 2
    df = df.dropna(subset=FEATURES + ["delayed"]).sort_values("computed_at")
    positives = int(df["delayed"].sum())
    if len(df) < MIN_ROWS or positives < MIN_POSITIVES:
        print(
            f"Not enough labelled data to train responsibly ({len(df)} rows, {positives} delayed; "
            f"need >= {MIN_ROWS} rows and >= {MIN_POSITIVES} delayed). Keep using the rules baseline.",
            file=sys.stderr,
        )
        return 3

    train, valid, cutoff = time_split(df, args.valid_frac)
    if valid["delayed"].nunique() < 2 or train["delayed"].nunique() < 2:
        print("Each split needs both outcomes; collect more data.", file=sys.stderr)
        return 3

    scaler = StandardScaler().fit(train[FEATURES])
    model = LogisticRegression(max_iter=1000, class_weight="balanced", C=1.0)
    model.fit(scaler.transform(train[FEATURES]), train["delayed"])
    p_valid = model.predict_proba(scaler.transform(valid[FEATURES]))[:, 1]

    report = {
        "dataOrigin": origin,
        "rows": {"train": int(len(train)), "valid": int(len(valid))},
        "bags": {"train": int(train["baggage_id"].nunique()), "valid": int(valid["baggage_id"].nunique())},
        "positiveRate": {"train": round(float(train["delayed"].mean()), 4), "valid": round(float(valid["delayed"].mean()), 4)},
        "split": f"time-based, grouped by bag; validation = bags first seen at/after {cutoff}",
        "validation": {"logisticRegression": metrics(valid["delayed"].to_numpy(), p_valid), "rulesBaseline": metrics(valid["delayed"].to_numpy(), baseline_scores(valid))},
        "coefficients": dict(zip(FEATURES, [round(float(c), 4) for c in model.coef_[0]])),
        "limitations": [
            "Synthetic data: metrics describe the generator, not real airports." if origin == "synthetic" else "Trained on one deployment's history; re-validate before reuse elsewhere.",
            "class_weight=balanced shifts probabilities; treat outputs as risk scores, not calibrated probabilities.",
            "Snapshots of the same bag are correlated; metrics are optimistic compared with per-bag evaluation.",
        ],
    }
    artifact = {
        "version": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "dataOrigin": origin,
        "features": FEATURES,
        "mean": [round(float(x), 6) for x in scaler.mean_],
        "scale": [round(float(x), 6) for x in scaler.scale_],
        "coef": [round(float(x), 6) for x in model.coef_[0]],
        "intercept": round(float(model.intercept_[0]), 6),
        "metrics": report["validation"]["logisticRegression"],
    }
    import os

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(artifact, f, indent=2)
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"\nModel written to {args.out}. Set DELAY_MODEL_PATH to use it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
