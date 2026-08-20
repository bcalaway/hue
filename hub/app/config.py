import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # APP_NAME must match this app's ECR repo / IAM role name / Route53
    # subdomain -- see docs/app-platform.md in nyc_pa_aws_gitops.
    app_name: str = os.environ.get("APP_NAME", "hue")

    # SESSION_SECRET should come from SSM (/home-platform/hue/session-secret)
    # once deployed -- the default here is only for local dev/tests.
    session_secret: str = os.environ.get("SESSION_SECRET", "dev-insecure-secret-change-me")

    # Authentik OIDC (ADR-0017, Pattern A). Both unset means auth routes
    # respond 501 instead of crashing.
    authentik_base_url: str = os.environ.get("AUTHENTIK_BASE_URL", "https://auth.billandjessie.com")
    authentik_client_id: str | None = os.environ.get("AUTHENTIK_CLIENT_ID")
    authentik_client_secret: str | None = os.environ.get("AUTHENTIK_CLIENT_SECRET")

    # Milestone 12's MVP is NYC-only -- a single agent connection, not a
    # per-site map, since multi-site aggregation in the UI isn't designed
    # yet. Unset means the state view degrades gracefully (empty/unreachable)
    # rather than crashing, same pattern as Postgres/Authentik above in the
    # other templates.
    agent_host: str = os.environ.get("AGENT_HOST", "")
    agent_port: int = int(os.environ.get("AGENT_PORT", "9090"))


settings = Settings()
