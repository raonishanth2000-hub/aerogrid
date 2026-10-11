# AeroGrid AWS Deployment & Cloud Infrastructure Guide

## 1. Hosting Architecture

AeroGrid is containerized using multi-stage non-root Docker builds and deployed on:
1. **Amazon ECS Fargate** (or AWS App Runner) for the backend microservice.
2. **Amazon S3 & CloudFront** for frontend SPA hosting.
3. **Amazon S3** for persistent storage of ML models and observation archives.
4. **AWS AppConfig** for zero-downtime runtime configuration and feature flag management.

---

## 2. Continuous Delivery Pipeline (AWS CodePipeline)

```
GitHub (Source) ───> AWS CodeBuild (Test & ECR Push) ───> AWS CodeDeploy (ECS Blue/Green)
```

- **`buildspec.yml`**: Compiles code, runs `pytest` test suites with JUnit XML reporting, builds Docker containers, and pushes images to Amazon ECR.
- **`appspec.yaml`**: Coordinates zero-downtime Blue/Green traffic shifts with pre-traffic validation against `/api/v1/health/readiness`.
- **`aws/cloudformation/codepipeline-stack.yaml`**: Full CloudFormation template for automated one-click provisioning.

---

## 3. Least-Privilege IAM Policy

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
    },
    {
      "Sid": "AeroGridAppConfigAccess",
      "Effect": "Allow",
      "Action": [
        "appconfig:StartConfigurationSession",
        "appconfig:GetLatestConfiguration"
      ],
      "Resource": "*"
    }
  ]
}
```
