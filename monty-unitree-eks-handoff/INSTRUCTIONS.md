# Monty × Unitree — EKS GPU Orchestrator
**Engineering Handoff** · v1.0 · 2025-10-26

This document hands off a production-ready approach to run Monty + Unitree/Isaac Lab simulations on **AWS EKS with GPU nodes**, supporting:
- single or batch runs,
- fresh vs. checkpointed brain state,
- configurable images/tags,
- an in-browser “glue” editor (separate repo) and
- live viewport (WebRTC/DCV) + logs/metrics/artifacts to S3.

---

## 0) TL;DR
- **Cluster**: EKS with **two node groups** (GPU for sim, CPU for control/aux).
- **Pods per run**: one **Job** spawns a **multi-container Pod** with:
  - `unitree-sim` (GPU) + WebRTC,
  - `monty` (CPU/GPU optional),
  - `glue` (ZeroMQ/gRPC bridge),
  - `artifact-uploader` sidecar (push to S3).
- **IAM**: IRSA-per-service-account, S3-scoped policies, ECR for images.
- **Addons**: NVIDIA device plugin, Cluster Autoscaler, ALB/NLB (WebRTC), CloudWatch/Fluent Bit, Metrics Server.
- **Artifacts**: checkpoints, logs, CSV metrics, optional MP4 recordings → S3 with lifecycle rules.

---

## 1) Architecture (high level)

```
[User Web UI: Next.js]
   ├─ Configure run: images/tags, brain profile, checkpoint IN/OUT
   ├─ Edit glue code (Monaco)
   └─ Viewport (WebRTC) + Logs (WS)

[Orchestrator API: FastAPI]
   ├─ Stores run config + glue tar in S3/ECR
   ├─ Creates K8s Job per run (labels: user, project, seed, profile)
   ├─ Streams logs/metrics via WS
   └─ Indexes artifacts on completion

[EKS Cluster]
   ├─ GPU NodeGroup (e.g., g5.2xlarge)
   │   └─ Pod: unitree-sim (GPU) + monty + glue + artifact-uploader
   └─ CPU NodeGroup
       ├─ Orchestrator API
       ├─ Prometheus/Grafana (optional)
       ├─ CloudWatch agent / Fluent Bit
       └─ TURN server (optional, for WebRTC)
```

**Key points**
- **Job-per-run** model enables TTL and cost control; when the Job finishes, autoscaler can drain GPU nodes.
- **Shared volume** inside Pod: `emptyDir` mounted at `/checkpoints` & `/artifacts`; sidecar syncs to S3.
- **IRSA** grants only S3 bucket prefixes the Pod needs.

---

## 2) Prerequisites

