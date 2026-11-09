#!/usr/bin/env bash
# Read-only probe for the BrandForward node registry.
#
#   PROBE_HOSTS="gpu-box edge-1" PROBE_P8_HOST=p8 bash infra/probe.sh
#
# Hosts are ssh destinations you supply: ~/.ssh/config aliases or user@host.
# Nothing is hard-coded. The probe reads GPU names, checks for ffmpeg and
# python3, and lists weight-like file names in the usual cache directories.
# It does not install software, copy weights, or change remote machines.
# Writes infra/nodes.json (gitignored). The engine merges it into GET /nodes.
set -u
set -o pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/brandforward-probe.XXXXXX") || exit 1
trap 'rm -rf "$WORK"' EXIT

SSH_OPTS=(-T -o BatchMode=yes -o RequestTTY=no -o ConnectTimeout=8 -o ConnectionAttempts=1
  -o ControlMaster=no -o ControlPath=none -o StrictHostKeyChecking=accept-new)

PROBE=$(cat <<'EOF'
if command -v ffmpeg >/dev/null 2>&1; then echo "FFMPEG=yes"; else echo "FFMPEG=no"; fi
if command -v python3 >/dev/null 2>&1; then echo "PYTHON3=yes"; else echo "PYTHON3=no"; fi
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | while IFS= read -r line; do
    [ -n "$line" ] && echo "GPU_LINE=$line"
  done
elif command -v system_profiler >/dev/null 2>&1; then
  system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print "GPU_LINE=" $2}'
fi
for base in "$HOME/.ollama/models/manifests"; do
  [ -d "$base" ] && find "$base" -mindepth 3 -maxdepth 3 -type d 2>/dev/null | while IFS= read -r p; do echo "OLLAMA_NAME=$(basename "$p")"; done
done
for base in "$HOME/models" "$HOME/.cache/huggingface/hub" "$HOME/.cache/whisper" /models /opt/models; do
  [ -d "$base" ] && find "$base" -maxdepth 3 \( -iname '*.gguf' -o -iname 'sam*.pt' -o -iname '*segment-anything*' -o -iname '*whisper*' -o -iname 'models--*' \) -print 2>/dev/null | while IFS= read -r p; do echo "WEIGHT_NAME=$(basename "$p")"; done
done
EOF
)

probe() {
  local id="$1" role="$2" dest="$3"
  if [ "$dest" = "local" ]; then
    bash -c "$PROBE" >"$WORK/$id.out" 2>/dev/null; echo $? >"$WORK/$id.rc"
  else
    ssh "${SSH_OPTS[@]}" "$dest" "bash -c $(printf '%q' "$PROBE")" >"$WORK/$id.out" 2>"$WORK/$id.err"; echo $? >"$WORK/$id.rc"
  fi
  printf '%s\t%s\n' "$id" "$role" >>"$WORK/index.tsv"
}

probe this-machine dev local
if [ -n "${PROBE_P8_HOST:-}" ]; then probe thinkstation-p8 target-workstation "$PROBE_P8_HOST"; fi
for host in ${PROBE_HOSTS:-}; do
  probe "$(printf '%s' "$host" | tr -c 'A-Za-z0-9-' '-' | sed 's/-*$//')" accelerator "$host"
done

if command -v uv >/dev/null 2>&1; then PY=(uv run --no-project python); else PY=(python3); fi
"${PY[@]}" - "$ROOT/nodes.json" "$WORK" "${PROBE_P8_HOST:-}" <<'PY'
import collections, json, os, sys

out_path, work, p8_set = sys.argv[1], sys.argv[2], bool(sys.argv[3])

def read(name):
    try:
        with open(os.path.join(work, name), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""

nodes = []
for line in read("index.tsv").splitlines():
    node_id, role = line.split("\t")
    reached = read(node_id + ".rc").strip() == "0"
    fields = collections.defaultdict(list)
    for raw in read(node_id + ".out").splitlines():
        if "=" in raw:
            key, value = raw.split("=", 1)
            if value.strip():
                fields[key].append(value.strip())
    gpus = collections.Counter(fields["GPU_LINE"])
    gpu = "; ".join("%s x%d" % (n, c) if c > 1 else n for n, c in gpus.items()) or "unknown"
    weights = sorted(set(fields["OLLAMA_NAME"] + fields["WEIGHT_NAME"]))[:16]
    nodes.append({
        "id": node_id,
        "role": role,
        "gpu": gpu if reached else "unknown",
        "status": ("local" if role == "dev" else "reachable") if reached else "unreachable",
        "ffmpeg": reached and fields["FFMPEG"][:1] == ["yes"],
        "weights_seen": weights if reached else [],
        "notes": "" if reached else "ssh did not answer (BatchMode, 8 s timeout); nothing was observed.",
        "raw_video_policy": "never-leaves",
    })
if not p8_set:
    nodes.append({
        "id": "thinkstation-p8", "role": "target-workstation", "gpu": "RTX PRO 6000 Blackwell (intended)",
        "status": "unreachable", "ffmpeg": False, "weights_seen": [],
        "notes": "Intended target. Set PROBE_P8_HOST to probe it.", "raw_video_policy": "never-leaves",
    })
tmp = out_path + ".tmp"
with open(tmp, "w", encoding="utf-8") as fh:
    json.dump({"nodes": nodes}, fh, indent=2)
    fh.write("\n")
os.replace(tmp, out_path)
print("wrote", out_path)
for n in nodes:
    print("%-20s %-12s %-40s ffmpeg=%s" % (n["id"], n["status"], n["gpu"][:40], "yes" if n["ffmpeg"] else "no"))
PY
