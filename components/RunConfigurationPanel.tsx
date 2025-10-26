
import React, { useState } from 'react';
import { Card } from './Card';
import { PlayIcon } from './icons/PlayIcon';
import { DockerImage, BrainProfile } from '../types';

interface RunConfigurationPanelProps {
  montyImages: DockerImage[];
  simulatorImages: DockerImage[];
  brainProfiles: BrainProfile[];
  onLaunch: (config: {
    montyImage: DockerImage;
    simulatorImage: DockerImage;
    brainProfile: BrainProfile;
    glueCode: string;
    checkpointIn?: string;
  }) => void;
  isLaunching: boolean;
}

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-4">
    <label className="block text-slate-400 text-sm font-bold mb-2">{label}</label>
    {children}
  </div>
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${props.className}`}>
    {props.children}
  </select>
);

export const RunConfigurationPanel: React.FC<RunConfigurationPanelProps> = ({
  montyImages,
  simulatorImages,
  brainProfiles,
  onLaunch,
  isLaunching
}) => {
  const [brainState, setBrainState] = useState<'fresh' | 'checkpoint'>('fresh');
  const [selectedMontyImage, setSelectedMontyImage] = useState<DockerImage>(montyImages[0]);
  const [selectedSimulatorImage, setSelectedSimulatorImage] = useState<DockerImage>(simulatorImages[0]);
  const [selectedBrainProfile, setSelectedBrainProfile] = useState<BrainProfile>(brainProfiles[0]);

  return (
    <Card title="Run Configuration" icon={<PlayIcon className="w-5 h-5" />} className="h-full">
      <div className="flex flex-col h-full">
        <div className="flex-grow">
          <FormRow label="Monty Image">
            <Select value={selectedMontyImage.id} onChange={(e) => {
              const img = montyImages.find(i => i.id === e.target.value);
              if (img) setSelectedMontyImage(img);
            }}>
              {montyImages.map(img => <option key={img.id} value={img.id}>{`${img.repo}:${img.tag}`}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Simulator Image">
            <Select value={selectedSimulatorImage.id} onChange={(e) => {
              const img = simulatorImages.find(i => i.id === e.target.value);
              if (img) setSelectedSimulatorImage(img);
            }}>
              {simulatorImages.map(img => <option key={img.id} value={img.id}>{`${img.repo}:${img.tag}`}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Brain Profile">
            <Select value={selectedBrainProfile.id} onChange={(e) => {
              const profile = brainProfiles.find(p => p.id === e.target.value);
              if (profile) setSelectedBrainProfile(profile);
            }}>
              {brainProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Brain State">
            <div className="flex items-center space-x-4">
              <label className="flex items-center cursor-pointer">
                <input type="radio" name="brainState" value="fresh" checked={brainState === 'fresh'} onChange={() => setBrainState('fresh')} className="form-radio h-4 w-4 text-cyan-600 bg-slate-700 border-slate-600 focus:ring-cyan-500" />
                <span className="ml-2 text-slate-300">Fresh</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input type="radio" name="brainState" value="checkpoint" checked={brainState === 'checkpoint'} onChange={() => setBrainState('checkpoint')} className="form-radio h-4 w-4 text-cyan-600 bg-slate-700 border-slate-600 focus:ring-cyan-500" />
                <span className="ml-2 text-slate-300">Load Checkpoint</span>
              </label>
            </div>
            {brainState === 'checkpoint' && (
              <div className="mt-2">
                <Select disabled>
                  <option>s3://monty-checkpoints/chkp_20240520.mstate</option>
                </Select>
              </div>
            )}
          </FormRow>
        </div>
        <button
          onClick={() => onLaunch({
            montyImage: selectedMontyImage,
            simulatorImage: selectedSimulatorImage,
            brainProfile: selectedBrainProfile,
            glueCode: '', // This will be passed from the GlueEditor
            checkpointIn: brainState === 'checkpoint' ? 's3://monty-checkpoints/chkp_20240520.mstate' : undefined,
          })}
          disabled={isLaunching}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md flex items-center justify-center transition-all duration-200"
        >
          <PlayIcon className="w-5 h-5 mr-2" />
          {isLaunching ? 'Launching...' : 'Launch Run'}
        </button>
      </div>
    </Card>
  );
};
