import React, { ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs sm:hidden">
      {/* Clique fora para fechar */}
      <div className="flex-1" onClick={onClose} />

      {/* Caixa do Drawer */}
      <div className="w-full max-h-[85vh] rounded-t-3xl bg-slate-900 border-t border-slate-800 p-5 shadow-2xl flex flex-col overflow-hidden pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300">
        {/* Handle de arrastamento táctil */}
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-3 shrink-0" />

        {/* Título e Fechar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <h3 className="text-base font-semibold text-slate-100">{title || 'Detalhes'}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="overflow-y-auto mt-3 flex-1 pr-1">
          {children}
        </div>
      </div>
    </div>
  );
};
