import React from 'react';

export type ActiveView = 'overview' | 'packet-lab' | 'scale-setup' | 'health-connect';

interface TopBarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onOpenInjector: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'packet-lab', label: 'Packet Lab' },
  { id: 'scale-setup', label: 'Scale Setup' },
  { id: 'health-connect', label: 'Health Connect' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  onOpenInjector,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[#1E293B] bg-[#07090E]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Single-element display wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('overview')}
          className="font-display text-lg font-semibold tracking-tight text-[#F1F5F9] transition-colors hover:text-[#22D3EE] whitespace-nowrap shrink-0 cursor-pointer"
        >
          AriaBridge Lab
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav aria-label="Primary" className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[#F1F5F9]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 -bottom-[15px] left-0 h-[2px] bg-[#06B6D4]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenInjector}
            className="rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] transition-colors hover:bg-[#22D3EE] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Inject Test Packet
          </button>
        </div>
      </div>
    </header>
  );
};
