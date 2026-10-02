import * as React from 'react';

export interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Tactical System Error]:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.hash = '#driver-home';
      window.location.reload();
    }
  };

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0d14] text-slate-200 flex flex-col items-center justify-center p-6 select-none">
          <div className="w-full max-w-md bg-[#121824] border border-amber-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500 animate-pulse" />
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                  TELEMETRY WARNING
                </span>
                <h2 className="text-lg font-bold text-white font-display">
                  System Re-sync Required
                </h2>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              The tactical operations interface encountered a transient rendering exception. Offline mission caches and telemetry logs remain preserved in local secure storage.
            </p>

            {this.state.error && (
              <div className="mb-5 p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px] text-slate-400 overflow-x-auto max-h-24">
                {this.state.error.message || 'Unknown runtime exception'}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 rounded-xl tactile-btn-primary font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>RE-INITIALIZE AVIONICS</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
