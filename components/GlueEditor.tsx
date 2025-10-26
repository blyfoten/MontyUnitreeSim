
import React, { useState } from 'react';
import { Card } from './Card';
import { CodeIcon } from './icons/CodeIcon';

const GLUE_CODE_TEMPLATE = `# glue/run.py
import zmq, json, time, os

# This is a mock API for the UI
class MockMonty:
    def step(self, obs, dt):
        print(f"Monty step with obs at time {obs.get('time', 0)} and dt {dt}")
    def decide(self):
        print("Monty deciding action...")
        return {
          "cmd_type": "base",
          "base_cmd": { "vx": 0.5, "vy": 0.0, "yaw_rate": 0.1, "body_pitch": 0.0, "gait": "trot" }
        }
    def save_state(self, path):
        print(f"Saving state to {path}")

# monty = load_brain(config_path="/glue/monty.yaml",
#                    checkpoint_in="/checkpoints/in.mstate")
monty = MockMonty()

# Mock ZMQ for UI
class MockSocket:
    def connect(self, addr): print(f"Connecting to {addr}")
    def bind(self, addr): print(f"Binding to {addr}")
    def setsockopt_string(self, *args): pass
    def recv(self):
        obs = { "time": time.time() % 100, "imu": [0]*6, "base_vel": [0.5,0,0], "joints": {"q": [0]*12} }
        return json.dumps(obs).encode('utf-8')
    def send_json(self, data): print(f"Publishing action: {json.dumps(data)}")

class MockContext:
    def socket(self, type): return MockSocket()

ctx = MockContext()
sub = ctx.socket(zmq.SUB)
sub.connect("tcp://unitree-sim:5555")
sub.setsockopt_string(zmq.SUBSCRIBE,"")
pub = ctx.socket(zmq.PUB)
pub.bind("tcp://*:5556")

dt = float(os.getenv("DT","0.005"))
print("Glue bridge starting...")
try:
    while True:
        obs = json.loads(sub.recv())
        monty.step(obs, dt=dt)
        action = monty.decide()
        pub.send_json(action)
        time.sleep(dt)
except KeyboardInterrupt:
    print("Simulation interrupted.")

print("Simulation finished.")
monty.save_state("/checkpoints/out.mstate")
`;

interface GlueEditorProps {
  onCodeChange?: (code: string) => void;
}

export const GlueEditor: React.FC<GlueEditorProps> = ({ onCodeChange }) => {
  const [code, setCode] = useState(GLUE_CODE_TEMPLATE);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
  };

  return (
    <Card title="Glue Code Editor" icon={<CodeIcon className="w-5 h-5" />} className="h-full">
      <div className="relative h-full">
        <textarea
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          spellCheck="false"
          className="w-full h-full bg-slate-900 text-slate-300 font-mono text-sm p-4 rounded-md resize-none border-2 border-transparent focus:border-cyan-500 focus:outline-none"
        />
      </div>
    </Card>
  );
};
