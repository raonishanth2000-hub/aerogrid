# AeroGrid — AWS Cloud Architecture & Deployment Guide

## 1. Architectural Overview

AeroGrid employs a hybrid cloud architecture designed to run seamlessly in local environments without requiring AWS credentials, while offering production deployment on Amazon Web Services.

```
                           +------------------------+
                           |  Internet / End Users  |
                           +-----------+------------+
                                       |
                                       v
                    +--------------------------------------+
                    |      AWS CloudFront CDN / ALB        |
                    +------------------+-------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
       +-----------------------+               +-----------------------+
       |   Static Web Hosting  |               |    AWS App Runner     |
       |  (S3 + CloudFront or  |               |          OR           |
       |    ECS Container)     |               |    Amazon ECS Fargate |
       |   AeroGrid Frontend   |               |   AeroGrid FastAPI    |
       +-----------------------+               +-----------+-----------+
                                                           |
                                           +---------------+---------------+
                                           |                               |
                                           v                               v
                               +-----------------------+       +-----------------------+
                               |     Amazon S3         |       |   Amazon RDS / Aurora |
                               |  - Processed Datasets |       |   PostgreSQL / SQLite |
                               |  - Model Artifacts    |       |  - Alert Rules & Log  |
                               |  - Evaluation Reports |       |  - Community Actions  |
                               +-----------------------+       +-----------------------+
```

## 2. Amazon S3 Storage Strategy

AeroGrid uses Amazon Simple Storage Service (S3) for durable, scalable object storage:

| Storage Key Prefix | Purpose | Lifecycle Policy |
| :--- | :--- | :--- |
| `artifacts/models/` | Trained Joblib model artifacts (`*.joblib`) & feature metadata | Standard Storage, Versioning Enabled |
| `artifacts/evaluations/` | Held-out validation JSON reports and residual plots | Standard-IA after 90 days |
| `datasets/snapshots/` | Daily normalized observation archives (Parquet/CSV) | Glacier Instant Retrieval after 30 days |
| `backups/db/` | Periodic SQLite / database state snapshots | Expire after 14 days |

### S3 Local Development Fallback
When running locally:
- If `AWS_S3_BUCKET` is unset, AeroGrid automatically uses `LocalStorageProvider` (`backend/data_storage/`).
- The application never crashes due to missing AWS credentials.
- When configured, `S3StorageProvider` uses `boto3` to interact with S3.

## 3. Least-Privilege IAM Policy

For container execution on AWS App Runner or ECS Task Role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AeroGridS3StorageAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::aerogrid-production-artifacts",
        "arn:aws:s3:::aerogrid-production-artifacts/*"
      ]
    }
  ]
}
```

## 4. Hosting Options

### Option A: AWS App Runner (Recommended for Speed and Cost-Efficiency)
- Fully managed container execution.
- Automatic SSL termination and auto-scaling from 1 to 5 instances based on concurrent requests.
- Zero infrastructure maintenance.

### Option B: Amazon ECS Fargate
- Serverless containers behind an Application Load Balancer.
- Useful when VPC peering is required for secure relational databases (RDS PostgreSQL).

## 5. Cost Drivers & Financial Control
1. **App Runner / Fargate Compute**: ~$15–$25/month for baseline 0.5 vCPU, 1 GB RAM instance.
2. **Amazon S3**: ~$0.50/month for model artifacts and snapshot archives (< 20 GB).
3. **Data Transfer**: Negligible (< $2/month) due to responsible in-memory caching (10 min TTL).

## 6. Continuous Integration & Continuous Delivery (CI/CD)

AeroGrid backend utilizes a fully managed AWS release pipeline connecting repository sources, automated testing, container builds, and zero-downtime blue/green deployment:

```
+--------------------+        +---------------------+        +--------------------+
|  GitHub Repository |  --->  |    AWS CodeBuild    |  --->  |   AWS CodeDeploy   |
|   (Source Stage)   |        | (Test & Docker ECR) |        | (ECS Blue / Green) |
+--------------------+        +---------------------+        +--------------------+
                                         ^
                                         | Orchestrated by
                              +--------------------+
                              |  AWS CodePipeline  |
                              +--------------------+
```

### A. AWS CodeBuild (`buildspec.yml`)
- Automates dependencies installation and syntax/lint checks (`ruff`).
- Executes the automated backend test suite (`pytest`) with JUnit XML test reporting and Cobertura code coverage metrics.
- Builds multi-stage Docker container images and pushes them to Amazon ECR tagged with the Git commit hash.
- Generates `imagedefinitions.json` and task definitions for downstream deployment.

### B. AWS CodeDeploy (`appspec.yaml`)
- Automates zero-downtime blue/green deployments to Amazon ECS Fargate.
- Provisions replacement tasks and tests them via test listeners before shifting production traffic (`AfterAllowTestTraffic` hook).
- Provides instant automatic rollback if CloudWatch alarms report elevated error rates or health check failures.

### C. AWS CodePipeline (`aws/cloudformation/codepipeline-stack.yaml`)
- Coordinates the release pipeline end-to-end.
- Connects GitHub commits directly to CodeBuild test validation and CodeDeploy deployment stages.

## 7. Dynamic Runtime Configuration with AWS AppConfig

AeroGrid integrates AWS AppConfig to eliminate redeployment requirements for runtime configuration adjustments:
- **Zero-Downtime Updates**: Dynamically adjust parameters like `stale_after_minutes`, `alert_hysteresis_factor`, `alert_cooldown_minutes`, and `data_mode` across all running instances without restarting processes.
- **Feature Flags**: Safely gate experimental machine learning forecasting and emergency alert notifications with canary rollouts.
- **Resilience**: The backend provider (`AppConfigProvider`) implements session token rotation and local caching with automatic fallback to static configuration if AWS AppConfig is unreachable.

## 8. AI-Assisted Engineering with Amazon Q Developer

Amazon Q Developer is integrated directly into the AeroGrid engineering workflow:
- **Context Awareness**: Configured with `.amazonq/rules/aerogrid-backend-rules.md` to uphold FastAPI patterns, Pydantic validation, and clean provider abstractions.
- **Prompt Recipes**: Pre-configured recipes in `.amazonq/prompts/backend-cookbook.md` for explaining spatial algorithms (`/explain`), generating unit tests (`/test`), debugging runtime exceptions (`/fix`), and optimizing bottlenecks (`/refactor`).

