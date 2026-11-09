import shutil
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from brand_forward.server import create_app


@pytest.fixture(autouse=True)
def offline_environment(monkeypatch):
    """Tests never read .env.local, never reach Ollama, and never hold a cloud key."""
    monkeypatch.setenv("BRAND_FORWARD_NO_DOTENV", "1")
    monkeypatch.setenv("BRAND_FORWARD_LOCAL", "rule")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("BRAND_FORWARD_CLOUD_KEY", raising=False)


@pytest.fixture
def data_dir() -> Path:
    root = ENGINE_ROOT / ".pytest-tmp"
    path = root / uuid.uuid4().hex
    path.mkdir(parents=True)
    yield path
    shutil.rmtree(path, ignore_errors=True)


@pytest.fixture
def client(data_dir: Path) -> TestClient:
    app = create_app(data_dir=data_dir, infra_path=data_dir / "absent-nodes.json")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def job(client) -> dict:
    response = client.post("/jobs", json={})
    assert response.status_code == 201, response.text
    return response.json()
