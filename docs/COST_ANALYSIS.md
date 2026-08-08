# AWS Cost Analysis & Cheaper Alternatives

This document explains where the money goes in the current EKS deployment, what to
tear down, and which cheaper setups make sense for a one-person / research project.

> Prices below are approximate on-demand rates for `eu-north-1` (the region in
> `infra/eksctl-cluster.yaml`) as of mid-2026. Check the AWS pricing pages or your
> Cost Explorer for exact numbers — the *proportions* are what matter.

## 1. Where the money goes

The painful part of this architecture is that most of the cost is **fixed** — it
accrues 24/7 even when no simulation is running.

| Component | Source | Approx. cost | Notes |
|---|---|---|---|
| EKS control plane | CDK / eksctl cluster | ~$73/mo | $0.10/hr, always on, per cluster |
| NAT gateways | CDK: `natGateways: 2`; eksctl: `HighlyAvailable` (one per AZ, up to 3) | ~$66–100/mo + data | $0.045/hr each **plus $0.045/GB processed** |
| CPU node group | eksctl: 2 × `c6i.large` desired (CDK: min 1) | ~$60–125/mo | Always on so the orchestrator has somewhere to run |
| GPU node group | `g5.2xlarge` on demand | ~$1.2–1.5/hr (~$900–1,100/mo if left up) | Scales to 0, **but only if nothing pins it** — a lingering WebRTC service/pod keeps the node alive |
| Load balancers | ALB (API) + NLB (WebRTC/TURN) | ~$18–25/mo each + LCU | Created by the LB controller from Service/Ingress objects |
| Control-plane logs | CDK enables **all five** log types incl. `AUDIT` | $0.50+/GB ingested | Audit logging is chatty; easily tens of $/mo on an active cluster |
| ECR storage | 10 retained tags per repo | $0.10/GB-mo | Isaac-based sim images are 15–20 GB each — 10 tags of `unitree-sim` can be ~$15–20/mo alone |
| Image pulls through NAT | No VPC endpoints in the stack | ~$0.045/GB | Every fresh GPU node pulls the ~20 GB sim image **through the NAT gateway** (~$1/pull, plus slow cold starts) |
| S3 + CloudWatch metrics | buckets, dashboards | usually small | Lifecycle rules already in place |

**Baseline while completely idle: roughly $250–350/month** before a single GPU
hour is consumed. Forgetting one `g5.2xlarge` running adds ~$35/day.

### Likely bill-shock culprits, in order

1. **GPU node not scaling down** — the autoscaler only drains a node when it's
   empty. The WebRTC `Service`/viewport or a stuck Job keeps it up indefinitely.
2. **The fixed EKS tax** — control plane + NAT + always-on CPU nodes + LBs.
3. **NAT data processing** — big image pulls and S3 artifact traffic through NAT.
4. **Control-plane audit logs** into CloudWatch.

## 2. Immediate actions (keep AWS, stop the bleeding)

If you want to keep the cluster around short-term:

- `eksctl scale nodegroup --name gpu-ng -N 0` and verify with `kubectl get nodes`.
- Scale `cpu-ng` to 1 node (or 0 if you don't need the orchestrator up).
- Delete Ingress/Service objects of type `LoadBalancer` you're not using — each
  one is a billed ALB/NLB.
- Disable control-plane logging or keep only `api`:
  `aws eks update-cluster-config --logging '{"clusterLogging":[{"types":["api","audit","authenticator","controllerManager","scheduler"],"enabled":false}]}'`
- Drop to **one** NAT gateway (CDK `natGateways: 1`), or move nodes to public
  subnets for a hobby setup (SG-restricted) and skip NAT entirely.
- Add **VPC gateway endpoint for S3** (free) and interface endpoints for ECR if
  you keep pulling large images.
- Tighten ECR lifecycle to 2–3 tags for the 15–20 GB sim images.
- Set an **AWS Budget** with an alert (e.g. $50/mo) — two minutes of setup,
  saves the next surprise.

### Full teardown

If you're moving local (recommended below): `cdk destroy` (or
`eksctl delete cluster -f infra/eksctl-cluster.yaml`), then manually verify the
things CloudFormation tends to leave behind: **ALBs/NLBs created by the LB
controller, EBS volumes, ECR images, S3 buckets, CloudWatch log groups, elastic
IPs of NAT gateways**. `scripts/cleanup.ps1` covers part of this. Check Cost
Explorer a few days later to confirm everything hit zero.

## 3. Cheaper architectures

### Option A — Fully local (recommended starting point)

Monty itself is **CPU-based by design** (no deep learning, follows the TBP
reference implementation) and runs fine on a laptop. Only the simulator side may
need a GPU, and only if you insist on Isaac Sim. See `docs/LOCAL_SETUP.md` and
`docker-compose.local.yml` — the same three-container run (sim + monty + glue)
works on one machine, with artifacts written to a local folder instead of S3.

Cost: **$0/mo** (electricity aside).

### Option B — Single EC2 GPU instance, on demand (no EKS)

Everything the k8s Job does fits in `docker compose` on one box:

- `g5.xlarge` (~$1.0–1.2/hr) or `g4dn.xlarge` (~$0.5–0.6/hr, T4 — enough for
  headless Isaac at modest fidelity). **Spot** cuts either by ~60–70%.
- Public subnet + security group locked to your IP (or Tailscale) — **no NAT, no
  ALB, no control plane**.
- Start it when you run experiments, stop it after. An
  `aws ec2 stop-instances` alias, an idle-shutdown cron on the box, or an EC2
  Instance Scheduler covers "I forgot to turn it off".

Cost: **purely hours used** — e.g. 20 hrs/mo of spot g5.xlarge ≈ **$8–10/mo**,
versus $250+ fixed for the EKS version.

### Option C — GPU rental marketplaces

For batch experiments, vast.ai / RunPod / Lambda rent RTX 3090/4090-class GPUs
at ~$0.20–0.50/hr — often cheaper and *better suited to Isaac Sim* (which wants
RTX cores) than AWS's A10G/T4 instances. Docker-based, so the same compose file
applies. Trade-off: less durable storage, more manual workflow.

### Option D — Keep Kubernetes semantics without EKS

If you value the Job-per-run model, run **k3s** (or k3d/kind) on a single EC2
GPU box or your own machine. The orchestrator backend (`backend/main.py`) uses
the standard Kubernetes client and `kubectl` config fallback, so it works
against any cluster — the job template needs only its ECR image URIs and the S3
artifact sidecar swapped for local paths.

## 4. Suggested path

1. Tear down the EKS stack (Section 2) and set a budget alert.
2. Develop locally against MuJoCo or Habitat (free, fast iteration) —
   see `docs/LOCAL_SETUP.md`.
3. When you genuinely need Isaac-fidelity or big batch sweeps, burst to a spot
   GPU instance (Option B) or a rental GPU (Option C) using the same compose
   file.
