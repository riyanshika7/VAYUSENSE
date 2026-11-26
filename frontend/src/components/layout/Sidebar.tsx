import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Home,
  BarChart3,
  Wind,
  ShieldCheck,
  X,
} from 'lucide-react';

export type NavigationTab =
  | 'overview'
  | 'household'
  | 'daily_plan'
  | 'indoor_air'
  | 'exposure_insights';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isOpen: boolean;
  onClose: () => void;
  isBackendConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isOpen,
  onClose,
  isBackendConnected,
}) => {
  const sidebarRef = React.useRef<HTMLElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const [isDesktop, setIsDesktop] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  // Match Tailwind's lg (1024px) breakpoint so closed mobile drawer semantics never hide desktop navigation
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  const isMobileHidden = !isDesktop && !isOpen;
  const isMobileOpen = !isDesktop && isOpen;

  // Exit mobile modal drawer state cleanly if viewport resizes into desktop breakpoint
  React.useEffect(() => {
    if (isDesktop && isOpen) {
      onClose();
    }
  }, [isDesktop, isOpen, onClose]);

  // Keep inert synced and ensure focus cannot remain trapped inside a closed/hidden mobile drawer
  React.useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    if (isMobileHidden) {
      if (typeof document !== 'undefined' && el.contains(document.activeElement)) {
        const trigger = document.getElementById('mobile-menu-trigger');
        if (trigger && trigger.offsetParent !== null) {
          trigger.focus();
        } else {
          document.getElementById('main-content')?.focus();
        }
      }
      (el as HTMLElement & { inert: boolean }).inert = true;
    } else {
      (el as HTMLElement & { inert: boolean }).inert = false;
    }
  }, [isMobileHidden]);

  // Close on Escape key press, auto-focus close button, trap Tab navigation when open on mobile
  React.useEffect(() => {
    if (!isMobileOpen) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.getElementById('mobile-menu-trigger')?.focus();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sidebarRef.current) {
        const focusables = sidebarRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onClose]);

  const navItems: { id: NavigationTab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutDashboard className="w-5 h-5" />,
      desc: 'Ambient AQI & Live Risk',
    },
    {
      id: 'household',
      label: 'My Household',
      icon: <Users className="w-5 h-5" />,
      desc: 'Demographics & Sensitivities',
    },
    {
      id: 'daily_plan',
      label: 'Daily Plan',
      icon: <CalendarCheck className="w-5 h-5" />,
      desc: 'Personalized Daily Routine',
    },
    {
      id: 'indoor_air',
      label: 'Indoor Air',
      icon: <Home className="w-5 h-5" />,
      desc: 'Kitchen, Ventilation & Purifier',
    },
    {
      id: 'exposure_insights',
      label: 'Exposure Insights',
      icon: <BarChart3 className="w-5 h-5" />,
      desc: 'Deterministic Scoring Audit',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => {
            if (typeof document !== 'undefined' && sidebarRef.current?.contains(document.activeElement)) {
              document.getElementById('mobile-menu-trigger')?.focus();
            }
            onClose();
          }}
        />
      )}

      {/* Sidebar Container */}
      <aside
        ref={sidebarRef}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-hidden={isMobileHidden ? 'true' : undefined}
        aria-label={isOpen ? 'Navigation Menu' : 'Sidebar Navigation'}
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:visible ${
          isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-vayu-800 text-white flex items-center justify-center shadow-sm">
              <Wind className="w-5 h-5 text-vayu-300" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                VayuSense
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-vayu-100 text-vayu-800 tracking-wider">
                  v1.0
                </span>
              </span>
              <p className="text-xs text-slate-500 font-medium">Urban Air Intelligence</p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            tabIndex={isMobileHidden ? -1 : undefined}
            onClick={() => {
              document.getElementById('mobile-menu-trigger')?.focus();
              onClose();
            }}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav aria-label="Main Navigation" className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <p className="px-3 text-[11px] font-semibold uppercase text-slate-500 tracking-wider mb-2">
            Navigation
          </p>
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                tabIndex={isMobileHidden ? -1 : undefined}
                onClick={() => {
                  onTabChange(item.id);
                  if (isMobileOpen) {
                    document.getElementById('main-content')?.focus();
                  }
                  onClose();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={isActive ? 'text-vayu-300' : 'text-slate-400'}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight truncate">{item.label}</p>
                  <p
                    className={`text-[11px] truncate leading-tight ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* System & Engine Status */}
        <div className="p-4 mx-4 mb-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-vayu-700" />
              Engine Status
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendConnected ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Provider:</span>
              <span className="font-medium text-slate-800">WAQI Real-time</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Deterministic Core:</span>
              <span className="font-medium text-emerald-700">0–100 Bounded</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Reasoning:</span>
              <span className="font-medium text-slate-800">Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Indian Urban Health Stack</span>
          <span className="font-mono">CPCB-Aware</span>
        </div>
      </aside>
    </>
  );
};
