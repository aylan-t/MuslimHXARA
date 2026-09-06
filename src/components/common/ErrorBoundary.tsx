import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { resetStoredConfig } from '../../services/storageService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in QCar export:', error, errorInfo);
  }

  private handleReset = () => {
    resetStoredConfig();
    try {
      localStorage.clear();
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-200 p-6 space-y-4 text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Une interruption est survenue
              </h2>
              <p className="text-xs text-slate-600 mt-2">
                Les données en cache de votre navigateur ont été automatiquement isolées pour rétablir le fonctionnement.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left text-[11px] text-slate-500 font-mono overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-bold shadow-md cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Réinitialiser et recharger l'application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

