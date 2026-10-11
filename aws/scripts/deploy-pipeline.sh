#!/usr/bin/env bash
set -e

echo "=== AeroGrid AWS CI/CD Pipeline Deployment Script ==="

STACK_NAME=${1:-"aerogrid-cicd-pipeline"}
REGION=${AWS_REGION:-"ap-south-1"}
GITHUB_REPO=${GITHUB_REPO:-"vedant/aerogrid"}
GITHUB_BRANCH=${GITHUB_BRANCH:-"main"}
CONNECTION_ARN=${CODESTAR_CONNECTION_ARN:-""}

if [ -z "$CONNECTION_ARN" ]; then
    echo "Notice: CODESTAR_CONNECTION_ARN is not set."
    echo "Usage: CODESTAR_CONNECTION_ARN=arn:aws:codestar-connections:... ./deploy-pipeline.sh [STACK_NAME]"
    echo "Proceeding with dry-run CloudFormation template validation..."
    aws cloudformation validate-template \
        --template-body file://aws/cloudformation/codepipeline-stack.yaml \
        --region "$REGION"
    echo "CloudFormation template syntax validated successfully."
    exit 0
fi

echo "Deploying CloudFormation stack: $STACK_NAME in $REGION ..."

aws cloudformation deploy \
    --template-file aws/cloudformation/codepipeline-stack.yaml \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --parameter-overrides \
        GitHubRepository="$GITHUB_REPO" \
        GitHubBranch="$GITHUB_BRANCH" \
        CodeStarConnectionArn="$CONNECTION_ARN"

echo "=== Pipeline deployed successfully! ==="
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs" \
    --output table
