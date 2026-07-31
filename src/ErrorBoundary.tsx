import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error at React boundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReset = () => {
    try {
      window.localStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070d19] text-slate-100 flex items-center justify-center p-6 font-mono text-xs">
          <div className="bg-[#0b1426] border-2 border-rose-500/50 rounded-2xl p-8 max-w-4xl w-full shadow-2xl space-y-6 relative overflow-hidden">
            {/* Ambient Red glow */}
            <div className="absolute -top-12 -left-12 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-start gap-4 border-b border-rose-500/20 pb-4">
              <div className="bg-rose-500/10 p-3 rounded-full border border-rose-500/30 text-rose-400 text-2xl">
                ⚠️
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold uppercase tracking-wider text-rose-400">
                  FALLO CRÍTICO EN LA APLICACIÓN (React Crash)
                </h2>
                <p className="text-[10px] text-slate-400">
                  Se ha interceptado una excepción inesperada durante la renderización o inicialización.
                </p>
              </div>
            </div>

            <div className="bg-[#040811] rounded-xl border border-rose-500/10 p-4 space-y-2">
              <div className="font-bold text-rose-400 text-xs">
                {this.state.error?.name || 'Error'}: {this.state.error?.message}
              </div>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap overflow-auto max-h-[250px] font-mono leading-relaxed bg-[#02050b] p-3 rounded border border-slate-900">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="bg-[#0b1426] border border-sky-950 p-4 rounded-xl text-slate-350 leading-relaxed text-[11px] space-y-2">
              <div className="font-bold text-sky-400 uppercase tracking-wider text-xs">🔍 Posibles Causas y Soluciones:</div>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <b className="text-white">Bloqueo de Seguridad (Sandboxing)</b>: Si estás visualizando la app en un iframe incrustado (editor o previsualización), tu navegador puede bloquear el acceso a <code className="text-orange-400 bg-slate-950 px-1 py-0.5 rounded">localStorage</code> o cookies.
                </li>
                <li>
                  <b className="text-white">Acción Recomendada</b>: Haz clic en el botón de la esquina superior derecha del iframe para <b className="text-cyan-400">abrir la aplicación en una pestaña nueva</b> de tu navegador. Esto restaura todos los permisos de almacenamiento y cookies.
                </li>
                <li>
                  <b className="text-white">Limpieza</b>: Si el error persiste debido a datos locales obsoletos, haz clic abajo para intentar limpiar y reiniciar.
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-white font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                🔄 Recargar Página
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                🗑️ Limpiar Memoria Local y Reiniciar
              </button>
            </div>
            
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
