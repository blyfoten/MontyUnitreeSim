# Running Monty + Unitree Simulations Locally

The EKS deployment exists purely for orchestration — nothing in the actual run
(sim + monty + glue) requires AWS. This guide covers running the same stack on a
single machine, and how to build a "virtual robot + TBP" project setup on top of
it.

## 1. What the hardware actually needs

**Monty (the TBP brain) is CPU-only.** The Thousand Brains reference
implementation deliberately avoids deep learning; the official
[tbp.monty](https://github.com/thousandbrainsproject/tbp.monty) experiments run
on an ordinary laptop. Brain profiles in `monty-unitree-eks-handoff/brain-profiles/`
scale column counts, not GPU demand.

The GPU requirement comes entirely from the **simulator choice**:

| Simulator | Hardware needed | Fidelity | Fit |
|---|---|---|---|
| **MuJoCo** + [unitree_mujoco](https://github.com/unitreerobotics/unitree_mujoco) or [mujoco_menagerie](https://github.com/google-deepmind/mujoco_menagerie) (Go2/A1/G1/H1 models) | Any modern laptop, no GPU required | Excellent physics, simple rendering | **Recommended.** Everything in the glue contract (IMU, base velocity/pose, joints, contacts) is directly available |
| **Isaac Sim / Isaac Lab** | NVIDIA **RTX** GPU (RTX 3070+ / 8 GB VRAM min, 32 GB RAM recommended), Linux or Windows | Photorealistic rendering, RTX sensors | Free for individual use. Needed only if you want camera realism or existing Isaac Lab locomotion policies |
| **Genesis / PyBullet** | Any machine | Varies | Lighter-weight alternatives worth a look |

The glue contract (`k8s/configmap-glue-contract.yaml`) commands high-level base
velocities (`vx, vy, yaw_rate, gait`), so the sim side needs a locomotion
controller underneath. Options: Unitree's sample controllers in
`unitree_mujoco`, or a pre-trained RL policy (legged_gym / walk-these-ways
style) exported to ONNX — those run fine on CPU at control-loop rates.

## 2. Local compose run

`docker-compose.local.yml` in the repo root mirrors
`monty-unitree-eks-handoff/k8s/job-run-template.yaml`:

- the same three containers (`unitree-sim`, `monty`, `glue`),
- shared `/checkpoints`, `/artifacts`, `/glue` mounts, backed by
  `./local/{checkpoints,artifacts,glue}` on your disk,
- **no artifact-uploader sidecar** — artifacts are already on your disk,
- GPU passthrough only on the sim container (delete that block for MuJoCo-CPU).

```bash
cp local/.env.example local/.env      # set image names/tags
# put your glue code + monty.yaml in ./local/glue/
docker compose -f docker-compose.local.yml --env-file local/.env up
# results appear in ./local/artifacts and ./local/checkpoints
```

Notes:

- The `monty`, `unitree-sim` and `glue-base` images are **not built from this
  repo** — the EKS setup pulled them from ECR. If you still have them in ECR,
  `docker pull` them once before tearing ECR down, or rebuild them locally.
- GPU passthrough needs the
  [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
  (Linux) or Docker Desktop with WSL2 GPU support (Windows).
- On Windows, running the sim natively and only monty+glue in containers is
  also fine — they talk over ZeroMQ/gRPC sockets either way.

The frontend/backend pair still works locally for the editor UI
(`dev-backend.bat` / `dev-frontend.bat`), but for local runs you can bypass the
orchestrator entirely — compose *is* the orchestrator.

## 3. A "virtual robot + TBP" project setup

If the goal is to reproduce a physical-robot TBP project (à la the final-year
project discussed on the TBP forum) entirely in simulation, the shape is:

```
┌─────────────┐   observations    ┌──────┐   Monty obs      ┌───────┐
│  Simulator   │ ────────────────► │ glue │ ───────────────► │ Monty │
│ (MuJoCo /    │                   │      │                  │ (TBP) │
│  Isaac)      │ ◄──────────────── │      │ ◄─────────────── │       │
└─────────────┘   motor commands   └──────┘   actions        └───────┘
```

which is exactly this repo's glue contract — the work is in what the glue
translates:

1. **Sensor side.** Monty's learning modules want *pose-tagged* sensory
   patches — e.g. small depth/RGB camera patches plus the sensor's location and
   orientation, and proprioception. In sim, mount a virtual camera on the robot
   (head or gripper), extract patches + the camera pose from the sim state, and
   emit them as Monty `SensorModule` observations. This is dramatically easier
   in sim than on the real robot (perfect ground-truth poses for debugging).
2. **Motor side.** Map Monty's actions to the contract's `base_cmd`/`ee`
   commands; the sim's locomotion controller handles the legs.
3. **Experiments.** Start with Monty's canonical task — recognize/learn objects
   by moving a sensor over them — but with the robot's camera as the sensor:
   e.g. a Go2 walking around YCB objects on the floor of a MuJoCo scene.
   That is a faithful "virtual version" of a physical TBP robot project, runs
   on a laptop, and every artifact/checkpoint mechanism in this repo still
   applies.

Useful upstream resources: [tbp.monty docs](https://thousandbrains.org/) and
tutorials (Habitat-based, laptop-friendly), `mujoco_menagerie` for robot
models, and the YCB object set Monty's tutorials already use.

## 4. When you outgrow the laptop

Batch sweeps (many seeds × brain profiles) parallelize per-run, so the cheap
path is N independent compose runs on rented GPUs/CPUs (spot EC2, vast.ai,
RunPod) rather than a resident cluster — see `docs/COST_ANALYSIS.md` options
B–D.
