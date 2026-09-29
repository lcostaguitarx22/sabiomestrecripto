"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Activity, TrendingUp, TrendingDown, Clock, Brain, Loader2, Play, Trash2 } from "lucide-react";
import clsx from "clsx";
import TradingViewWidget from "@/components/TradingViewWidget";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [signals, setSignals] = useState<any[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);

  // Dynamic Coins
  const [availableCoins, setAvailableCoins] = useState<any[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(true);

  // Controls
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15m");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "signals"), orderBy("createdAt", "desc"), limit(10));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedSignals: any[] = [];
      querySnapshot.forEach((doc) => {
        fetchedSignals.push({ id: doc.id, ...doc.data() });
      });
      setSignals(fetchedSignals);
      setLoadingSignals(false);
    });

    // Fetch Dynamic Coins
    const fetchCoins = async () => {
      try {
        const res = await fetch("/api/top-coins");
        const json = await res.json();
        if (json.success && json.data) {
          setAvailableCoins(json.data);
          // Auto select first coin if none selected
          setSymbol(json.data[0].symbol);
        }
      } catch (err) {
        console.error("Erro ao carregar moedas:", err);
      } finally {
        setLoadingCoins(false);
      }
    };
    fetchCoins();

    return () => unsubscribe();
  }, []);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Erro ao analisar: " + data.error);
      }
    } catch (err) {
      alert("Falha na conexão com o servidor.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este sinal?")) {
      try {
        await deleteDoc(doc(db, "signals", id));
      } catch (err) {
        alert("Erro ao excluir sinal.");
      }
    }
  }; const groupedSignals = useMemo(() => {
    const groups: { symbol: string; signals: any[] }[] = [];
    const symbolMap = new Map<string, number>();

    signals.forEach((signal) => {
      if (!symbolMap.has(signal.symbol)) {
        symbolMap.set(signal.symbol, groups.length);
        groups.push({ symbol: signal.symbol, signals: [] });
      }
      const index = symbolMap.get(signal.symbol)!;
      groups[index].signals.push(signal);
    });

    return groups;
  }, [signals]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 md:p-8">
      <div className="w-full mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="w-8 h-8 text-indigo-500" />
              MeuSabioMestreCripto
              <span className="text-sm font-normal bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">Autônomo v2</span>
            </h1>
            <p className="text-neutral-400 mt-2">Robô Quantitativo de Análise Gráfica com IA</p>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" /> Painel de Controle (Scanner)
          </h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Moeda (Par)</label>
              <div className="relative">
                <input
                  type="text"
                  list="coins-list"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  disabled={loadingCoins}
                  placeholder={loadingCoins ? "Carregando..." : "Busque um par (ex: NEARUSDT)"}
                  className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                />
                <datalist id="coins-list">
                  {availableCoins.map((coin) => (
                    <option key={coin.id} value={coin.symbol}>
                      {coin.name}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">Tempo Gráfico</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-2 w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="15m">15 Minutos</option>
                <option value="1h">1 Hora</option>
                <option value="4h">4 Horas</option>
                <option value="1d">1 Dia</option>
              </select>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={clsx(
                "flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all",
                isAnalyzing
                  ? "bg-indigo-600/50 cursor-not-allowed text-indigo-200"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/20"
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Analisando Gráfico...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> Analisar Agora
                </>
              )}
            </button>

            {/* Shortcuts */}
            <div className="flex flex-wrap gap-2 items-center lg:ml-auto mt-4 lg:mt-0 pb-1">
              <span className="text-sm text-neutral-500 mr-1 hidden xl:inline-block">Populares:</span>
              {["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "XRPUSDT"].map(s => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all border",
                    symbol === s
                      ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                      : "bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-white border-neutral-700/50 hover:border-neutral-600"
                  )}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
          </div>
          {isAnalyzing && (
            <p className="text-sm text-indigo-400 mt-4 animate-pulse">
              Baixando histórico, calculando indicadores e chamando Inteligência Artificial...
            </p>
          )}
        </div>

        {/* Real-Time Chart */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" /> Gráfico em Tempo Real
          </h2>
          <TradingViewWidget symbol={symbol} interval={interval} />
        </div>

        {/* Signals Feed */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-neutral-400" /> Sinais Recentes
          </h2>

          {loadingSignals ? (
            <div className="flex items-center justify-center p-12 text-neutral-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : signals.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400">
              Nenhum sinal gerado ainda. Clique em "Analisar Agora".
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              {groupedSignals.map((group) => (
                <div key={group.symbol} className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-neutral-800 pb-2">
                    <h3 className="text-2xl font-black text-white tracking-tight">{group.symbol}</h3>
                    <span className="bg-neutral-800 text-neutral-400 text-xs px-2 py-1 rounded-full font-medium">
                      {group.signals.length} {group.signals.length === 1 ? 'Análise' : 'Análises'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {group.signals.map((signal) => (
                      <div key={signal.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg hover:border-neutral-700 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-sm text-neutral-500 flex items-center gap-2">
                              <Clock className="w-4 h-4" /> {new Date(signal.createdAt).toLocaleString()} • {signal.interval}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              "px-4 py-1.5 rounded-full font-bold flex items-center gap-2",
                              signal.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                signal.action === 'SELL' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                  'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            )}>
                              {signal.action === 'BUY' ? <TrendingUp className="w-5 h-5" /> :
                                signal.action === 'SELL' ? <TrendingDown className="w-5 h-5" /> :
                                  <Activity className="w-5 h-5" />}
                              {signal.action}
                            </div>
                            <button
                              onClick={() => handleDelete(signal.id)}
                              className="p-2 text-neutral-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Excluir Sinal"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="bg-neutral-950 p-6 rounded-xl mb-6 text-neutral-300 border border-neutral-800/50 shadow-inner">
                          <article className="prose prose-invert prose-sm md:prose-base max-w-none prose-headings:text-indigo-400 prose-a:text-indigo-400 prose-strong:text-white prose-ul:my-2 prose-li:my-0 prose-p:my-2">
                            <ReactMarkdown>{signal.message}</ReactMarkdown>
                          </article>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Preço Atual</span>
                            <span className="font-mono text-white">${signal.price?.toLocaleString()}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Confiança da IA</span>
                            <span className="font-bold text-indigo-400">{signal.score || 0}%</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">RSI</span>
                            <span className="font-mono text-white">{signal.indicators?.rsi?.toFixed(1) || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Alvo (Take)</span>
                            <span className="font-mono text-emerald-400">${signal.takeProfit?.toLocaleString() || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50 col-span-2">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Stop Loss</span>
                            <span className="font-mono text-rose-400">${signal.stopLoss?.toLocaleString() || '-'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
