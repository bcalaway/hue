# hue architecture

`hue` is a household Hue lighting controller made of two components: a Python hub that runs on the AWS hub behind Traefik and Authentik, and a C++ agent on each site's NUC that is the only thing talking to that site's Hue bridge. This page shows how changes get from a request to production, and how the pieces are wired together at runtime. For the platform mechanics (reusable workflows, OIDC roles, SSM, Traefik, Authentik) see the platform repo's [`docs/app-platform.md`](https://github.com/bcalaway/nyc_pa_aws_gitops/blob/main/docs/app-platform.md) rather than re-reading them here.

## DevOps workflow

```mermaid
flowchart TD
    Bill["Bill<br/>voice or chat request, or his own commit"]
    Agent["Coding agent on nuc4<br/>opens a PR, never merges or deploys"]
    Bill --> Agent
    Agent --> PR["Pull request"]

    subgraph CI ["PR CI: ci.yml, reusable app-ci.yml: lint, test, build Docker stages"]
        CIHub["hub / Build, test, lint<br/>required check, about 2 min"]
        CIAgent["agent / Build, test, lint<br/>not required, slow C++ and gRPC build,<br/>can take over an hour"]
    end
    PR --> CIHub
    PR --> CIAgent

    CIHub --> Merge{"Bill merges to main<br/>human gate"}
    CIAgent -.-> Merge
    Bill -.-> Merge

    subgraph CD ["CD: cd.yml on push to main"]
        subgraph HubPath ["hub path: auto-deploy"]
            HBuild["app-build-push.yml<br/>builds hub/Dockerfile<br/>React frontend built into the Python image"]
            HECR[("ECR repo hue<br/>via OIDC role hue-github-actions")]
            HDeploy["app-deploy.yml<br/>stages hub/deploy/docker-compose.yml<br/>in the S3 deploy bucket"]
            HSSM["ssm:SendCommand to the AWS hub"]
            HRun["Hub pulls the image, builds .env from SSM,<br/>runs docker compose up -d"]
            HBuild --> HECR --> HDeploy --> HSSM --> HRun
        end
        subgraph AgentPath ["agent path: build and push only"]
            ABuild["Builds agent/Dockerfile<br/>C++, vcpkg binary cache via GitHub Packages"]
            AECR[("ECR repo hue-agent<br/>same OIDC role")]
            ABuild --> AECR
        end
    end
    Merge --> HBuild
    Merge --> ABuild

    AECR -. "not auto-deployed" .-> Ansible
    Approval["Bill's approval"] --> Ansible
    Ansible["Platform repo Ansible hue-agent role<br/>run from the hub: Platform deploy workflow<br/>or scripts/deploy-nucs.sh"]
    Ansible --> Relay["Hub pulls the image from ECR and relays it to each NUC<br/>as a docker save and load tarball<br/>since the NUCs have no AWS credentials"]
    Relay --> NUCs["Agent running on nuc4 and nuc5"]
```

- The coding agent only ever opens PRs. Merging is Bill's call, and nothing deploys without a merge to main.
- Only `hub / Build, test, lint` is a required check. The agent job is slow and can run over an hour, so it does not block merging.
- The hub path is fully automatic: merge, build, push, stage, and `docker compose up -d` with no further approval.
- The agent image is pushed to ECR on every merge but never reaches the NUCs on its own. Rolling it out is a separate, approved Ansible run.
- Both ECR repos use the same `hue-github-actions` role, so there is one OIDC trust even though the deploy paths differ.

## Infrastructure

```mermaid
flowchart LR
    User["User browser"]
    R53["Route 53<br/>hue.billandjessie.com"]
    EIP["Hub Elastic IP"]
    User --> R53 --> EIP

    subgraph AWS ["AWS"]
        subgraph Hub ["Hub EC2 10.0.3.1, Docker network home-platform"]
            Traefik["Traefik<br/>TLS, Authentik forward-auth and OIDC login"]
            HueHub["hue hub container, port 8000<br/>Python backend and built React UI"]
            PG[("Shared Postgres<br/>hue's own database,<br/>persists scene-alternation animations")]
            Authentik["Authentik"]
        end
        subgraph AWSSvc ["AWS services"]
            ECR[("ECR<br/>hue and hue-agent")]
            SSM["SSM Parameter Store"]
            S3[("S3 deploy bucket")]
        end
    end
    EIP --> Traefik
    Traefik <--> Authentik
    Traefik --> HueHub
    HueHub --> PG
    HueHub -. "image pull, .env, compose file at deploy time" .-> AWSSvc

    subgraph NYC ["NYC site"]
        NUC4["nuc4<br/>hue agent, C++ gRPC server, port 9090"]
        BridgeNYC["NYC Hue bridge<br/>on the LAN"]
        NUC4 -- "Hue CLIP v2 API" --> BridgeNYC
    end

    subgraph Rambles ["Rambles site, closed November through April"]
        NUC5["nuc5<br/>hue agent, C++ gRPC server, port 9090"]
        BridgeR["Rambles Hue bridge<br/>on the LAN"]
        NUC5 -- "Hue CLIP v2 API" --> BridgeR
    end

    HueHub == "gRPC over the WireGuard mesh" ==> NUC4
    HueHub == "gRPC over the WireGuard mesh" ==> NUC5

    Contract["Contract: proto/agent_service.proto<br/>shared by both builds"]
    Contract -.-> HueHub
    Contract -.-> NUC4
    Contract -.-> NUC5
```

- Browsers only ever reach Traefik, which terminates TLS and checks Authentik before forwarding to the hub container on port 8000.
- The hub talks to each agent over gRPC across the WireGuard mesh. Agents are never exposed through Traefik or the internet.
- Each agent talks to its local bridge over the Hue CLIP v2 API. The hub never talks to a bridge directly.
- Scene-alternation animations are stored in hue's own database on the shared Postgres, so they survive a hub redeploy.
- The Rambles site is closed November through April, so its agent and bridge may be unreachable in that window.
- `proto/agent_service.proto` is the contract between hub and agent, shared by the Python and C++ builds.
