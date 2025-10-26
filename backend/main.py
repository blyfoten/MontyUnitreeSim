import os
import json
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import boto3
from botocore.exceptions import ClientError
import yaml
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Monty Unitree Simulation Orchestrator",
    description="Backend service for managing Monty + Unitree simulations on EKS",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums
class RunStatus(str, Enum):
    PENDING = "Pending"
    RUNNING = "Running"
    COMPLETED = "Completed"
    FAILED = "Failed"
    CANCELLED = "Cancelled"

class LogLevel(str, Enum):
    INFO = "Info"
    WARN = "Warn"
    ERROR = "Error"
    DEBUG = "Debug"

# Pydantic models
class DockerImage(BaseModel):
    id: str
    repo: str
    tag: str
    type: str  # 'monty' | 'simulator'

class BrainProfile(BaseModel):
    id: str
    name: str
    config: str  # YAML content

class Artifact(BaseModel):
    id: str
    kind: str  # 'checkpoint' | 'log' | 'video' | 'metrics'
    s3_uri: str

class Run(BaseModel):
    id: str
    name: str
    status: RunStatus
    createdAt: datetime
    montyImage: DockerImage
    simulatorImage: DockerImage
    brainProfile: BrainProfile
    artifacts: List[Artifact] = []
    glueCode: Optional[str] = None
    checkpointIn: Optional[str] = None
    checkpointOut: Optional[str] = None

class LogEntry(BaseModel):
    id: int
    runId: str
    timestamp: datetime
    level: LogLevel
    message: str

class MetricPoint(BaseModel):
    time: float
    reward: float
    energy: float
    nociceptor: float

class CreateRunRequest(BaseModel):
    name: str
    montyImage: DockerImage
    simulatorImage: DockerImage
    brainProfile: BrainProfile
    glueCode: str
    checkpointIn: Optional[str] = None
    activeDeadlineSeconds: int = Field(default=3600, ge=300, le=7200)

# Global state
runs: Dict[str, Run] = {}
logs: Dict[str, List[LogEntry]] = {}
metrics: Dict[str, List[MetricPoint]] = {}
active_connections: List[WebSocket] = []
log_counter = 0

# AWS and Kubernetes clients
s3_client = boto3.client('s3')
ecr_client = boto3.client('ecr')

# Load Kubernetes config
try:
    config.load_incluster_config()  # Try in-cluster config first
except:
    config.load_kube_config()  # Fall back to local config

k8s_batch_v1 = client.BatchV1Api()
k8s_core_v1 = client.CoreV1Api()
k8s_apps_v1 = client.AppsV1Api()

# Configuration
NAMESPACE = os.getenv('K8S_NAMESPACE', 'monty-sim')
S3_CHECKPOINTS_BUCKET = os.getenv('S3_CHECKPOINTS_BUCKET', 'monty-checkpoints-dev')
S3_ARTIFACTS_BUCKET = os.getenv('S3_ARTIFACTS_BUCKET', 'sim-artifacts-dev')
ECR_REGISTRY = os.getenv('ECR_REGISTRY', '')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')

