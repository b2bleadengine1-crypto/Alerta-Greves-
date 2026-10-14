import React, { useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Se já estiver em modo standalone / PWA instalada, não mostrar botão
  if (isInstalled) {
    return null;
  }

  // Fluxo Chromium / Android / Desktop (beforeinstallprompt nativo)
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all whitespace-nowrap"
      >
        <Download className="w-4 h-4" />
        <span>Instalar App PWA</span>
      </button>
    );
  }

  // Fluxo iOS Safari (WebKit não suporta beforeinstallprompt; orienta para 'Adicionar ao Ecrã Principal')
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 border border-slate-700 px-3 py-2 text-xs font-medium shadow-sm transition-all whitespace-nowrap"
        >
          <Share2 className="w-3.5 h-3.5 text-blue-400" />
          <span>Instalar no iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-semibold">Instalar na Tela Inicial (iOS)</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs">1</span>
                  <p>Toca no botão de <strong>Partilha</strong> (ícone do quadrado com seta para cima) na barra do Safari.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs">2</span>
                  <p>Desliza para baixo e seleciona <strong>Ecrã Principal / Add to Home Screen</strong>.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs">3</span>
                  <p>Confirma tocando em <strong>Adicionar</strong> no canto superior direito.</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20"
              >
                Compreendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
