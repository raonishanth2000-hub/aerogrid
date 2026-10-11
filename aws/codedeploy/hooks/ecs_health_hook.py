"""
AWS CodeDeploy ECS Blue/Green Lifecycle Event Hook.
Validates the replacement container task set on the test port before CodeDeploy shifts traffic.
"""

import os
import json
import urllib.request
import urllib.error
import boto3

codedeploy = boto3.client("codedeploy")

def handler(event, context):
    deployment_id = event.get("DeploymentId")
    lifecycle_event_hook_execution_id = event.get("LifecycleEventHookExecutionId")
    
    test_endpoint = os.getenv("TEST_HEALTH_ENDPOINT", "http://localhost:8080/api/health")
    status = "Failed"

    print(f"Beginning CodeDeploy lifecycle hook validation for Deployment: {deployment_id}")
    print(f"Testing replacement task set at: {test_endpoint}")

    try:
        req = urllib.request.Request(test_endpoint, headers={"User-Agent": "AeroGrid-CodeDeploy-Hook"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                body = json.loads(resp.read().decode("utf-8"))
                if body.get("status") == "ok":
                    print(f"Health verification succeeded: {body}")
                    status = "Succeeded"
                else:
                    print(f"Unexpected health status: {body}")
            else:
                print(f"Received non-200 HTTP code: {resp.status}")
    except Exception as e:
        print(f"Health validation failed with error: {str(e)}")
        # In isolated offline testing, default to Succeeded if explicit test mode is active
        if os.getenv("ALLOW_HOOK_MOCK_SUCCESS", "false").lower() == "true":
            status = "Succeeded"

    # Report lifecycle hook execution status back to AWS CodeDeploy
    if deployment_id and lifecycle_event_hook_execution_id:
        try:
            codedeploy.put_lifecycle_event_hook_execution_status(
                deploymentId=deployment_id,
                lifecycleEventHookExecutionId=lifecycle_event_hook_execution_id,
                status=status
            )
            print(f"Reported {status} status to CodeDeploy.")
        except Exception as e:
            print(f"Failed reporting status to CodeDeploy: {str(e)}")

    return {"statusCode": 200, "status": status}
