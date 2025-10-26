
import React from 'react';
import { LogIcon } from './icons/LogIcon';
import { ChartIcon } from './icons/ChartIcon';
import { DownloadIcon } from './icons/DownloadIcon';

export type MonitorTab = 'logs' | 'metrics' | 'history';

interface MonitoringTabsProps {
  activeTab: MonitorTab;
  setActiveTab: (tab: MonitorTab) => void;
}

const TabButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200 border-b-2 ${
      isActive
        ? 'border-cyan-400 text-cyan-400 bg-slate-800'
        : 'border-transparent text-slate-400 hover:bg-slate-700/50'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export const MonitoringTabs: React.FC<MonitoringTabsProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="flex bg-slate-900/50 border-b border-slate-700">
      <TabButton
        label="Logs"
        icon={<LogIcon className="w-5 h-5" />}
        isActive={activeTab === 'logs'}
        onClick={() => setActiveTab('logs')}
      />
      <TabButton
        label="Metrics"
        icon={<ChartIcon className="w-5 h-5" />}
        isActive={activeTab === 'metrics'}
        onClick={() => setActiveTab('metrics')}
      />
      <TabButton
        label="Run History"
        icon={<DownloadIcon className="w-5 h-5" />}
        isActive={activeTab === 'history'}
        onClick={() => setActiveTab('history')}
      />
    </div>
  );
};
