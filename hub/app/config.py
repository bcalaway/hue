import os
from dataclasses import dataclass, field


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

    # One agent per site (ADR-0020) -- a fixed site list, not a parsed
    # compound env var, since the sites themselves don't change often and
    # this keeps each site's config a plain optional string. A site whose
    # host is unset (e.g. before that site's NUC deploy exists) degrades
    # that site to unavailable in the API response rather than crashing,
    # same pattern the single-site MVP used for AGENT_HOST.
    agent_hosts: dict[str, str] = field(
        default_factory=lambda: {
            "nyc": os.environ.get("AGENT_HOST_NYC", ""),
            "rambles": os.environ.get("AGENT_HOST_RAMBLES", ""),
        }
    )
    agent_port: int = int(os.environ.get("AGENT_PORT", "9090"))

    # Postgres (ADR-0016), for animation configs (Milestone 14) -- the only
    # thing this app persists. Unset means not onboarded yet / running
    # locally without a database, same graceful-degradation contract as
    # todo-app's identical settings.
    postgres_host: str = os.environ.get("POSTGRES_HOST", "postgres")
    postgres_password: str | None = os.environ.get("POSTGRES_PASSWORD")


settings = Settings()