- AWS account with quota for **g5**/**g6e** in target region.
- CLI tools: `aws`, `kubectl`, `eksctl`, `helm`, `jq`.
- Domain (optional) in Route53 for frontend/API and viewport.
- ECR repos: `monty`, `unitree-sim`, `glue-base` (images pushed ahead of time).

---

## 3) Create EKS with two node groups (GPU + CPU)

Use `eksctl` (minimal friction). See `infra/eksctl-cluster.yaml` in this zip.

```bash
eksctl create cluster -f infra/eksctl-cluster.yaml
```

Install required addons:

```bash
# Metrics server
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm upgrade --install metrics-server metrics-server/metrics-server -n kube-system

# NVIDIA device plugin for Kubernetes
helm repo add nvidia https://nvidia.github.io/k8s-device-plugin
helm upgrade --install nvidia-device-plugin nvidia/k8s-device-plugin -n kube-system

# Cluster Autoscaler
helm repo add autoscaler https://kubernetes.github.io/autoscaler
helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler   -n kube-system   --set autoDiscovery.clusterName=monty-unitree-eks   --set awsRegion=$AWS_REGION   --set extraArgs.scale-down-unneeded-time=5m

# AWS Load Balancer Controller (ALB/NLB)
helm repo add eks https://aws.github.io/eks-charts
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller   -n kube-system   --set clusterName=monty-unitree-eks   --set serviceAccount.create=false   --set serviceAccount.name=aws-load-balancer-controller
```

> For **UDP/WebRTC TURN**, consider deploying a **NLB** (Service type `LoadBalancer` with UDP 3478) and a **coturn** StatefulSet. Isaac WebRTC can fall back to TCP, but TURN improves reliability across NATs.

---

## 4) Buckets, ECR, and IAM (IRSA)

- **S3 buckets** (create outside of K8s):  
  - `s3://monty-checkpoints-<env>` — brain states IN/OUT, versioned.  
  - `s3://sim-artifacts-<env>` — logs, CSV/Parquet metrics, MP4, JSON configs.  
  Apply lifecycle rules (e.g., 30–90 days for logs/videos).
- **IRSA**: bind **least-privilege** policies to **service accounts** used by Jobs. See `k8s/irsa-policy-s3.json` and `k8s/serviceaccount-irsa.yaml`.
- **ECR**: create/push images. Reference them with full ARNs in manifests.

---

## 5) Runtime: Job per run (multi-container Pod)

Each run is a **Kubernetes Job** (template in `k8s/job-run-template.yaml`):
- **Containers**
  1. `unitree-sim` — requests `resources.limits."nvidia.com/gpu": 1`, exposes WebRTC (TCP/UDP).  
  2. `monty` — loads `/checkpoints/in.mstate` (if provided), uses config YAML.  
  3. `glue` — subscribes obs from `unitree-sim`, publishes actions to sim; saves `/checkpoints/out.mstate`.  
  4. `artifact-uploader` — syncs `/artifacts` and `/checkpoints/out.mstate` to S3, then exits.
- **Volumes**
  - `emptyDir`: `/checkpoints`, `/artifacts`, `/glue`
  - **Optionally** EFS for very large assets or shared caches.
- **Networking**
  - Service (LoadBalancer) for sim’s WebRTC (or DCV). For batches/headless, you can skip.
- **TTL**
  - Use **TTL-after-finish** for automatic cleanup: `ttlSecondsAfterFinished: 600` (requires controller enabled).

---

## 6) Glue “contract” (Obs→Action)

Define schemas as JSON to lint user glue code before execution (see `k8s/configmap-glue-contract.yaml`).

**Observation (example):**
```json
{
  "time": 12.034,
  "imu": [ax, ay, az, gx, gy, gz],
  "base_vel": [vx, vy, wz],
  "base_pose": {"roll": r, "pitch": p, "yaw": y, "height": h},
  "joints": {"q": [...], "qd": [...], "tau": [...]},
  "contacts": {"feet": [true, true, false, false]},
  "nociceptor": 0.14,
  "energy_rate": 127.5
}
```

**Action (high level):**
```json
{
  "cmd_type": "base",
  "base_cmd": {"vx": 0.6, "vy": 0.0, "yaw_rate": 0.1, "body_pitch": -0.05, "gait": "trot"}
}
```

---

## 7) Frontend and Orchestrator expectations

- **Frontend** (separate repo): Next.js with pages for Run Wizard, Monaco editor for glue, WebRTC viewport, logs/metrics tabs.  
- **API** (separate): FastAPI with endpoints: `POST /runs`, `GET /runs/:id`, `WS /runs/:id/logs`.  
- **Controller**: API creates Jobs from `k8s/job-run-template.yaml`, populating env/args (images, config URIs, checkpoint paths, seeds).

---

## 8) Security & Networking

- **IRSA** for S3 access; no node-wide credentials.  
- **NetworkPolicy** to restrict Pod egress (allow S3, ECR, STUN/TURN).  
- **Private subnets** for nodes; public ALB/NLB only where required.  
- **TLS** on ALB for API; **NLB** (UDP 3478) for TURN if used.

---

## 9) Cost & Safety

- Set **requests/limits** so Cluster Autoscaler can right-size.  
- Use **Spot** GPU nodes for batch; On-Demand for interactive runs.  
- TTL for Jobs, **max runtime** via `activeDeadlineSeconds`.  
- Lifecycle policies on S3 (video-heavy runs can be expensive).

---

## 10) Operational playbooks

### Roll a new Monty image
1. Build/push to ECR (`monty:<gitsha>`).  
2. Update orchestrator to pass new tag; Jobs will pull on next run.

### GPU scheduling fails
- Check `nvidia-device-plugin` DaemonSet ready.  
- Pod events: `kubectl describe pod <name>`.  
- Node has allocatable GPU and correct AMI.

### WebRTC black screen
- Verify TURN reachable (UDP 3478) or allow TCP-only fallback.  
- Security groups open for the Service `nodePort`/LB ports.

### Artifacts missing
- Check sidecar logs for `aws s3 cp`/`sync` errors.  
- Verify IRSA policy on ServiceAccount.

---

## 11) Appendices

### A) eksctl cluster config
See `infra/eksctl-cluster.yaml`.

### B) IRSA policy (S3 access)
See `k8s/irsa-policy-s3.json` and `k8s/serviceaccount-irsa.yaml`.

### C) Job template
See `k8s/job-run-template.yaml` (placeholders: `{IMAGE_*}`, `{S3_*}`, `{DT}`, etc.).

### D) Namespaces & RBAC
See `k8s/namespace.yaml` and `k8s/rbac.yaml`.

---

**Contacts / Ownership**
- **Platform/DevOps**: EKS, IAM, observability, cost guardrails.  
- **Robotics**: Unitree/Isaac tasks, sensors, scene assets.  
- **Neuro/ML**: Monty configs, brain profiles, checkpoints.  
- **Frontend/API**: Run UX, glue linting, artifacts UI.

Good luck — and ping the platform team before opening large GPU capacity in new regions.
