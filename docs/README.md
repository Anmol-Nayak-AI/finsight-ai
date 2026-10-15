# FinSight AI Documentation

This directory contains the end-to-end technical and operational documentation for FinSight AI.

## Documentation map

| Document | Purpose |
|---|---|
| [Project documentation](PROJECT_DOCUMENTATION.md) | Product scope, architecture, workflows, AI/RAG design, data model, API, security, testing, operations, and limitations |
| [Project documentation PDF](../output/pdf/FinSight_AI_Project_Documentation.pdf) | Interview-ready, printable edition of the complete project documentation |
| [Free Render deployment](DEPLOY_RENDER.md) | Step-by-step Neon and Render deployment guide |
| [Architecture source](../architecture.mmd) | Mermaid source for the system architecture diagram |
| [Repository README](../README.md) | Project overview and quick start |
| [Environment template](../.env.example) | Supported local and production configuration keys |

## Recommended reading paths

**Evaluator or interviewer:** Read the executive summary, architecture, AI pipeline, workflow guarantees, security model, testing strategy, and current limitations in the [project documentation](PROJECT_DOCUMENTATION.md).

**Developer:** Follow the local setup, configuration, API, data model, and testing sections in the [project documentation](PROJECT_DOCUMENTATION.md).

**Operator:** Read the production configuration and operations runbook, followed by the [Render deployment guide](DEPLOY_RENDER.md).

## Documentation conventions

- `Maker` means an AML Analyst who investigates and recommends an action.
- `Checker` means an independent MLRO officer who records the binding internal decision.
- `Regulator` means an FIU-IND officer who can close an externally escalated case.
- Statements marked **Current implementation** describe behavior present in the repository.
- Statements marked **Production evolution** describe recommended future work and are not claims about the deployed portfolio environment.
