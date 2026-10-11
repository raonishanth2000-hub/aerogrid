"""Entry point executed inside Amazon SageMaker AI training containers.

SageMaker invokes this script with standard AWS environment variables:
- SM_CHANNEL_TRAINING: Directory containing input training dataset
- SM_MODEL_DIR: Directory where model artifacts must be saved
- SM_OUTPUT_DATA_DIR: Directory for additional metrics / output artifacts
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

# Add project root to path
sys_path = Path(__file__).resolve().parents[1]
import sys
if str(sys_path) not in sys.path:
    sys.path.insert(0, str(sys_path))

from aerogrid.config import DATA_DIR, MODEL_DIR
from aerogrid.train import train


def parse_args():
    parser = argparse.ArgumentParser(description="SageMaker Training Entry Point for AeroGrid")
    parser.add_argument("--pollutant", type=str, default="pm25", choices=["pm25"])

    # SageMaker standard environment variables
    parser.add_argument(
        "--model-dir",
        type=str,
        default=os.environ.get("SM_MODEL_DIR", str(MODEL_DIR)),
        help="SageMaker model artifact directory",
    )
    parser.add_argument(
        "--training-dir",
        type=str,
        default=os.environ.get("SM_CHANNEL_TRAINING", str(DATA_DIR)),
        help="SageMaker training channel directory",
    )
    parser.add_argument(
        "--output-data-dir",
        type=str,
        default=os.environ.get("SM_OUTPUT_DATA_DIR", str(DATA_DIR)),
        help="SageMaker output data directory",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    print(f"=== Starting Amazon SageMaker AI Training for {args.pollutant.upper()} ===")
    print(f"  Training Input Channel: {args.training_dir}")
    print(f"  Model Output Dir:       {args.model_dir}")

    # Ensure input dataset is in expected place
    training_channel_path = Path(args.training_dir)
    src_dataset = training_channel_path / "training_dataset.csv"
    dst_dataset = DATA_DIR / "training_dataset.csv"

    if src_dataset.exists() and src_dataset != dst_dataset:
        print(f"Copying {src_dataset} -> {dst_dataset} ...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_dataset, dst_dataset)

    # Execute training pipeline
    metrics = train(args.pollutant)
    print("\nTraining completed successfully inside SageMaker container!")
    print(json.dumps(metrics, indent=2))

    # Copy output artifacts to SageMaker model directory
    model_dir_path = Path(args.model_dir)
    model_dir_path.mkdir(parents=True, exist_ok=True)

    pollutant = args.pollutant.lower().replace(".", "")
    model_src = MODEL_DIR / f"{pollutant}_model.joblib"
    metrics_src = MODEL_DIR / f"{pollutant}_metrics.json"

    if model_src.exists():
        shutil.copy2(model_src, model_dir_path / f"{pollutant}_model.joblib")
        # SageMaker convention: also provide standard model.joblib
        shutil.copy2(model_src, model_dir_path / "model.joblib")
        print(f"Copied model bundle to {model_dir_path}")

    if metrics_src.exists():
        shutil.copy2(metrics_src, model_dir_path / f"{pollutant}_metrics.json")
        print(f"Copied metrics to {model_dir_path}")

    print("SageMaker model artifacts are prepared for packaging.")


if __name__ == "__main__":
    main()
