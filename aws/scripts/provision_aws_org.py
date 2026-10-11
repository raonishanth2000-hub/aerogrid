"""
AeroGrid AWS Organization Provisioning & Integration Script.
Uses Boto3 to:
1. Verify caller identity (AWS Account ID, IAM ARN) via STS.
2. Provision AWS AppConfig (Application, Environment, Profile, Hosted Configuration, Deployment).
3. Provision Amazon ECR Repository for backend container images.
4. Provision AWS CodeBuild and AWS CodeDeploy resources.
5. Save active resource IDs into .env for the AeroGrid FastAPI backend.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("aerogrid.aws_provisioner")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = REPO_ROOT / ".env"
APPCONFIG_DOC = REPO_ROOT / "aws" / "appconfig" / "default-config.json"


def get_aws_session(
    access_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    session_token: Optional[str] = None,
    region: Optional[str] = None
) -> boto3.Session:
    """Build and validate Boto3 session from passed credentials or environment."""
    key = access_key or os.getenv("AWS_ACCESS_KEY_ID")
    secret = secret_key or os.getenv("AWS_SECRET_ACCESS_KEY")
    token = session_token or os.getenv("AWS_SESSION_TOKEN")
    reg = region or os.getenv("AWS_REGION", "ap-south-1")

    session_kwargs = {"region_name": reg}
    if key and secret:
        session_kwargs["aws_access_key_id"] = key
        session_kwargs["aws_secret_access_key"] = secret
        if token:
            session_kwargs["aws_session_token"] = token

    return boto3.Session(**session_kwargs)


def verify_identity(session: boto3.Session) -> Dict[str, str]:
    """Verify AWS STS caller identity."""
    sts = session.client("sts")
    try:
        identity = sts.get_caller_identity()
        logger.info(f"Connected to AWS Account: {identity.get('Account')}")
        logger.info(f"IAM Principal ARN: {identity.get('Arn')}")
        return {
            "account_id": identity.get("Account", ""),
            "arn": identity.get("Arn", ""),
            "user_id": identity.get("UserId", "")
        }
    except (NoCredentialsError, ClientError) as e:
        logger.error(f"AWS authentication failed: {e}")
        raise RuntimeError(f"Invalid or missing AWS credentials: {e}")


def provision_appconfig(session: boto3.Session) -> Dict[str, str]:
    """Provision AWS AppConfig Application, Environment, Profile, and initial Deployment."""
    appconfig = session.client("appconfig")
    app_name = "AeroGrid"
    env_name = "production"
    profile_name = "AeroGridRuntimeConfig"

    logger.info("--- [1/3] Provisioning AWS AppConfig ---")

    # 1. Create or retrieve Application
    app_id = None
    try:
        apps = appconfig.list_applications().get("Items", [])
        for a in apps:
            if a.get("Name") == app_name:
                app_id = a.get("Id")
                logger.info(f"Found existing AppConfig Application: {app_name} (Id: {app_id})")
                break
        if not app_id:
            res = appconfig.create_application(
                Name=app_name,
                Description="AeroGrid Environmental Intelligence Platform Runtime Configuration"
            )
            app_id = res["Id"]
            logger.info(f"Created AppConfig Application: {app_name} (Id: {app_id})")
    except ClientError as e:
        logger.error(f"Error creating AppConfig Application: {e}")
        raise

    # 2. Create or retrieve Environment
    env_id = None
    try:
        envs = appconfig.list_environments(ApplicationId=app_id).get("Items", [])
        for e in envs:
            if e.get("Name") == env_name:
                env_id = e.get("Id")
                logger.info(f"Found existing AppConfig Environment: {env_name} (Id: {env_id})")
                break
        if not env_id:
            res = appconfig.create_environment(
                ApplicationId=app_id,
                Name=env_name,
                Description="Production deployment environment"
            )
            env_id = res["Id"]
            logger.info(f"Created AppConfig Environment: {env_name} (Id: {env_id})")
    except ClientError as e:
        logger.error(f"Error creating AppConfig Environment: {e}")
        raise

    # 3. Create or retrieve Configuration Profile
    profile_id = None
    try:
        profiles = appconfig.list_configuration_profiles(ApplicationId=app_id).get("Items", [])
        for p in profiles:
            if p.get("Name") == profile_name:
                profile_id = p.get("Id")
                logger.info(f"Found existing AppConfig Configuration Profile: {profile_name} (Id: {profile_id})")
                break
        if not profile_id:
            res = appconfig.create_configuration_profile(
                ApplicationId=app_id,
                Name=profile_name,
                LocationUri="hosted",
                Type="AWS.Freeform",
                Description="Dynamic parameters and feature flags"
            )
            profile_id = res["Id"]
            logger.info(f"Created AppConfig Configuration Profile: {profile_name} (Id: {profile_id})")
    except ClientError as e:
        logger.error(f"Error creating AppConfig Configuration Profile: {e}")
        raise

    # 4. Create Hosted Configuration Version & Deploy
    try:
        content_bytes = APPCONFIG_DOC.read_bytes() if APPCONFIG_DOC.exists() else b'{"data_mode": "demo"}'
        version_resp = appconfig.create_hosted_configuration_version(
            ApplicationId=app_id,
            ConfigurationProfileId=profile_id,
            Content=content_bytes,
            ContentType="application/json",
            Description="Initial baseline deployment from repository default-config.json"
        )
        version_num = version_resp["VersionNumber"]
        logger.info(f"Created Hosted Configuration Version: #{version_num}")

        # Deploy immediately using AWS predefined strategy
        deploy_resp = appconfig.start_deployment(
            ApplicationId=app_id,
            EnvironmentId=env_id,
            DeploymentStrategyId="AppConfig.AllAtOnce",
            ConfigurationProfileId=profile_id,
            ConfigurationVersion=str(version_num),
            Description="Automated deployment by AeroGrid integration script"
        )
        logger.info(f"Started AppConfig Deployment #{deploy_resp.get('DeploymentNumber')}")
    except ClientError as e:
        logger.warning(f"Note on configuration deployment: {e}")

    return {
        "application_id": app_id,
        "environment_id": env_id,
        "profile_id": profile_id
    }


def provision_ecr(session: boto3.Session) -> str:
    """Create or verify Amazon ECR repository for AeroGrid backend."""
    ecr = session.client("ecr")
    repo_name = "aerogrid-backend"
    logger.info("--- [2/3] Provisioning Amazon ECR Repository ---")

    try:
        res = ecr.create_repository(
            repositoryName=repo_name,
            imageScanningConfiguration={"scanOnPush": True}
        )
        uri = res["repository"]["repositoryUri"]
        logger.info(f"Created Amazon ECR repository: {uri}")
        return uri
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "RepositoryAlreadyExistsException":
            desc = ecr.describe_repositories(repositoryNames=[repo_name])
            uri = desc["repositories"][0]["repositoryUri"]
            logger.info(f"Amazon ECR repository already exists: {uri}")
            return uri
        else:
            logger.error(f"ECR error: {e}")
            raise


def provision_codedeploy_app(session: boto3.Session) -> str:
    """Create or verify AWS CodeDeploy Application."""
    cd = session.client("codedeploy")
    app_name = "AeroGrid-Backend-Application"
    logger.info("--- [3/3] Provisioning AWS CodeDeploy Application ---")

    try:
        cd.create_application(
            applicationName=app_name,
            computePlatform="ECS"
        )
        logger.info(f"Created CodeDeploy ECS Application: {app_name}")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ApplicationAlreadyExistsException":
            logger.info(f"CodeDeploy Application already exists: {app_name}")
        else:
            logger.warning(f"CodeDeploy setup note: {e}")

    return app_name


def update_env_file(config_data: Dict[str, str]):
    """Update or append settings into .env file safely."""
    lines = []
    existing_keys = set()
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line_strip = line.strip()
            if line_strip and not line_strip.startswith("#") and "=" in line_strip:
                k = line_strip.split("=", 1)[0].strip()
                existing_keys.add(k)
                if k in config_data:
                    lines.append(f"{k}={config_data[k]}")
                    continue
            lines.append(line)

    for k, v in config_data.items():
        if k not in existing_keys:
            lines.append(f"{k}={v}")

    ENV_FILE.write_text("\n".join(lines) + "\n")
    logger.info(f"Updated configuration in: {ENV_FILE}")


def run_provisioning(
    access_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    session_token: Optional[str] = None,
    region: Optional[str] = None
) -> Dict[str, Any]:
    """Execute end-to-end cloud provisioning and wire backend."""
    session = get_aws_session(access_key, secret_key, session_token, region)
    region_name = session.region_name or "ap-south-1"

    # Step 1: Verify Identity
    identity = verify_identity(session)

    # Step 2: Provision AppConfig
    appconfig_res = provision_appconfig(session)

    # Step 3: Provision ECR
    ecr_uri = provision_ecr(session)

    # Step 4: Provision CodeDeploy Application
    codedeploy_app = provision_codedeploy_app(session)

    # Step 5: Save to .env
    env_updates = {
        "AWS_REGION": region_name,
        "AWS_ACCOUNT_ID": identity["account_id"],
        "AWS_APPCONFIG_ENABLED": "true",
        "AWS_APPCONFIG_APPLICATION_ID": appconfig_res["application_id"],
        "AWS_APPCONFIG_ENVIRONMENT_ID": appconfig_res["environment_id"],
        "AWS_APPCONFIG_PROFILE_ID": appconfig_res["profile_id"],
        "IMAGE_REPO_NAME": "aerogrid-backend",
        "ECR_REPOSITORY_URI": ecr_uri,
        "CODEDEPLOY_APPLICATION_NAME": codedeploy_app
    }
    if access_key and secret_key:
        env_updates["AWS_ACCESS_KEY_ID"] = access_key
        env_updates["AWS_SECRET_ACCESS_KEY"] = secret_key
        if session_token:
            env_updates["AWS_SESSION_TOKEN"] = session_token

    update_env_file(env_updates)

    logger.info("=== AWS Cloud Integration Completed Successfully! ===")
    return {
        "account_id": identity["account_id"],
        "arn": identity["arn"],
        "region": region_name,
        "appconfig": appconfig_res,
        "ecr_uri": ecr_uri,
        "codedeploy_app": codedeploy_app
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AeroGrid AWS Provisioner")
    parser.add_argument("--access-key", help="AWS Access Key ID")
    parser.add_argument("--secret-key", help="AWS Secret Access Key")
    parser.add_argument("--session-token", help="AWS Session Token (optional)")
    parser.add_argument("--region", default="ap-south-1", help="AWS Region (default: ap-south-1)")

    args = parser.parse_args()

    try:
        res = run_provisioning(
            access_key=args.access_key,
            secret_key=args.secret_key,
            session_token=args.session_token,
            region=args.region
        )
        print(json.dumps(res, indent=2))
    except Exception as exc:
        logger.error(f"Provisioning failed: {exc}")
        sys.exit(1)
