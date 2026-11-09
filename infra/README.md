# Machines

The engine always reports the machine it runs on (`GET /nodes`). If `infra/nodes.json` exists, its nodes are merged in. A missing or unreadable file is ignored.

`infra/nodes.json` is generated and gitignored, because it describes your own machines. `nodes.example.json` shows the shape.

## Probe

```bash
PROBE_HOSTS="gpu-box edge-1" PROBE_P8_HOST=p8 bash infra/probe.sh
```

- `PROBE_HOSTS` lists ssh destinations: `~/.ssh/config` aliases or `user@host`. Nothing is hard-coded.
- `PROBE_P8_HOST` is the ThinkStation P8. If it is unset, the P8 is listed as the intended target, unreachable.
- The script uses `ssh -o BatchMode=yes -o ConnectTimeout=8` and tries each host once.
- It reads GPU names (`nvidia-smi` or `system_profiler`), checks for `ffmpeg` and `python3`, and lists weight-like file names under the usual cache directories.
- It does not install drivers, copy weights, or change remote machines.

Every node uses `raw_video_policy: never-leaves`.

## Roles

| Role | Meaning |
| --- | --- |
| `dev` | The machine running the probe. |
| `target-workstation` | ThinkStation P8 with RTX PRO 6000 Blackwell: raw video, SAM 3.1, Whisper, and 30B+ weights all run here. |
| `accelerator` | Optional extra GPU host. Raw video is still never sent to it by this build. |
