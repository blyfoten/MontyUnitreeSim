
import React from 'react';

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerContent?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, icon, children, className = '', headerContent }) => {
  return (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400">{icon}</span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
        </div>
        <div>{headerContent}</div>
      </div>
      <div className="p-4 flex-grow overflow-auto">
        {children}
      </div>
    </div>
  );
};
