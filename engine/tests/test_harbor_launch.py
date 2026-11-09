"""Harbor launch end to end: measured vision, egress, hold, revise, clear, receipt, render gate."""

import copy
import hashlib
import json
import re
from pathlib import Path

import pytest

from brand_forward import llm, scene, tools
from brand_forward.canonical import canonicalize
from brand_forward.crosscheck import cross_check
from brand_forward.media import sha256_file
from brand_forward.nodes import list_nodes
from brand_forward.planner import normalize_plan, seal
from brand_forward.receipt import Signer, verify_receipt
from brand_forward.timecode import ms_tc, tc_ms

_HASH = re.compile(r"^[0-9a-f]{64}$")
_LEAK_MARKERS = ("/", "\\", ".mp4", ".png", ".jpg", "Users", "node_key", "seed", "local_path", "file:", "data:image")


def research(client, job_id, **body):
    response = client.post("/jobs/{0}/research".format(job_id), json=body)
    assert response.status_code == 200, response.text
    return response.json()


def receipt(client, job_id, proposal_id):
    response = client.post("/jobs/{0}/receipt".format(job_id), json={"proposal_id": proposal_id})
    assert response.status_code == 200, response.text
    return response.json()


def test_timecodes_canonical_bytes_and_manifest():
    assert tc_ms("00:04.200") == 4200
    assert ms_tc(3708) == "00:03.708"
    assert ms_tc(tc_ms("01:02.003")) == "01:02.003"
    assert canonicalize({"b": 1, "a": 1.0}) == b'{"a":1,"b":1}'
    manifest = json.loads((Path(__file__).resolve().parents[1] / "mcp" / "manifest.json").read_text(encoding="utf-8"))
    assert [tool["name"] for tool in manifest["tools"]] == list(tools.TOOL_NAMES)
    for tool in manifest["tools"]:
        assert tool["description"] and tool["inputSchema"]["type"] == "object"


def test_vision_is_measured_from_pixels(job):
    vision = job["vision"]
    assert vision["method"] == "template-diff.v1"
    assert vision["frame_count"] == scene.FPS * scene.DURATION_MS // 1000
    assert all(_HASH.fullmatch(frame["sha256"]) for frame in vision["frames"])
    wordmark = next(track for track in vision["tracks"] if track["track_id"] == "wordmark")
    assert wordmark["evidence"] == "pixel-measured"
    hidden = [span for span in wordmark["spans"] if not span["visible"]]
    assert len(hidden) == 1
    # The crane load arrives just before 3.8 s and lifts clear just after 5.2 s.
    assert 3600 <= tc_ms(hidden[0]["start"]) <= 3800
    assert 5200 <= tc_ms(hidden[0]["end"]) <= 5500
    assert hidden[0]["peak_coverage_bp"] > 5000
    clear = [frame for frame in vision["frames"] if tc_ms(frame["timecode"]) < 3500]
    assert max(frame["wordmark_coverage_bp"] for frame in clear) < 100
    events = {event["stage"]: event for event in job["events"]}
    assert events["vision"]["mode"] == "measured"
    assert events["ingest"]["mode"] == "ffmpeg"


def test_master_is_deterministic(client, job):
    again = client.post("/jobs", json={}).json()
    assert again["asset"]["sha256"] == job["asset"]["sha256"]
    assert [f["sha256"] for f in again["vision"]["frames"]] == [f["sha256"] for f in job["vision"]["frames"]]


def test_proxy_is_small_and_leaks_nothing(client, job, data_dir: Path):
    response = client.get("/jobs/{0}/proxy".format(job["id"]))
    assert response.status_code == 200
    assert response.headers["x-brandforward-export"] == "metadata-proxy"
    assert len(response.content) < 4096
    for marker in _LEAK_MARKERS:
        assert marker not in response.text, marker
    proxy = response.json()
    assert proxy == job["proxy"]
    assert proxy["asset_sha256"] == job["asset"]["sha256"]
    assert {track["track_id"] for track in proxy["tracks"]} == {"product_hero", "talent", "wordmark"}
    talent = next(track for track in proxy["tracks"] if track["track_id"] == "talent")
    assert talent["redacted"] is True and talent["redaction"] == "face"
    assert all("box" not in track for track in proxy["tracks"])
    assert "ja" in proxy["languages"]
    frame_hashes = {frame["sha256"] for frame in job["vision"]["frames"]}
    assert proxy["keyframes"] and all(item["sha256"] in frame_hashes for item in proxy["keyframes"])
    master = next(data_dir.rglob("master.mp4"))
    assert sha256_file(master) == proxy["asset_sha256"]
    assert master.read_bytes()[:4096] not in response.content
    whole = client.get("/jobs/{0}".format(job["id"])).text
    assert "local_path" not in whole and str(data_dir) not in whole


