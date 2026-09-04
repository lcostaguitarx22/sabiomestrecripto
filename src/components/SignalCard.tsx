'use client';

import { motion } from 'framer-motion';
import { BrainCircuit, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AiAnalysisResult {
  sentimentScore: number;
  prediction: string;
  reasoning: string;
}

export interface SignalData {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  price: number;
  message: string;
  timestamp: string;
  aiAnalysis: AiAnalysisResult | null;
}

interface SignalCardProps {
  signal: SignalData;
}

export function SignalCard({ signal }: SignalCardProps) {
  const isBuy = signal.action === 'BUY';
  const ActionIcon = isBuy ? TrendingUp : TrendingDown;
  
  const sentimentColor = signal.aiAnalysis
    ? signal.aiAnalysis.sentimentScore > 60
      ? 'text-emerald-400'
      : signal.aiAnalysis.sentimentScore < 40
      ? 'text-rose-400'
      : 'text-yellow-400'
    : 'text-slate-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all shadow-lg"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={clsx(
            "p-3 rounded-lg",
            isBuy ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
          )}>
            <ActionIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">{signal.symbol}</h3>
            <div className="flex items-center gap-1 text-sm text-slate-400 mt-1">
              <Clock className="w-3 h-3" />
              <span>
                {formatDistanceToNow(new Date(signal.timestamp), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400 uppercase font-semibold tracking-wider">Ação</p>
          <p className={clsx(
            "text-lg font-black",
            isBuy ? "text-emerald-400" : "text-rose-400"
          )}>{signal.action}</p>
        </div>
      </div>

      <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg mb-4 border border-slate-800">
        <span className="text-slate-400 text-sm">Preço no Alerta</span>
        <span className="font-mono font-medium">${signal.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
      </div>

      {signal.aiAnalysis && (
        <div className="border-t border-slate-800 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-slate-200">Análise da IA</h4>
            <span className={clsx("ml-auto text-xs font-bold px-2 py-1 rounded-full bg-slate-950 border border-slate-800", sentimentColor)}>
              Score: {signal.aiAnalysis.sentimentScore}/100
            </span>
          </div>
          <p className="text-sm text-slate-300 italic mb-2">"{signal.aiAnalysis.prediction}"</p>
          <p className="text-xs text-slate-500">{signal.aiAnalysis.reasoning}</p>
        </div>
      )}
    </motion.div>
  );
}
