import json
import os
from dataclasses import dataclass
from typing import Any

import requests

from config import SETTINGS


class SimvolyConfigError(RuntimeError):
    pass


class SimvolyAPIError(RuntimeError):
    pass


def get_nested(obj: Any, path: str, default=None):
    if not path:
        return obj
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part, default)
        else:
            return default
    return cur


def render_template_json(template: str, values: dict[str, Any]) -> dict:
    # JSON encode values first, then substitute string placeholders safely.
    # Templates are meant to be simple JSON objects from environment variables.
    rendered = template
    for key, value in values.items():
        token = "{" + key + "}"
        if token in rendered:
            # Most env templates wrap placeholders in quotes. Escape the inserted value.
            escaped = str(value if value is not None else "").replace("\\", "\\\\").replace('"', '\\"')
            rendered = rendered.replace(token, escaped)
    try:
        result = json.loads(rendered or "{}")
    except json.JSONDecodeError as exc:
        raise SimvolyConfigError(f"Invalid JSON body template: {exc}") from exc
    if not isinstance(result, dict):
        raise SimvolyConfigError("Body template must decode to a JSON object.")
    return result


@dataclass
class Project:
    id: str
    name: str
    status: str
    plan: str
    domain: str
    owner_email: str
    created_at: str
    raw: dict


class SimvolyClient:
    def __init__(self):
        self.s = SETTINGS

    def _headers(self) -> dict[str, str]:
        if not self.s.api_key:
            return {"Accept": "application/json", "Content-Type": "application/json"}
        token = f"{self.s.auth_prefix} {self.s.api_key}".strip()
        return {
            self.s.auth_header: token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, *, json_body: dict | None = None) -> Any:
        if not self.s.api_base_url:
            raise SimvolyConfigError("SIMVOLY_API_BASE_URL is not configured.")
        if not path:
            raise SimvolyConfigError("The required Simvoly endpoint path is not configured.")
        url = f"{self.s.api_base_url}/{path.lstrip('/')}"
        try:
            resp = requests.request(
                method.upper(),
                url,
                headers=self._headers(),
                json=json_body,
                timeout=self.s.timeout_seconds,
                verify=self.s.verify_ssl,
            )
        except requests.RequestException as exc:
            raise SimvolyAPIError(f"Could not reach Simvoly: {exc}") from exc
        if not resp.ok:
            detail = resp.text[:1200]
            raise SimvolyAPIError(f"Simvoly returned HTTP {resp.status_code}: {detail}")
        if not resp.content:
            return {}
        try:
            return resp.json()
        except ValueError:
            return {"raw_text": resp.text}

    def list_projects(self) -> list[Project]:
        if self.s.mock_mode:
            return self._mock_projects()
        data = self._request(
            os.getenv("SIMVOLY_LIST_PROJECTS_METHOD", "GET"),
            os.getenv("SIMVOLY_LIST_PROJECTS_PATH", ""),
        )
        records = get_nested(data, os.getenv("SIMVOLY_PROJECTS_JSON_PATH", ""), data)
        if isinstance(records, dict):
            # Common fallback containers.
            for key in ("projects", "data", "items", "results"):
                if isinstance(records.get(key), list):
                    records = records[key]
                    break
        if not isinstance(records, list):
            raise SimvolyAPIError("List-projects response did not resolve to a list. Check SIMVOLY_PROJECTS_JSON_PATH.")
        return [self._map_project(r) for r in records if isinstance(r, dict)]

    def _map_project(self, raw: dict) -> Project:
        def f(env_name: str, default_path: str, default=""):
            path = os.getenv(env_name, default_path)
            value = get_nested(raw, path, default)
            return "" if value is None else str(value)
        return Project(
            id=f("SIMVOLY_PROJECT_ID_FIELD", "id"),
            name=f("SIMVOLY_PROJECT_NAME_FIELD", "name", "Unnamed site"),
            status=f("SIMVOLY_PROJECT_STATUS_FIELD", "status", "unknown"),
            plan=f("SIMVOLY_PROJECT_PLAN_FIELD", "plan", "starter"),
            domain=f("SIMVOLY_PROJECT_DOMAIN_FIELD", "domain"),
            owner_email=f("SIMVOLY_PROJECT_OWNER_EMAIL_FIELD", "owner.email"),
            created_at=f("SIMVOLY_PROJECT_CREATED_FIELD", "created_at"),
            raw=raw,
        )

    def create_site(self, values: dict[str, str]) -> dict:
        if self.s.mock_mode:
            return {"id": f"demo-{values['subdomain']}", "status": "active", "mock": True}

        user_template = os.getenv(
            "SIMVOLY_CREATE_USER_BODY",
            '{"email":"{email}","first_name":"{first_name}","last_name":"{last_name}"}',
        )
        project_template = os.getenv(
            "SIMVOLY_CREATE_PROJECT_BODY",
            '{"name":"{site_name}","owner_email":"{email}","plan":"{plan}","subdomain":"{subdomain}"}',
        )
        user_result = self._request(
            os.getenv("SIMVOLY_CREATE_USER_METHOD", "POST"),
            os.getenv("SIMVOLY_CREATE_USER_PATH", ""),
            json_body=render_template_json(user_template, values),
        )
        project_values = dict(values)
        # Allow project body template to reference returned user id when present.
        if isinstance(user_result, dict):
            project_values["user_id"] = user_result.get("id") or get_nested(user_result, "data.id", "")
        project_result = self._request(
            os.getenv("SIMVOLY_CREATE_PROJECT_METHOD", "POST"),
            os.getenv("SIMVOLY_CREATE_PROJECT_PATH", ""),
            json_body=render_template_json(project_template, project_values),
        )
        return {"user": user_result, "project": project_result}

    def project_action(self, project_id: str, action: str) -> Any:
        if action not in {"suspend", "reactivate", "cancel"}:
            raise ValueError("Unsupported action")
        if self.s.mock_mode:
            return {"id": project_id, "action": action, "mock": True}

        prefix = action.upper()
        method = os.getenv(f"SIMVOLY_{prefix}_PROJECT_METHOD", "POST")
        path_template = os.getenv(f"SIMVOLY_{prefix}_PROJECT_PATH", "")
        path = path_template.replace("{project_id}", str(project_id))
        body_template = os.getenv(f"SIMVOLY_{prefix}_BODY", "{}")
        body = render_template_json(body_template, {"project_id": project_id})
        return self._request(method, path, json_body=body if method.upper() != "GET" else None)

    @staticmethod
    def _mock_projects() -> list[Project]:
        rows = [
            {"id": "demo-1001", "name": "Buckeye Roofing", "status": "active", "plan": "premium", "domain": "buckeyeroofing.example", "owner": {"email": "owner@example.com"}, "created_at": "2026-07-01"},
            {"id": "demo-1002", "name": "Lakeview RV", "status": "active", "plan": "elite", "domain": "lakeviewrv.example", "owner": {"email": "marketing@example.com"}, "created_at": "2026-06-15"},
            {"id": "demo-1003", "name": "Main Street Dental", "status": "suspended", "plan": "starter", "domain": "mainstreetdental.example", "owner": {"email": "office@example.com"}, "created_at": "2026-05-10"},
        ]
        client = SimvolyClient.__new__(SimvolyClient)
        return [client._map_project(r) for r in rows]