def test_scripted_cloud_claim_is_held_with_frame_evidence(client, job):
    body = research(client, job["id"])
    assert body["route"] == "cloud"
    assert body["cloud_called"] is False
    assert body["egress"]["status"] == "scripted"
    assert body["egress"]["bytes"] == 0 and body["egress"]["raw_media_bytes"] == 0
    proposal = body["proposal"]
    assert proposal["mode"] == "scripted" and proposal["source"] == "cloud"
    assert proposal["input_proxy_sha256"]
    report = client.post("/jobs/{0}/verify".format(job["id"]), json={"proposal_id": proposal["id"]}).json()
    assert report["verdict"] == "hold"
    failed = {check["id"]: check for check in report["checks"] if not check["passed"]}
    assert set(failed) == {"logo-hold-visible", "claim-c1"}
    evidence = failed["logo-hold-visible"]["evidence"]
    frames = {frame["index"]: frame for frame in job["vision"]["frames"]}
    assert frames[evidence["worst_frame"]]["sha256"] == evidence["worst_frame_sha256"]
    assert evidence["worst_coverage_bp"] >= evidence["threshold_bp"]
    signed = receipt(client, job["id"], proposal["id"])
    assert signed["body"]["verdict"] == "hold"
    assert signed["body"]["opinion"]["provider"] == "scripted"
    assert signed["body"]["measured"]["asset_sha256"] == job["asset"]["sha256"]
    blocked = client.post("/jobs/{0}/render".format(job["id"]), json={"proposal_id": proposal["id"]})
    assert blocked.status_code == 409


def test_revision_with_failed_checks_clears_and_renders(client, job, data_dir: Path):
    held = research(client, job["id"])["proposal"]
    revised = research(client, job["id"], revise=held["id"])
    assert revised["route"] == "cloud"
    assert revised["proposal"]["revises"] == held["id"]
    assert revised["egress"]["kind"] == "revision"
    payload = client.get("/jobs/{0}/egress/{1}".format(job["id"], revised["egress"]["seq"]))
    assert payload.status_code == 200
    assert hashlib.sha256(payload.content).hexdigest() == revised["egress"]["payload_sha256"]
    sent = json.loads(payload.content)
    assert [message["role"] for message in sent["messages"]] == ["system", "user", "assistant", "user"]
    assert "logo-hold-visible" in sent["messages"][3]["content"]
    for marker in ("Users", "local_path", ".mp4", ".png"):
        assert marker not in payload.text

    cleared = receipt(client, job["id"], revised["proposal"]["id"])
    assert cleared["body"]["verdict"] == "clear"
    rendered = client.post("/jobs/{0}/render".format(job["id"]), json={"proposal_id": revised["proposal"]["id"]})
    assert rendered.status_code == 200, rendered.text
    out = rendered.json()
    assert out["receipt_id"] == cleared["receipt_id"]
    proof = data_dir / "jobs" / job["id"] / "renders" / "proof.mp4"
    assert sha256_file(proof) == out["sha256"] and proof.stat().st_size == out["bytes"]
    assert out["command"][0] == "ffmpeg" and not any(part.startswith("/") for part in out["command"])
    media = client.get("/jobs/{0}/media/proof.mp4".format(job["id"]))
    assert media.status_code == 200 and hashlib.sha256(media.content).hexdigest() == out["sha256"]
    # Nothing to revise once a proposal is clear.
    again = client.post("/jobs/{0}/research".format(job["id"]), json={"revise": revised["proposal"]["id"]})
    assert again.status_code == 409


