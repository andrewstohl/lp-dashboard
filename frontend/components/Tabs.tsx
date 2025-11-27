"use client";

import { type ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="border-b border-[#21262D]">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-[#E6EDF3]"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 text-xs rounded-full ${
                    isActive
                      ? "bg-[#58A6FF] text-[#0D1117]"
                      : "bg-[#21262D] text-[#8B949E]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {/* Active indicator */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#58A6FF]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
