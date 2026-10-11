# AeroGrid Architectural Blueprint

AeroGrid is a location-aware environmental intelligence and early warning platform designed for continuous particulate monitoring, spatial cross-validation, and predictive hazard mitigation.

---

## 1. System Context & Component Architecture

```mermaid
graph TD
    Client["AeroGrid Frontend (React + Vite + Leaflet)"]
    API["AeroGrid FastAPI Backend (:8000)"]
    
    subgraph Data Layer
        DB[("SQLite / PostgreSQL Database")]
        S3[("Amazon S3 Object Store")]
        AppConfig["AWS AppConfig (Dynamic Feature Flags)"]
    end

    subgraph Analytics & Modeling
        SpatialRF["Spatial Random Forest (ml/artifacts/model.joblib)"]
        CoverageEngine["Spatial Coverage & Gap Evaluator"]
        AlertEngine["Hysteresis-Aware Alert Engine"]
    end

    Client -->|HTTP / JSON REST API| API
    API --> DB
    API --> S3
    API --> AppConfig
    API --> SpatialRF
    API --> CoverageEngine
    API --> AlertEngine
```

---

## 2. Release & CI/CD Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant Git as GitHub Repository
    participant Pipeline as AWS CodePipeline
    participant Build as AWS CodeBuild
    participant Deploy as AWS CodeDeploy
    participant ECS as Amazon ECS Fargate

    Dev->>Git: git push origin main
    Git->>Pipeline: Webhook Trigger
    Pipeline->>Build: Execute buildspec.yml
    Build->>Build: Run pytest + coverage + ruff
    Build->>Build: Build & tag Docker image
    Build->>Pipeline: Emit imagedefinitions.json
    Pipeline->>Deploy: Trigger Blue/Green Deployment
    Deploy->>ECS: Provision Replacement Task Set (Green)
    Deploy->>ECS: Ping /api/v1/health/readiness (Test Listener)
    Deploy->>ECS: Shift Production Traffic to Green
    Deploy->>Pipeline: Deployment Succeeded
```

---

## 3. Provider Abstraction Pattern

The platform enforces clean decoupled boundaries via dependency inversion:
1. **`BaseStorageProvider`**: Transparently switches between `LocalStorageProvider` and `S3StorageProvider`.
2. **`BaseConfigProvider`**: Dynamically polls `AppConfigProvider` with session token rotation, falling back to static environment variables.
3. **`BaseMLProvider`**: Supports `SklearnModelAdapter` with calibrated 95% confidence intervals and `DemoProvider` fallback.
4. **`BaseDataProvider`**: Ingests live CPCB / OpenAQ observations with realistic deterministic demo fallbacks.
