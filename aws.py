"""Amazon Web Services (AWS) integration for AeroGrid.

Provides seamless support for:
1. Amazon S3: Cloud storage and syncing of air quality datasets and model artifacts.
2. Amazon SageMaker AI: Managed cloud model training and artifact management.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aerogrid.config import (
    AWS_REGION, DATA_DIR, MODEL_DIR, S3_BUCKET_NAME, S3_PREFIX,
    SAGEMAKER_ROLE_ARN,
)

# SageMaker AWS Prebuilt Scikit-Learn Docker Images per region
# Supports Scikit-Learn 1.2 / 1.4 managed containers
SKLEARN_FRAMEWORK_VERSION = "1.2-1"
SAGEMAKER_SKLEARN_ECR_ACCOUNTS = {
    "us-east-1": "683313688378",
    "us-east-2": "257758044811",
    "us-west-1": "633205212912",
    "us-west-2": "246669023296",
    "ap-south-1": "720646828776",      # Mumbai, India
    "ap-southeast-1": "121021134169",  # Singapore
    "ap-northeast-1": "354808040042",  # Tokyo
    "eu-west-1": "141502667606",       # Ireland
    "eu-central-1": "492215442770",    # Frankfurt
}


def _get_boto3():
    try:
        import boto3
        return boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 is required for AWS integration. Install it with: pip install boto3"
        ) from exc


def get_s3_client():
    """Return an authenticated boto3 S3 client."""
    boto3 = _get_boto3()
    try:
        return boto3.client("s3", region_name=AWS_REGION or "ap-south-1")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialize S3 client: {exc}. "
            "Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set."
        ) from exc


def get_sagemaker_client():
    """Return an authenticated boto3 SageMaker client."""
    boto3 = _get_boto3()
    try:
        return boto3.client("sagemaker", region_name=AWS_REGION or "ap-south-1")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialize SageMaker client: {exc}. "
            "Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set."
        ) from exc


def get_iam_client():
    """Return an authenticated boto3 IAM client."""
    boto3 = _get_boto3()
    try:
        return boto3.client("iam", region_name=AWS_REGION or "ap-south-1")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialize IAM client: {exc}. "
            "Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set."
        ) from exc


def get_sts_client():
    """Return an authenticated boto3 STS client."""
    boto3 = _get_boto3()
    try:
        return boto3.client("sts", region_name=AWS_REGION or "ap-south-1")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialize STS client: {exc}. "
            "Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set."
        ) from exc


def get_bucket_name(bucket: str | None = None) -> str:
    """Return the configured S3 bucket name or raise a helpful error."""
    name = (bucket or S3_BUCKET_NAME).strip()
    if not name:
        raise ValueError(
            "S3 bucket name is not configured. Set S3_BUCKET_NAME in your .env file "
            "or provide --bucket <bucket-name>."
        )
    return name


# ---------------------------------------------------------------------------
# Amazon S3 Operations
# ---------------------------------------------------------------------------

def upload_file_to_s3(local_path: str | Path, s3_key: str, bucket: str | None = None) -> str:
    """Upload a single file to Amazon S3.

    Returns the s3:// URI of the uploaded object.
    """
    path = Path(local_path)
    if not path.exists():
        raise FileNotFoundError(f"Local file not found: {path}")

    bucket_name = get_bucket_name(bucket)
    s3 = get_s3_client()
    print(f"Uploading {path.name} ({path.stat().st_size / 1024:.1f} KB) -> s3://{bucket_name}/{s3_key} ...")
    s3.upload_file(str(path), bucket_name, s3_key)
    uri = f"s3://{bucket_name}/{s3_key}"
    print(f"Uploaded: {uri}")
    return uri


def download_file_from_s3(s3_key: str, local_path: str | Path, bucket: str | None = None) -> Path:
    """Download a single object from Amazon S3 to local disk."""
    bucket_name = get_bucket_name(bucket)
    dest = Path(local_path)
    dest.parent.mkdir(parents=True, exist_ok=True)

    s3 = get_s3_client()
    print(f"Downloading s3://{bucket_name}/{s3_key} -> {dest} ...")
    s3.download_file(bucket_name, s3_key, str(dest))
    size_kb = f" ({dest.stat().st_size / 1024:.1f} KB)" if dest.exists() else ""
    print(f"Downloaded: {dest}{size_kb}")
    return dest


def sync_data_to_s3(bucket: str | None = None, prefix: str | None = None) -> list[str]:
    """Upload all datasets from data/ to Amazon S3."""
    bucket_name = get_bucket_name(bucket)
    pfx = (prefix or S3_PREFIX).strip().rstrip("/")
    uploaded = []

    files_to_sync = [
        DATA_DIR / "training_dataset.csv",
        DATA_DIR / "raw_observations.csv",
        DATA_DIR / "geo_cache.json",
    ]

    for f in files_to_sync:
        if f.exists():
            key = f"{pfx}/data/{f.name}"
            uri = upload_file_to_s3(f, key, bucket=bucket_name)
            uploaded.append(uri)
        else:
            print(f"Skipping {f.name} (not found locally)")

    return uploaded


def sync_models_to_s3(bucket: str | None = None, prefix: str | None = None) -> list[str]:
    """Upload all model bundles and metrics from models/ to Amazon S3."""
    bucket_name = get_bucket_name(bucket)
    pfx = (prefix or S3_PREFIX).strip().rstrip("/")
    uploaded = []

    for f in sorted(MODEL_DIR.glob("*")):
        if f.is_file() and not f.name.startswith("."):
            key = f"{pfx}/models/{f.name}"
            uri = upload_file_to_s3(f, key, bucket=bucket_name)
            uploaded.append(uri)

    return uploaded


def sync_models_from_s3(bucket: str | None = None, prefix: str | None = None) -> list[Path]:
    """Download model bundles and metrics from Amazon S3 into local models/ directory."""
    bucket_name = get_bucket_name(bucket)
    pfx = (prefix or S3_PREFIX).strip().rstrip("/")
    s3 = get_s3_client()
    downloaded = []

    models_prefix = f"{pfx}/models/"
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=models_prefix)
    contents = response.get("Contents") or []

    if not contents:
        print(f"No models found in s3://{bucket_name}/{models_prefix}")
        return downloaded

    for item in contents:
        key = item["Key"]
        filename = Path(key).name
        if filename:
            dest = MODEL_DIR / filename
            download_file_from_s3(key, dest, bucket=bucket_name)
            downloaded.append(dest)

    return downloaded


def sync_data_from_s3(bucket: str | None = None, prefix: str | None = None) -> list[Path]:
    """Download datasets from Amazon S3 into local data/ directory."""
    bucket_name = get_bucket_name(bucket)
    pfx = (prefix or S3_PREFIX).strip().rstrip("/")
    s3 = get_s3_client()
    downloaded = []

    data_prefix = f"{pfx}/data/"
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=data_prefix)
    contents = response.get("Contents") or []

    if not contents:
        print(f"No datasets found in s3://{bucket_name}/{data_prefix}")
        return downloaded

    for item in contents:
        key = item["Key"]
        filename = Path(key).name
        if filename:
            dest = DATA_DIR / filename
            download_file_from_s3(key, dest, bucket=bucket_name)
            downloaded.append(dest)

    return downloaded


# ---------------------------------------------------------------------------
# AWS Identity and Access Management (IAM) Operations
# ---------------------------------------------------------------------------

def verify_iam_identity() -> dict[str, Any]:
    """Verify active AWS credentials and caller identity using AWS STS.

    Returns account ID, user/role ARN, and checks S3/SageMaker configurations.
    """
    sts = get_sts_client()
    identity = sts.get_caller_identity()
    account_id = identity.get("Account")
    arn = identity.get("Arn")
    user_id = identity.get("UserId")
    region = AWS_REGION or "ap-south-1"

    print("\n=== AWS Identity & Access Management (IAM) Verification ===")
    print(f"  AWS Account ID: {account_id}")
    print(f"  IAM Principal:  {arn}")
    print(f"  User / Role ID: {user_id}")
    print(f"  AWS Region:     {region}")

    # Check S3 Bucket accessibility
    if S3_BUCKET_NAME:
        s3 = get_s3_client()
        try:
            s3.head_bucket(Bucket=S3_BUCKET_NAME)
            print(f"  Amazon S3:      s3://{S3_BUCKET_NAME} (Accessible & Verified)")
        except Exception as exc:
            print(f"  Amazon S3:      s3://{S3_BUCKET_NAME} (Access Warning: {exc})")
    else:
        print("  Amazon S3:      Not configured (Set S3_BUCKET_NAME in .env)")

    # Check SageMaker Execution Role
    if SAGEMAKER_ROLE_ARN:
        print(f"  SageMaker Role: {SAGEMAKER_ROLE_ARN}")
    else:
        print("  SageMaker Role: Not configured (Run 'python -m aerogrid.aws iam-setup-role')")

    return identity


def create_or_get_sagemaker_role(
    role_name: str = "AeroGridSageMakerExecutionRole",
    bucket: str | None = None,
) -> str:
    """Find or create an IAM execution role for Amazon SageMaker AI.

    1. Checks if the IAM role already exists.
    2. If not, creates the role with a trust policy allowing sagemaker.amazonaws.com.
    3. Attaches AmazonSageMakerFullAccess managed policy.
    4. Attaches a scoped inline policy for S3 bucket access.
    Returns the role ARN.
    """
    iam = get_iam_client()
    bucket_name = (bucket or S3_BUCKET_NAME or "").strip()

    # 1. Check if role already exists
    try:
        resp = iam.get_role(RoleName=role_name)
        role_arn = resp["Role"]["Arn"]
        print(f"Found existing IAM SageMaker role: {role_arn}")
        return role_arn
    except iam.exceptions.NoSuchEntityException:
        pass
    except Exception as exc:
        print(f"Checking existing role: {exc}")

    # 2. Create the role with SageMaker trust relationship
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "sagemaker.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }

    print(f"Creating IAM SageMaker Execution Role '{role_name}' ...")
    create_resp = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
        Description="Execution role created by AeroGrid for Amazon SageMaker AI training jobs",
    )
    role_arn = create_resp["Role"]["Arn"]
    print(f"  Role ARN created: {role_arn}")

    # 3. Attach AmazonSageMakerFullAccess
    try:
        iam.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonSageMakerFullAccess",
        )
        print("  Attached AWS Managed Policy: AmazonSageMakerFullAccess")
    except Exception as exc:
        print(f"  Warning attaching managed policy: {exc}")

    # 4. Attach scoped S3 bucket policy if bucket is configured
    if bucket_name:
        s3_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        f"arn:aws:s3:::{bucket_name}",
                        f"arn:aws:s3:::{bucket_name}/*"
                    ]
                }
            ]
        }
        try:
            iam.put_role_policy(
                RoleName=role_name,
                PolicyName="AeroGridS3AccessPolicy",
                PolicyDocument=json.dumps(s3_policy),
            )
            print(f"  Attached inline S3 policy for bucket: {bucket_name}")
        except Exception as exc:
            print(f"  Warning attaching inline S3 policy: {exc}")

    # Give IAM a brief moment to propagate permissions across AWS regions
    print("Waiting 10s for IAM role propagation across AWS services...")
    time.sleep(10)
    print(f"\nIAM Setup Complete! Add this to your .env:\nSAGEMAKER_ROLE_ARN={role_arn}\n")
    return role_arn


def generate_iam_policy_templates(bucket: str | None = None) -> dict[str, Any]:
    """Generate and display least-privilege IAM policy documents for AeroGrid."""
    bucket_name = (bucket or S3_BUCKET_NAME or "your-aerogrid-bucket-name").strip()

    developer_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AeroGridS3Access",
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket",
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    f"arn:aws:s3:::{bucket_name}",
                    f"arn:aws:s3:::{bucket_name}/*"
                ]
            },
            {
                "Sid": "AeroGridSageMakerControl",
                "Effect": "Allow",
                "Action": [
                    "sagemaker:CreateTrainingJob",
                    "sagemaker:DescribeTrainingJob",
                    "sagemaker:StopTrainingJob",
                    "sagemaker:ListTrainingJobs"
                ],
                "Resource": "*"
            },
            {
                "Sid": "AeroGridPassRoleToSageMaker",
                "Effect": "Allow",
                "Action": "iam:PassRole",
                "Resource": "arn:aws:iam::*:role/*SageMaker*",
                "Condition": {
                    "StringEquals": {
                        "iam:PassedToService": "sagemaker.amazonaws.com"
                    }
                }
            }
        ]
    }

    sagemaker_trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "sagemaker.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }

    sagemaker_permissions_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:ListBucket"
                ],
                "Resource": [
                    f"arn:aws:s3:::{bucket_name}",
                    f"arn:aws:s3:::{bucket_name}/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "cloudwatch:PutMetricData",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:CreateLogGroup",
                    "logs:DescribeLogStreams"
                ],
                "Resource": "*"
            }
        ]
    }

    print("\n=======================================================")
    print("1. LOCAL DEVELOPER IAM POLICY (Attach to your IAM User):")
    print("=======================================================")
    print(json.dumps(developer_policy, indent=2))

    print("\n=======================================================")
    print("2. SAGEMAKER EXECUTION ROLE TRUST POLICY:")
    print("=======================================================")
    print(json.dumps(sagemaker_trust_policy, indent=2))

    print("\n=======================================================")
    print("3. SAGEMAKER EXECUTION ROLE PERMISSION POLICY:")
    print("=======================================================")
    print(json.dumps(sagemaker_permissions_policy, indent=2))
    print("=======================================================\n")

    return {
        "developer_policy": developer_policy,
        "sagemaker_trust_policy": sagemaker_trust_policy,
        "sagemaker_permissions_policy": sagemaker_permissions_policy,
    }


# ---------------------------------------------------------------------------
# Amazon SageMaker AI Operations
# ---------------------------------------------------------------------------

def get_sagemaker_sklearn_image(region: str) -> str:
    """Return the AWS Managed Scikit-learn container image URI for the region."""
    account_id = SAGEMAKER_SKLEARN_ECR_ACCOUNTS.get(region, "720646828776")
    return f"{account_id}.dkr.ecr.{region}.amazonaws.com/sagemaker-scikit-learn:{SKLEARN_FRAMEWORK_VERSION}-cpu-py3"


def package_code_for_sagemaker(output_tar: Path) -> Path:
    """Create a packaged tar.gz containing AeroGrid package code for SageMaker."""
    output_tar.parent.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[1]

    with tarfile.open(output_tar, "w:gz") as tar:
        # Add aerogrid module
        aerogrid_dir = root / "aerogrid"
        if aerogrid_dir.exists():
            tar.add(str(aerogrid_dir), arcname="aerogrid")

        # Add requirements.txt
        req = root / "requirements.txt"
        if req.exists():
            tar.add(str(req), arcname="requirements.txt")

    print(f"Created SageMaker source archive: {output_tar} ({output_tar.stat().st_size / 1024:.1f} KB)")
    return output_tar


def launch_sagemaker_training_job(
    pollutant: str = "pm25",
    instance_type: str = "ml.m5.large",
    bucket: str | None = None,
    role_arn: str | None = None,
    wait: bool = True,
) -> dict[str, Any]:
    """Launch a managed Machine Learning Training Job on Amazon SageMaker AI.

    1. Syncs dataset to S3 input channel.
    2. Packages AeroGrid source code and uploads to S3.
    3. Calls SageMaker `create_training_job` with the official AWS Scikit-learn container.
    4. Optionally waits for completion, downloads model.tar.gz, and extracts it to models/.
    """
    bucket_name = get_bucket_name(bucket)
    role = (role_arn or SAGEMAKER_ROLE_ARN).strip()
    if not role:
        try:
            print("SAGEMAKER_ROLE_ARN not configured. Attempting to look up or create AeroGridSageMakerExecutionRole via IAM...")
            role = create_or_get_sagemaker_role(bucket=bucket_name)
        except Exception as exc:
            raise ValueError(
                f"SAGEMAKER_ROLE_ARN is not configured and automatic IAM role resolution failed: {exc}. "
                "Run 'python -m aerogrid.aws iam-setup-role' or set SAGEMAKER_ROLE_ARN in .env."
            ) from exc

    region = AWS_REGION or "ap-south-1"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    job_name = f"aerogrid-{pollutant.lower()}-{timestamp}"

    # 1. Verify and upload training dataset to S3
    dataset_file = DATA_DIR / "training_dataset.csv"
    if not dataset_file.exists():
        raise FileNotFoundError(
            f"Training dataset not found at {dataset_file}. "
            "Run fetch_data first or download from S3."
        )

    s3_data_key = f"{S3_PREFIX}/sagemaker/input/training_dataset.csv"
    s3_data_uri = upload_file_to_s3(dataset_file, s3_data_key, bucket=bucket_name)

    # 2. Package source code and upload to S3
    scratch_dir = Path(__file__).resolve().parents[1] / "data" / "scratch"
    tar_path = scratch_dir / "sourcedir.tar.gz"
    package_code_for_sagemaker(tar_path)
    s3_code_key = f"{S3_PREFIX}/sagemaker/code/{job_name}/sourcedir.tar.gz"
    s3_code_uri = upload_file_to_s3(tar_path, s3_code_key, bucket=bucket_name)

    # S3 output location
    s3_output_uri = f"s3://{bucket_name}/{S3_PREFIX}/sagemaker/output/"

    # 3. Create SageMaker Training Job via boto3
    sm = get_sagemaker_client()
    image_uri = get_sagemaker_sklearn_image(region)

    print(f"\nLaunching Amazon SageMaker AI Training Job: {job_name}")
    print(f"  Container:      {image_uri}")
    print(f"  Instance:       {instance_type}")
    print(f"  Role ARN:       {role}")
    print(f"  Input S3 Data:  {s3_data_uri}")
    print(f"  Output S3 URI:  {s3_output_uri}")

    training_params = {
        "TrainingJobName": job_name,
        "AlgorithmSpecification": {
            "TrainingImage": image_uri,
            "TrainingInputMode": "File",
        },
        "RoleArn": role,
        "InputDataConfig": [
            {
                "ChannelName": "training",
                "DataSource": {
                    "S3DataSource": {
                        "S3DataType": "S3Prefix",
                        "S3Uri": f"s3://{bucket_name}/{S3_PREFIX}/sagemaker/input/",
                        "S3DataDistributionType": "FullyReplicated",
                    }
                },
                "ContentType": "text/csv",
            }
        ],
        "OutputDataConfig": {
            "S3OutputPath": s3_output_uri,
        },
        "ResourceConfig": {
            "InstanceType": instance_type,
            "InstanceCount": 1,
            "VolumeSizeInGB": 10,
        },
        "StoppingCondition": {
            "MaxRuntimeInSeconds": 3600,
        },
        "HyperParameters": {
            "sagemaker_program": "aerogrid/sagemaker_entrypoint.py",
            "sagemaker_submit_directory": s3_code_uri,
            "pollutant": pollutant.lower(),
        },
    }

    sm.create_training_job(**training_params)
    print(f"\nTraining job {job_name} submitted successfully to Amazon SageMaker AI!")

    if not wait:
        print(f"Check status with: python -m aerogrid.aws sagemaker-status --job-name {job_name}")
        return {"job_name": job_name, "status": "Submitted"}

    # 4. Wait for training job completion
    return wait_for_sagemaker_job(job_name, bucket=bucket_name)


def wait_for_sagemaker_job(job_name: str, bucket: str | None = None) -> dict[str, Any]:
    """Poll SageMaker training job until completion and download artifacts."""
    sm = get_sagemaker_client()
    print(f"\nMonitoring SageMaker Training Job: {job_name} ...")

    while True:
        status_info = sm.describe_training_job(TrainingJobName=job_name)
        status = status_info["TrainingJobStatus"]
        print(f"  [{datetime.now().strftime('%H:%M:%S')}] Status: {status}")

        if status == "Completed":
            print("\nAmazon SageMaker Training Job completed successfully!")
            model_s3_uri = status_info["ModelArtifacts"]["S3ModelArtifacts"]
            print(f"Model Artifacts S3 URI: {model_s3_uri}")

            # Download and unpack model artifacts into models/
            _download_and_extract_model_artifacts(model_s3_uri, bucket=bucket)
            return status_info
        elif status == "Failed":
            reason = status_info.get("FailureReason", "Unknown failure")
            raise RuntimeError(f"SageMaker Training Job failed: {reason}")
        elif status == "Stopped":
            raise RuntimeError("SageMaker Training Job was stopped.")

        time.sleep(15)


def _download_and_extract_model_artifacts(s3_uri: str, bucket: str | None = None):
    """Download model.tar.gz from S3 and extract into local models/ directory."""
    # S3 URI is like s3://bucket/key
    parts = s3_uri.replace("s3://", "").split("/", 1)
    bucket_name = parts[0]
    key = parts[1]

    scratch_dir = Path(__file__).resolve().parents[1] / "data" / "scratch"
    local_tar = scratch_dir / f"model-{int(time.time())}.tar.gz"

    download_file_from_s3(key, local_tar, bucket=bucket_name)

    print(f"Extracting model artifacts into {MODEL_DIR} ...")
    with tarfile.open(local_tar, "r:gz") as tar:
        tar.extractall(path=MODEL_DIR)

    print("Model artifacts successfully updated in models/ directory!")


def get_sagemaker_status(job_name: str) -> dict[str, Any]:
    """Query and print the status of a SageMaker training job."""
    sm = get_sagemaker_client()
    info = sm.describe_training_job(TrainingJobName=job_name)
    status = info["TrainingJobStatus"]
    created = info.get("CreationTime", "unknown")
    runtime = info.get("TrainingTimeInSeconds", 0)

    print(f"Job Name:      {job_name}")
    print(f"Status:        {status}")
    print(f"Created:       {created}")
    print(f"Runtime:       {runtime}s")

    if status == "Completed":
        print(f"Model S3 URI:  {info['ModelArtifacts']['S3ModelArtifacts']}")
    elif status == "Failed":
        print(f"Failure Reason: {info.get('FailureReason')}")

    return info


# ---------------------------------------------------------------------------
# CLI Command Dispatcher
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AeroGrid AWS CLI: Manage Amazon S3 storage and Amazon SageMaker AI training jobs."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # S3 commands
    p_up_data = subparsers.add_parser("s3-upload-data", help="Upload local datasets to Amazon S3")
    p_up_data.add_argument("--bucket", help="S3 bucket name (defaults to S3_BUCKET_NAME from .env)")

    p_up_models = subparsers.add_parser("s3-upload-models", help="Upload trained models to Amazon S3")
    p_up_models.add_argument("--bucket", help="S3 bucket name (defaults to S3_BUCKET_NAME from .env)")

    p_down_data = subparsers.add_parser("s3-download-data", help="Download datasets from Amazon S3")
    p_down_data.add_argument("--bucket", help="S3 bucket name (defaults to S3_BUCKET_NAME from .env)")

    p_down_models = subparsers.add_parser("s3-download-models", help="Download trained models from Amazon S3")
    p_down_models.add_argument("--bucket", help="S3 bucket name (defaults to S3_BUCKET_NAME from .env)")

    # IAM commands
    p_iam_verify = subparsers.add_parser("iam-verify", help="Verify AWS IAM credentials, STS caller identity, and permissions")

    p_iam_role = subparsers.add_parser("iam-setup-role", help="Automatically create or verify the IAM SageMaker Execution Role")
    p_iam_role.add_argument("--role-name", default="AeroGridSageMakerExecutionRole", help="Name for the IAM role")
    p_iam_role.add_argument("--bucket", help="S3 bucket name to grant access to")

    p_iam_policies = subparsers.add_parser("iam-policies", help="Print copy-pasteable IAM JSON policies for developer and SageMaker")
    p_iam_policies.add_argument("--bucket", help="S3 bucket name to use in policy templates")

    # SageMaker commands
    p_sm_train = subparsers.add_parser("sagemaker-train", help="Launch a training job on Amazon SageMaker AI")
    p_sm_train.add_argument("--pollutant", choices=["pm25", "pm10"], default="pm25", help="Target pollutant")
    p_sm_train.add_argument("--instance-type", default="ml.m5.large", help="SageMaker EC2 instance type")
    p_sm_train.add_argument("--bucket", help="S3 bucket name")
    p_sm_train.add_argument("--role", help="SageMaker Execution IAM Role ARN")
    p_sm_train.add_argument("--no-wait", action="store_true", help="Submit and exit without waiting")

    p_sm_status = subparsers.add_parser("sagemaker-status", help="Check status of a SageMaker training job")
    p_sm_status.add_argument("--job-name", required=True, help="SageMaker Training Job Name")

    args = parser.parse_args()

    if args.command == "iam-verify":
        verify_iam_identity()
    elif args.command == "iam-setup-role":
        create_or_get_sagemaker_role(role_name=args.role_name, bucket=args.bucket)
    elif args.command == "iam-policies":
        generate_iam_policy_templates(bucket=args.bucket)
    elif args.command == "s3-upload-data":
        sync_data_to_s3(bucket=args.bucket)
    elif args.command == "s3-upload-models":
        sync_models_to_s3(bucket=args.bucket)
    elif args.command == "s3-download-data":
        sync_data_from_s3(bucket=args.bucket)
    elif args.command == "s3-download-models":
        sync_models_from_s3(bucket=args.bucket)
    elif args.command == "sagemaker-train":
        launch_sagemaker_training_job(
            pollutant=args.pollutant,
            instance_type=args.instance_type,
            bucket=args.bucket,
            role_arn=args.role,
            wait=not args.no_wait,
        )
    elif args.command == "sagemaker-status":
        get_sagemaker_status(args.job_name)


if __name__ == "__main__":
    main()
