import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  Share2,
  ExternalLink,
  ShieldAlert,
  Send,
  Search,
} from 'lucide-react';
import { OPERATORS_META } from '../data/amlTransportData';
import { AlertSeverity, OperatorId, TransitAlert } from '../types/transit';

interface AlertsMonitorProps {
  alerts: TransitAlert[];
  isLoading?: boolean;
}

export const AlertsMonitor: React.FC<AlertsMonitorProps> = ({ alerts, isLoading }) => {
  const [selectedOperator, setSelectedOperator] = useState<OperatorId | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverity | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyStrikes, setOnlyStrikes] = useState(false);

  const filteredAlerts = alerts.filter((alert) => {
    if (selectedOperator !== 'all' && alert.operator !== selectedOperator) return false;
    if (selectedSeverity !== 'all' && alert.severity !== selectedSeverity) return false;
    if (onlyStrikes && !alert.isStrike) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = alert.title.toLowerCase().includes(q);
      const matchDesc = alert.description.toLowerCase().includes(q);
      const matchOp = alert.operatorName.toLowerCase().includes(q);
      const matchLines = alert.affectedLines.some((l) => l.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchOp && !matchLines) return false;
    }
    return true;
  });

  const generateWhatsAppShareUrl = (alert: TransitAlert) => {
    const text = encodeURIComponent(
      `🚨 *ALERTA DE TRANSPORTE - AML*\n\n` +
      `🏢 *${alert.operatorName}*\n` +
      `⚠️ *${alert.title}*\n\n` +
      `📅 *Data:* ${alert.startDate}${alert.endDate ? ` até ${alert.endDate}` : ''}\n` +
      (alert.minimumServices ? `⚖️ *Serviços Mínimos:* ${alert.minimumServices}\n\n` : '') +
      `📝 ${alert.description}\n\n` +
      `📲 Acompanha ao vivo na PWA GrevesPT & Transportes AML`
    );
    return `https://wa.me/?text=${text}`;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Ações Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <span>Monitor de Alertas & Greves da AML</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Agregação oficial de greves, serviços mínimos do CES, supressões e desvios de circulação.
          </p>
        </div>

        {/* Botão de Destaque Telegram */}
        <a
          href="https://t.me/alertagreves_pt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all self-start sm:self-auto"
        >
          <Send className="w-4 h-4" />
          <span>Canal Telegram (@alertagreves_pt)</span>
        </a>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por linha (ex: 3710, Linha Azul, Sintra, Elétrico 15E)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Filtros em Abas Segmentadas */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => { setSelectedOperator('all'); setOnlyStrikes(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedOperator === 'all' && !onlyStrikes
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Todos os Alertas ({alerts.length})
          </button>

          <button
            onClick={() => setOnlyStrikes(!onlyStrikes)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              onlyStrikes
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🔥 Apenas Greves
          </button>

          {Object.entries(OPERATORS_META).map(([key, op]) => (
            <button
              key={key}
              onClick={() => setSelectedOperator(key as OperatorId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedOperator === key
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {op.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Alertas */}
      {isLoading ? (
        <div className="p-8 text-center text-slate-400">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-2" />
          <p className="text-sm">A carregar alertas e avisos oficiais em tempo real...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/50 border border-slate-800">
          <p className="text-sm font-medium text-slate-300">Nenhum alerta ou perturbação encontrado com os filtros selecionados.</p>
          <p className="text-xs text-slate-500 mt-1">A rede opera dentro da normalidade para os critérios especificados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAlerts.map((alert) => {
            const isCritical = alert.severity === 'critical';
            const isWarning = alert.severity === 'warning';

            return (
              <div
                key={alert.id}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Cabeçalho do Cartão: Metadados Limpos sem Pills Excessivos */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{alert.operatorName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{alert.verifiedAt}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isCritical ? (
                        <span className="flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> Alta Gravidade
                        </span>
                      ) : isWarning ? (
                        <span className="flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5" /> Atenção
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-sky-400 font-medium text-[11px]">
                          <Info className="w-3.5 h-3.5" /> Informativo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Título Principal */}
                  <h3 className="text-base font-semibold text-slate-100 leading-snug">
                    {alert.title}
                  </h3>

                  {/* Descrição */}
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {alert.description}
                  </p>

                  {/* Bloco de Serviços Mínimos (se for Greve) */}
                  {alert.minimumServices && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                      <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Serviços Mínimos Decretados (CES):</span>
                      </div>
                      <p className="text-slate-300 leading-normal">{alert.minimumServices}</p>
                    </div>
                  )}

                  {/* Linhas Afetadas */}
                  {alert.affectedLines.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-medium text-slate-300">Linhas:</span>
                      <span>{alert.affectedLines.join(' · ')}</span>
                    </div>
                  )}
                </div>

                {/* Rodapé com Botões de Ação Úteis (WhatsApp + Fonte Oficial) */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Início: {alert.startDate}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {alert.sourceUrl && (
                      <a
                        href={alert.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Fonte</span>
                      </a>
                    )}

                    <a
                      href={generateWhatsAppShareUrl(alert)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium shadow-sm transition-all"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
