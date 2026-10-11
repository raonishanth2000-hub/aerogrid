# AeroGrid documentation

| Document | Status |
| --- | --- |
| [api-contract.md](api-contract.md) | **Current**: the endpoints served by `aerogrid/api.py` |
| [model-evaluation.md](model-evaluation.md) | **Current**: how the PM2.5 model is validated and the latest results |
| [data-sources.md](data-sources.md) | **Current**: where the data comes from and what it is (measured vs modelled) |
| [aws-deployment.md](aws-deployment.md), [aws_architecture.md](aws_architecture.md) | Deployment design. The pipeline files (`buildspec.yml`, `taskdef.json`, `appspec*.yaml`, `aws/codedeploy/`) now target `aerogrid.api` and the root `Dockerfile` |
| [architecture.md](architecture.md), [CHECKLIST.md](CHECKLIST.md), [AMAZON_Q_DEVELOPER_INTEGRATION.md](AMAZON_Q_DEVELOPER_INTEGRATION.md), [demo-script.md](demo-script.md) | **Planned design.** These describe a larger `backend/app/...` service (alerts, notifications, campuses, `/api/v1/...`) that is not in this repository |
