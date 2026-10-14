import React from 'react';
import { Map, ShieldAlert, Navigation, Train } from 'lucide-react';

export type TabType = 'map' | 'alerts' | 'planner' | 'metro';

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  alertsCount?: number;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  alertsCount = 0,
}) => {
  interface TabItem {
    id: TabType;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }

  const tabs: TabItem[] = [
    { id: 'map', label: 'Mapa Ao Vivo', icon: Map },
    { id: 'alerts', label: 'Alertas & Greves', icon: ShieldAlert, badge: alertsCount },
    { id: 'planner', label: 'Planeador', icon: Navigation },
    { id: 'metro', label: 'Metro & Cais', icon: Train },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="grid grid-cols-4 items-center h-16 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as TabType)}
              className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center transition-all relative ${
                isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className={`text-[10px] font-medium tracking-tight mt-1 ${isActive ? 'font-semibold text-blue-400' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
