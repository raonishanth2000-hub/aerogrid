# Amazon Q Developer Integration Guide for AeroGrid

This guide explains how to leverage **Amazon Q Developer** (both in-IDE chat, inline completions, and CLI) to improve code quality, explain complex algorithms, write tests, diagnose errors, and refactor the AeroGrid backend.

---

## 1. Overview & Setup

Amazon Q Developer is an AI-powered conversational assistant designed for developers that integrates directly into your IDE (VS Code, JetBrains) and command-line terminal.

### Installation in VS Code
1. Install the **AWS Toolkit** extension from the VS Code Marketplace.
2. Click the **Amazon Q** icon in the activity bar (or use `Cmd+Shift+P` -> `Amazon Q: Focus on Chat View`).
3. Sign in using your **AWS Builder ID** (free) or **AWS IAM Identity Center** credentials.
4. Ensure the `.amazonq/rules/aerogrid-backend-rules.md` workspace rule file is present in your workspace root. Amazon Q Developer automatically detects and uses these project guidelines.

---

## 2. Core Capabilities & Everyday Usage

### A. Explaining Complex Functions (`/explain`)
The AeroGrid backend contains complex mathematical algorithms (CPCB NAQI sub-index breakpoints, spatial Haversine calculation, and Random Forest spatial interpolation).

**How to use:**
1. Highlight any function in `backend/app/utils/geo.py`, `backend/app/utils/aqi.py`, or `backend/app/services/alert_engine.py`.
2. Right-click and choose **Amazon Q > Explain Selected Code**, or type in the Amazon Q Chat panel:
   ```text
   /explain how haversine_distance_km and inverse_distance_weighting work in backend/app/utils/geo.py
   ```
3. Amazon Q will provide a step-by-step mathematical breakdown, formula explanation, and time complexity analysis.

### B. Writing Automated Unit Tests (`/test`)
Amazon Q can write comprehensive `pytest` test suites tailored to AeroGrid's architecture, including Pydantic validation checks and mocked AWS Boto3 clients.

**How to use:**
1. Open any backend router or service (e.g., `backend/app/api/v1/interventions.py` or `backend/app/providers/config/appconfig_provider.py`).
2. Type in chat:
   ```text
   /test Generate unit tests for this file following the conventions in backend/tests/conftest.py
   ```
3. Amazon Q generates mock fixtures, boundary test cases, edge cases (such as token expiration or invalid coordinates), and assertion checks.

### C. Debugging Runtime Errors & Exceptions (`/fix`)
When facing exceptions (like database lock contention, Boto3 `ClientError`, or Pydantic validation errors):

**How to use:**
1. Paste the error traceback into Amazon Q Chat.
2. Prompt:
   ```text
   @workspace I'm getting botocore.exceptions.ClientError: AccessDeniedException when calling StartConfigurationSession.
   How should the IAM task role policy in aws/cloudformation/codepipeline-stack.yaml be updated?
   ```
3. Amazon Q references your workspace files, locates the exact IAM policy block, and provides the corrected configuration.

### D. Refactoring Slow Backend Code (`/refactor` or Chat)
Amazon Q can profile and refactor Python bottlenecks into high-performance vectorized operations or optimized database queries.

**How to use:**
1. Ask Amazon Q:
   ```text
   @workspace How can we optimize calculate_coverage_gaps in backend/app/services/coverage_service.py using NumPy vectorization?
   ```
2. Amazon Q rewrites Python loops with `numpy.linalg` or spatial distance matrices, reducing latencies from ~120ms to <5ms.

### E. Code Security & Vulnerability Scanning (`/review`)
Run instant static security analyses on backend files:
1. In chat, type `/review` or open the Amazon Q menu and choose **Run Security Scan**.
2. Amazon Q inspects code for OWASP Top 10 vulnerabilities, hardcoded credentials, insecure regex, and unhandled SQL injections.

---

## 3. Pre-Configured Prompt Recipes

Refer to [`.amazonq/prompts/backend-cookbook.md`](file:///Users/vedant/Downloads/aerogrid-main/.amazonq/prompts/backend-cookbook.md) for ready-to-copy prompt templates covering:
- Geo-spatial calculation explanation
- Dynamic AppConfig feature flag unit tests
- Multi-station alert flapping prevention tuning
- Database connection pool tuning
