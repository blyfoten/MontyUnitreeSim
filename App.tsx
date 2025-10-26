
import React, { useState } from 'react';
import { RunConfigurationPanel } from './components/RunConfigurationPanel';
import { GlueEditor } from './components/GlueEditor';
import { Viewport } from './components/Viewport';
import { MonitoringTabs, MonitorTab } from './components/MonitoringTabs';
import { LogViewer } from './components/LogViewer';
import { MetricsDashboard } from './components/MetricsDashboard';
import { RunHistory } from './components/RunHistory';
import { useSimulationData } from './hooks/useSimulationData';

function App() {
  const [activeTab, setActiveTab] = useState<MonitorTab>('logs');
  const {
    runs,
    logs,
    metrics,
    activeRunId,
    montyImages,
    simulatorImages,
    brainProfiles,
    isLaunching,
    launchRun,
    selectRun,
  } = useSimulationData();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'logs':
        return <LogViewer logs={logs} activeRunId={activeRunId} />;
      case 'metrics':
        return <MetricsDashboard metrics={metrics} activeRunId={activeRunId} />;
      case 'history':
        return <RunHistory runs={runs} activeRunId={activeRunId} onSelectRun={selectRun} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen bg-brand-dark p-4 flex flex-col lg:flex-row gap-4">
      {/* Left Panel: Configuration */}
      <div className="w-full lg:w-1/4 h-1/3 lg:h-full">
        <RunConfigurationPanel 
          montyImages={montyImages}
          simulatorImages={simulatorImages}
          brainProfiles={brainProfiles}
          onLaunch={launchRun}
          isLaunching={isLaunching}
        />
      </div>

      {/* Center Panel: Viewport and Editor */}
      <div className="w-full lg:w-1/2 h-2/3 lg:h-full flex flex-col gap-4">
        <div className="h-1/2">
          <Viewport />
        </div>
        <div className="h-1/2">
          <GlueEditor />
        </div>
      </div>

      {/* Right Panel: Monitoring */}
      <div className="w-full lg:w-1/4 h-2/3 lg:h-full flex flex-col bg-slate-800/50 border border-slate-700 rounded-lg">
        <MonitoringTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-grow overflow-hidden">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}

export default App;