def test_link_down_never_transmits_and_fails_over(client, job, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("no network call is allowed while the link is down")

    monkeypatch.setattr(llm, "openai_chat", forbidden)
    body = research(client, job["id"], link="down", provider="live")
    assert body["cloud_called"] is False and body["offline"] is True
    assert body["route"] == "local-failover"
    assert body["egress"]["status"] == "blocked" and body["egress"]["bytes"] == 0
    proposal = body["proposal"]
    assert proposal["source"] == "local-failover" and proposal["provider"] == "rule"
    signed = receipt(client, job["id"], proposal["id"])
    assert signed["body"]["verdict"] == "clear"
    legacy = research(client, job["id"], offline=True)
    assert legacy["route"] == "local-failover"


def test_live_cloud_without_key_fails_over(client, job):
    body = research(client, job["id"], provider="live")
    assert body["route"] == "local-failover"
    assert body["egress"]["status"] == "failed"
    assert body["egress"]["transmitted"] is False
    assert "no cloud API key" in body["egress"]["reason"]


def test_live_cloud_answers_and_schema_breaks_fail_over(client, job, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    monkeypatch.setattr(llm, "openai_chat", lambda config, body: '{"summary": "no plan"}')
    broken = research(client, job["id"], provider="live")
    assert broken["route"] == "local-failover"
    assert broken["egress"]["status"] == "rejected"
    assert broken["egress"]["transmitted"] is True and broken["egress"]["bytes"] > 0

    good = {
        "summary": "Reveal at the end.",
        "wordmark_hold": {"start": "00:05.400", "end": "00:06.000"},
        "lower_third": {"start": "00:00.500", "end": "00:02.500", "text": "MIRA"},
        "face_blur": True,
        "claims": [],
    }
    monkeypatch.setattr(llm, "openai_chat", lambda config, body: json.dumps(good))
    answered = research(client, job["id"], provider="live")
    assert answered["route"] == "cloud" and answered["proposal"]["mode"] == "live"
    assert receipt(client, job["id"], answered["proposal"]["id"])["body"]["verdict"] == "clear"


def test_redaction_layout_and_geometry_checks(job):
    vision = job["vision"]
    base = {
        "summary": "x",
        "wordmark_hold": {"start": "00:01.000", "end": "00:02.000"},
        "lower_third": {"start": "00:00.500", "end": "00:02.500", "text": "MIRA"},
        "face_blur": True,
        "claims": [],
    }

    def verdict(raw):
        proposal = seal(
            proposal_id="p-1", source="local", provider="rule", model="m", mode="deterministic",
            normalized=normalize_plan(raw, duration_ms=6000), proxy=job["proxy"],
        )
        return cross_check(proposal, vision)

    assert verdict(base)["verdict"] == "clear"
    unblurred = dict(base, face_blur=False)
    report = verdict(unblurred)
    assert report["verdict"] == "hold"
    assert [c["id"] for c in report["checks"] if not c["passed"]] == ["talent-face-redacted"]
    # The mistake Gemma made in testing: calling a redacted face occluded.
    confused = dict(base, claims=[{"track_id": "talent", "asserted": "occluded", "start": "00:00.000", "end": "00:06.000"}])
    assert verdict(confused)["verdict"] == "hold"


def test_plan_schema_rejects_bad_answers():
    from brand_forward.errors import PlanInvalid

    good = {
        "summary": "x",
        "wordmark_hold": {"start": "00:01.000", "end": "00:02.000"},
        "lower_third": {"start": "00:00.500", "end": "00:02.500", "text": "MIRA"},
        "face_blur": True,
        "claims": [],
    }
    assert normalize_plan(json.dumps(good), duration_ms=6000)["plan"]["face_blur"] is True
    for bad in (
        "not json",
        dict(good, wordmark_hold={"start": "00:05.000", "end": "00:07.000"}),
        dict(good, wordmark_hold={"start": "00:02.000", "end": "00:01.000"}),
        dict(good, face_blur="yes"),
        dict(good, claims=[{"track_id": "ufo", "asserted": "fully_visible", "start": "00:01.000", "end": "00:02.000"}]),
        dict(good, lower_third={"start": "00:00.500", "end": "00:02.500", "text": "  "}),
    ):
        with pytest.raises(PlanInvalid):
            normalize_plan(bad, duration_ms=6000)


def test_receipts_are_deterministic_and_tamper_evident(client, job, data_dir: Path):
    proposal_id = research(client, job["id"], link="down")["proposal"]["id"]
    first = receipt(client, job["id"], proposal_id)
    second = receipt(client, job["id"], proposal_id)
    assert first["body"] == second["body"] and first["signature"] == second["signature"]
    assert set(first["body"]) >= {"measured", "opinion", "checks", "verdict"}
    assert client.get("/jobs/{0}/receipt/verify".format(job["id"])).json()["valid"] is True
    assert client.post("/receipts/verify", json=first).json()["valid"] is True

    tampered = copy.deepcopy(first)
    tampered["body"]["verdict"] = "hold"
    assert client.post("/receipts/verify", json=tampered).json()["valid"] is False
    evidence = copy.deepcopy(first)
    evidence["body"]["checks"][0]["evidence"]["frames_examined"] = 1
    assert verify_receipt(evidence, pinned_public_b64=first["public_key"]) is False
    forged = Signer.generate().sign(first["body"])
    assert verify_receipt(forged, pinned_public_b64=first["public_key"]) is False
    assert client.post("/receipts/verify", json=[]).json()["valid"] is False

    path = data_dir / "jobs" / job["id"] / "job.json"
    saved = json.loads(path.read_text(encoding="utf-8"))
    saved["receipts"][0]["body"]["verdict"] = "hold"
    path.write_text(json.dumps(saved), encoding="utf-8")
    assert client.get("/jobs/{0}/receipt/verify".format(job["id"])).json()["valid"] is False
    blocked = client.post("/jobs/{0}/render".format(job["id"]), json={"proposal_id": proposal_id})
    assert blocked.status_code == 409


def test_render_refuses_a_swapped_master(client, job, data_dir: Path):
    proposal_id = research(client, job["id"], link="down")["proposal"]["id"]
    receipt(client, job["id"], proposal_id)
    master = data_dir / "jobs" / job["id"] / "master.mp4"
    master.write_bytes(master.read_bytes() + b"\x00")
    blocked = client.post("/jobs/{0}/render".format(job["id"]), json={"proposal_id": proposal_id})
    assert blocked.status_code == 409
    assert "master" in blocked.json()["detail"]


def test_frames_nodes_and_errors(client, job, data_dir: Path):
    frame = client.get("/jobs/{0}/frames/100.jpg?w=640".format(job["id"]))
    assert frame.status_code == 200 and frame.headers["content-type"] == "image/jpeg"
    assert frame.content[:2] == b"\xff\xd8"
    assert client.get("/jobs/{0}/frames/999.jpg".format(job["id"])).status_code == 404
    assert client.get("/jobs/job_0000000000000000").status_code == 404
    assert client.get("/jobs/../etc").status_code == 404
    assert client.post("/jobs", json={"fixture_id": "../x"}).status_code == 404
    assert client.post("/jobs/{0}/verify".format(job["id"]), json={"proposal_id": "nope"}).status_code == 404
    assert client.get("/jobs/{0}/media/master.mp4".format(job["id"])).status_code == 200
    assert client.get("/jobs/{0}/media/proof.mp4".format(job["id"])).status_code == 404

    health = client.get("/health").json()
    assert health["ok"] is True and health["public_key"]
    nodes = client.get("/nodes").json()["nodes"]
    assert nodes[0]["raw_media_leaves_machine"] is False
    assert nodes[0]["capabilities"]["vision"]["state"] == "real"
    assert nodes[0]["capabilities"]["local_reasoner"]["state"] == "rule"

    infra = data_dir / "nodes.json"
    infra.write_text("{", encoding="utf-8")
    assert "warning" in list_nodes(infra)
    infra.write_text(json.dumps({"nodes": [{"id": "local-m5-max"}, {"id": "p8"}]}), encoding="utf-8")
    assert [node["id"] for node in list_nodes(infra)["nodes"]] == ["local-m5-max", "p8"]
