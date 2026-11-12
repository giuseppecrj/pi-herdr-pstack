# Source playbooks

The why skill spawns one investigator per available evidence category, each reading a single source-specific playbook below. The playbooks are concrete examples for common MCPs. Adapt them for a different MCP in the same category.

| Category | Playbook | Example MCP it documents |
|---|---|---|
| Source control history | `references/sources/code-archaeology.md` | git, `gh` |
| Issue / ticket tracker | `references/sources/linear.md` | Linear (adapt for Jira, GitHub Issues, Plane, Shortcut) |
| Long-form documents | `references/sources/notion.md` | Notion (adapt for Confluence, Google Docs, Coda) |
| Real-time team chat | `references/sources/slack.md` | Slack (adapt for Discord, Microsoft Teams, Mattermost) |
| Infrastructure observability | `references/sources/datadog.md` | Datadog (adapt for New Relic, Honeycomb, Grafana, Splunk) |
| Error / exception tracking | `references/sources/sentry.md` | Sentry (adapt for Rollbar, Bugsnag, Airbrake) |
| Product analytics warehouse | `references/sources/databricks.md` | Databricks SQL (adapt for Snowflake, BigQuery, ClickHouse, dbt) |

Cross-cutting:

- `references/sources/incident-postmortem.md`. Add this if the target code looks defensive (null checks, retry, timeout, rate limit, feature flag, egress guard, OOM handler).