class SimulationOrchestrator:
    """Main orchestrator class for managing simulation runs"""
    
    def __init__(self):
        self.runs = runs
        self.logs = logs
        self.metrics = metrics
    
    async def create_run(self, request: CreateRunRequest) -> Run:
        """Create a new simulation run"""
        run_id = f"run-{len(self.runs) + 1}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Create run object
        run = Run(
            id=run_id,
            name=request.name,
            status=RunStatus.PENDING,
            createdAt=datetime.now(),
            montyImage=request.montyImage,
            simulatorImage=request.simulatorImage,
            brainProfile=request.brainProfile,
            glueCode=request.glueCode,
            checkpointIn=request.checkpointIn
        )
        
        self.runs[run_id] = run
        self.logs[run_id] = []
        self.metrics[run_id] = []
        
        # Upload glue code to S3
        await self._upload_glue_code(run_id, request.glueCode)
        
        # Create Kubernetes Job
        await self._create_k8s_job(run, request.activeDeadlineSeconds)
        
        # Add initial log
        await self._add_log(run_id, LogLevel.INFO, f"Run {run.name} created and queued")
        
        return run
    
    async def _upload_glue_code(self, run_id: str, glue_code: str):
        """Upload glue code to S3"""
        try:
            key = f"glue/{run_id}/run.py"
            s3_client.put_object(
                Bucket=S3_ARTIFACTS_BUCKET,
                Key=key,
                Body=glue_code.encode('utf-8'),
                ContentType='text/plain'
            )
            logger.info(f"Uploaded glue code for run {run_id}")
        except ClientError as e:
            logger.error(f"Failed to upload glue code: {e}")
            raise HTTPException(status_code=500, detail="Failed to upload glue code")
    
    async def _create_k8s_job(self, run: Run, active_deadline_seconds: int):
        """Create Kubernetes Job for the simulation run"""
        
        # Prepare job template
        job_template = self._prepare_job_template(run, active_deadline_seconds)
        
        try:
            # Create the job
            api_response = k8s_batch_v1.create_namespaced_job(
                namespace=NAMESPACE,
                body=job_template
            )
            logger.info(f"Created job for run {run.id}: {api_response.metadata.name}")
            
            # Update run status
            run.status = RunStatus.RUNNING
            await self._add_log(run.id, LogLevel.INFO, "Kubernetes job created and started")
            
        except ApiException as e:
            logger.error(f"Failed to create job: {e}")
            run.status = RunStatus.FAILED
            await self._add_log(run.id, LogLevel.ERROR, f"Failed to create Kubernetes job: {e}")
            raise HTTPException(status_code=500, detail="Failed to create simulation job")
    
    def _prepare_job_template(self, run: Run, active_deadline_seconds: int) -> Dict[str, Any]:
        """Prepare Kubernetes Job template"""
        
        # Construct image URIs
        monty_image = f"{ECR_REGISTRY}/{run.montyImage.repo}:{run.montyImage.tag}"
        sim_image = f"{ECR_REGISTRY}/{run.simulatorImage.repo}:{run.simulatorImage.tag}"
        glue_image = f"{ECR_REGISTRY}/glue-base:py310"
        
        # S3 URIs
        s3_glue_prefix = f"s3://{S3_ARTIFACTS_BUCKET}/glue/{run.id}"
        s3_artifacts_prefix = f"s3://{S3_ARTIFACTS_BUCKET}/runs/{run.id}/artifacts"
        s3_checkpoint_in = run.checkpointIn or ""
        s3_checkpoint_out = f"s3://{S3_CHECKPOINTS_BUCKET}/checkpoints/{run.id}/out.mstate"
        
        job_template = {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {
                "name": f"sim-run-{run.id}",
                "namespace": NAMESPACE,
                "labels": {
                    "app": "sim-run",
                    "run-id": run.id,
                    "user": "default",  # TODO: Get from auth
                    "profile": run.brainProfile.id
                }
            },
            "spec": {
                "ttlSecondsAfterFinished": 600,
                "activeDeadlineSeconds": active_deadline_seconds,
                "backoffLimit": 0,
                "template": {
                    "metadata": {
                        "labels": {
                            "app": "sim-run",
                            "run-id": run.id
                        }
                    },
                    "spec": {
                        "restartPolicy": "Never",
                        "serviceAccountName": "sim-runner",
                        "nodeSelector": {
                            "role": "gpu"
                        },
                        "tolerations": [
                            {
                                "key": "nvidia.com/gpu",
                                "operator": "Equal",
                                "value": "present",
                                "effect": "NoSchedule"
                            }
                        ],
                        "containers": [
                            {
                                "name": "unitree-sim",
                                "image": sim_image,
                                "imagePullPolicy": "IfNotPresent",
                                "resources": {
                                    "limits": {
                                        "nvidia.com/gpu": 1
                                    }
                                },
                                "env": [
                                    {"name": "DT", "value": "0.005"},
                                    {"name": "WEBRTC", "value": "true"}
                                ],
                                "ports": [
                                    {
                                        "name": "webrtc",
                                        "containerPort": 8554,
                                        "protocol": "TCP"
                                    }
                                ],
                                "volumeMounts": [
                                    {"name": "ckpt", "mountPath": "/checkpoints"},
                                    {"name": "artifacts", "mountPath": "/artifacts"},
                                    {"name": "glue", "mountPath": "/glue"}
                                ]
                            },
                            {
                                "name": "monty",
                                "image": monty_image,
                                "env": [
                                    {"name": "CHECKPOINT_IN", "value": s3_checkpoint_in},
                                    {"name": "CHECKPOINT_OUT", "value": "/checkpoints/out.mstate"},
                                    {"name": "MONTY_CONFIG", "value": "/glue/monty.yaml"},
                                    {"name": "DT", "value": "0.005"}
                                ],
                                "volumeMounts": [
                                    {"name": "ckpt", "mountPath": "/checkpoints"},
                                    {"name": "artifacts", "mountPath": "/artifacts"},
                                    {"name": "glue", "mountPath": "/glue"}
                                ]
                            },
                            {
                                "name": "glue",
                                "image": glue_image,
                                "command": ["python", "/glue/run.py"],
                                "env": [
                                    {"name": "DT", "value": "0.005"},
                                    {"name": "OBS_SCHEMA_PATH", "value": "/glue/observation.schema.json"},
                                    {"name": "ACT_SCHEMA_PATH", "value": "/glue/action.schema.json"}
                                ],
                                "volumeMounts": [
                                    {"name": "ckpt", "mountPath": "/checkpoints"},
                                    {"name": "artifacts", "mountPath": "/artifacts"},
                                    {"name": "glue", "mountPath": "/glue"}
                                ]
                            },
                            {
                                "name": "artifact-uploader",
                                "image": "public.ecr.aws/aws-cli/aws-cli:latest",
                                "command": [
                                    "/bin/sh",
                                    "-lc",
                                    f"""
                                    set -e
                                    echo "Uploading artifacts..."
                                    aws s3 sync /artifacts {s3_artifacts_prefix} --only-show-errors
                                    if [ -f /checkpoints/out.mstate ]; then
                                        aws s3 cp /checkpoints/out.mstate {s3_checkpoint_out} --only-show-errors
                                    fi
                                    echo "Done."
                                    """
                                ],
                                "volumeMounts": [
                                    {"name": "ckpt", "mountPath": "/checkpoints"},
                                    {"name": "artifacts", "mountPath": "/artifacts"}
                                ]
                            }
                        ],
                        "volumes": [
                            {"name": "ckpt", "emptyDir": {}},
                            {"name": "artifacts", "emptyDir": {}},
                            {"name": "glue", "emptyDir": {}}
                        ]
                    }
                }
            }
        }
        
        return job_template
    
    async def _add_log(self, run_id: str, level: LogLevel, message: str):
        """Add a log entry for a run"""
        global log_counter
        log_entry = LogEntry(
            id=log_counter,
            runId=run_id,
            timestamp=datetime.now(),
            level=level,
            message=message
        )
        
        if run_id not in self.logs:
            self.logs[run_id] = []
        
        self.logs[run_id].append(log_entry)
        log_counter += 1
        
        # Broadcast to WebSocket connections
        await self._broadcast_log(log_entry)
    
    async def _broadcast_log(self, log_entry: LogEntry):
        """Broadcast log entry to all WebSocket connections"""
        message = {
            "type": "log",
            "data": log_entry.dict()
        }
        
        for connection in active_connections:
            try:
                await connection.send_text(json.dumps(message, default=str))
            except:
                # Remove disconnected clients
                active_connections.remove(connection)

# Initialize orchestrator
orchestrator = SimulationOrchestrator()

# API Routes
@app.get("/")
async def root():
    return {"message": "Monty Unitree Simulation Orchestrator", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

@app.get("/runs", response_model=List[Run])
async def get_runs():
    """Get all simulation runs"""
    return list(runs.values())

@app.get("/runs/{run_id}", response_model=Run)
async def get_run(run_id: str):
    """Get a specific simulation run"""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return runs[run_id]

@app.post("/runs", response_model=Run)
async def create_run(request: CreateRunRequest):
    """Create a new simulation run"""
    return await orchestrator.create_run(request)

@app.get("/runs/{run_id}/logs", response_model=List[LogEntry])
async def get_run_logs(run_id: str):
    """Get logs for a specific run"""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return logs.get(run_id, [])

@app.get("/runs/{run_id}/metrics", response_model=List[MetricPoint])
async def get_run_metrics(run_id: str):
    """Get metrics for a specific run"""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return metrics.get(run_id, [])

@app.delete("/runs/{run_id}")
async def cancel_run(run_id: str):
    """Cancel a running simulation"""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    
    run = runs[run_id]
    if run.status not in [RunStatus.PENDING, RunStatus.RUNNING]:
        raise HTTPException(status_code=400, detail="Run cannot be cancelled")
    
    try:
        # Delete the Kubernetes job
        k8s_batch_v1.delete_namespaced_job(
            name=f"sim-run-{run_id}",
            namespace=NAMESPACE
        )
        
        run.status = RunStatus.CANCELLED
        await orchestrator._add_log(run_id, LogLevel.INFO, "Run cancelled by user")
        
        return {"message": "Run cancelled successfully"}
    
    except ApiException as e:
        logger.error(f"Failed to cancel job: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel run")

@app.get("/images/monty", response_model=List[DockerImage])
async def get_monty_images():
    """Get available Monty Docker images"""
    # TODO: Query ECR for available images
    return [
        {"id": "m1", "repo": "monty", "tag": "latest", "type": "monty"},
        {"id": "m2", "repo": "monty", "tag": "exp-brain-v2", "type": "monty"},
    ]

@app.get("/images/simulator", response_model=List[DockerImage])
async def get_simulator_images():
    """Get available simulator Docker images"""
    # TODO: Query ECR for available images
    return [
        {"id": "s1", "repo": "unitree-sim", "tag": "isaac-5.0", "type": "simulator"},
        {"id": "s2", "repo": "unitree-sim", "tag": "isaac-4.8-h1", "type": "simulator"},
    ]

@app.get("/brain-profiles", response_model=List[BrainProfile])
async def get_brain_profiles():
    """Get available brain profiles"""
    # TODO: Load from S3 or ConfigMap
    return [
        {"id": "bp1", "name": "Small (Fast)", "config": "size: small\nlayers: 2"},
        {"id": "bp2", "name": "Medium (Balanced)", "config": "size: medium\nlayers: 4"},
        {"id": "bp3", "name": "Large (Complex)", "config": "size: large\nlayers: 8"},
    ]

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Keep connection alive and send periodic updates
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
