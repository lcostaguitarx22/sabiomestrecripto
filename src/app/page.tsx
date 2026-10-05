"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Activity, TrendingUp, TrendingDown, Clock, Brain, Loader2, Play, Trash2, AlertTriangle, ChevronDown, Calculator, DollarSign, Percent } from "lucide-react";
import clsx from "clsx";
import TradingViewWidget from "@/components/TradingViewWidget";
import ReactMarkdown from "react-markdown";

function RiskCalculator({ signal }: { signal: any }) {
  const [banca, setBanca] = useState<number>(1000);
  const [risco, setRisco] = useState<number>(1);
  const [alavancagem, setAlavancagem] = useState<number>(10);

  if (!signal.precoEntrada || !signal.stopLoss) return null;

  const entry = Number(signal.precoEntrada);
  const sl = Number(signal.stopLoss);
  
  if (entry === 0 || isNaN(entry) || isNaN(sl)) return null;

  const distPercent = Math.abs((entry - sl) / entry) * 100;
  if (distPercent === 0) return null;

  const amountToRisk = banca * (risco / 100);
  const positionSize = amountToRisk / (distPercent / 100);
  const marginRequired = positionSize / (alavancagem || 1);

  return (
    <details className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group/calc shadow-lg">
      <summary className="flex items-center gap-2 p-4 cursor-pointer select-none list-none hover:bg-neutral-800/50 transition-colors">
        <Calculator className="w-5 h-5 text-indigo-400" />
        <span className="font-semibold text-neutral-200">Calculadora Automática de Risco</span>
        <ChevronDown className="w-4 h-4 ml-auto text-neutral-500 group-open/calc:rotate-180 transition-transform" />
      </summary>
      <div className="p-4 pt-0 border-t border-neutral-800/50">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 mt-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Banca Total ($)</label>
            <input type="number" value={banca} onChange={e => setBanca(Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1 flex items-center gap-1"><Percent className="w-3 h-3"/> Risco na Operação (%)</label>
            <input type="number" step="0.1" value={risco} onChange={e => setRisco(Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Alavancagem (x)</label>
            <input type="number" value={alavancagem} onChange={e => setAlavancagem(Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-neutral-950 rounded-lg border border-neutral-800/50">
           <div className="flex flex-col">
             <span className="text-xs text-neutral-500 font-semibold mb-1">Entrada</span>
             <span className="text-sm font-bold text-white">${entry.toFixed(4)}</span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-neutral-500 font-semibold mb-1">Stop Loss</span>
             <span className="text-sm font-bold text-rose-400">${sl.toFixed(4)} <span className="text-xs text-rose-500/50 ml-1">({distPercent.toFixed(2)}%)</span></span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-neutral-500 font-semibold mb-1">Tamanho da Posição</span>
             <span className="text-sm font-bold text-indigo-400">${positionSize.toFixed(2)}</span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-neutral-500 font-semibold mb-1">Margem Exigida ({alavancagem}x)</span>
             <span className="text-lg font-black text-emerald-400">${marginRequired.toFixed(2)}</span>
           </div>
        </div>
        <p className="text-xs text-neutral-500 mt-4 leading-relaxed">
          * Para limitar sua perda em exatamente <strong className="text-rose-400">${amountToRisk.toFixed(2)}</strong> caso o mercado atinja o Stop Loss, configure sua posição na corretora para <strong>${positionSize.toFixed(2)}</strong>. Operando em <strong className="text-white">{alavancagem}x</strong>, isso exigirá <strong>${marginRequired.toFixed(2)}</strong> do seu saldo (Margem Inicial).
        </p>
      </div>
    </details>
  );
}

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
  const [filterMode, setFilterMode] = useState("ALL");

  // Termômetro Macro (Fase 4)
  const [fng, setFng] = useState<{ value: string; classification: string } | null>(null);
  const [btcTicker, setBtcTicker] = useState<{ price: string; change: string } | null>(null);

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

    // Fetch Fear & Greed
    fetch("https://api.alternative.me/fng/")
      .then(res => res.json())
      .then(data => {
        if (data && data.data && data.data[0]) {
          setFng({
            value: data.data[0].value,
            classification: data.data[0].value_classification
          });
        }
      })
      .catch(console.error);

    // Fetch BTC Ticker
    fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
      .then(res => res.json())
      .then(data => {
        if (data && data.lastPrice) {
          setBtcTicker({
            price: parseFloat(data.lastPrice).toLocaleString("en-US", { style: "currency", currency: "USD" }),
            change: parseFloat(data.priceChangePercent).toFixed(2)
          });
        }
      })
      .catch(console.error);

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
  };

  const filteredSignals = useMemo(() => {
    return signals.filter(signal => {
      if (filterMode === 'ALL') return true;
      if (filterMode === 'BUY') return signal.action === 'BUY';
      if (filterMode === 'SELL') return signal.action === 'SELL';
      if (filterMode === 'HIGH_CONFIDENCE') return signal.score >= 80;
      if (filterMode === 'OPEN') return !signal.status || signal.status === 'OPEN';
      if (filterMode === 'WIN') return signal.status?.startsWith('WIN');
      return true;
    });
  }, [signals, filterMode]);

  const groupedSignals = useMemo(() => {
    const groups: { symbol: string; signals: any[] }[] = [];
    const symbolMap = new Map<string, number>();

    filteredSignals.forEach((signal) => {
      if (!symbolMap.has(signal.symbol)) {
        symbolMap.set(signal.symbol, groups.length);
        groups.push({ symbol: signal.symbol, signals: [] });
      }
      const index = symbolMap.get(signal.symbol)!;
      groups[index].signals.push(signal);
    });

    return groups;
  }, [filteredSignals]);

  const stats = useMemo(() => {
    if (!signals.length) return { winRate: 0, wins: 0, losses: 0, open: 0, total: 0, finished: 0 };
    const wins = signals.filter(s => s.status?.startsWith('WIN')).length;
    const losses = signals.filter(s => s.status === 'LOSS').length;
    const open = signals.filter(s => !s.status || s.status === 'OPEN').length;
    const finished = wins + losses;
    const winRate = finished > 0 ? Math.round((wins / finished) * 100) : 0;
    return { winRate, wins, losses, open, total: signals.length, finished };
  }, [signals]);

  const handleEvaluate = async () => {
    try {
      const res = await fetch("/api/evaluate", { method: "POST" });
      if (res.ok) alert("Validação concluída! Os sinais foram atualizados.");
      else alert("Erro ao validar sinais.");
    } catch (e) {
      alert("Falha na conexão.");
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 md:p-8">
      <div className="w-full mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between border-b border-neutral-800 pb-6 gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="w-8 h-8 text-indigo-500" />
              MeuSabioMestreCripto - Developer: Luciano Costa
              <span className="text-sm font-normal bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">Trader: LucianoCosta</span>
            </h1>
            <p className="text-neutral-400 mt-2">Android de Análise Gráfica com IA</p>
          </div>

          {/* Termômetro Macro (Widgets) */}
          <div className="flex flex-wrap gap-4">
            {/* BTC Ticker */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3 shadow-lg flex flex-col justify-center items-end">
              <span className="text-xs text-neutral-500 font-semibold tracking-wider mb-1 flex items-center gap-1"><Activity className="w-3 h-3"/> BITCOIN (BTC)</span>
              {btcTicker ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-white">{btcTicker.price}</span>
                  <span className={clsx("text-sm font-bold px-2 py-0.5 rounded", parseFloat(btcTicker.change) >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                    {parseFloat(btcTicker.change) >= 0 ? "+" : ""}{btcTicker.change}%
                  </span>
                </div>
              ) : (
                <span className="text-sm text-neutral-500">Carregando...</span>
              )}
            </div>

            {/* Fear and Greed */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3 shadow-lg flex flex-col justify-center items-end">
              <span className="text-xs text-neutral-500 font-semibold tracking-wider mb-1">FEAR & GREED INDEX</span>
              {fng ? (
                <div className="flex items-center gap-3">
                  <span className={clsx(
                    "text-2xl font-black",
                    parseInt(fng.value) > 60 ? "text-emerald-400" :
                    parseInt(fng.value) < 40 ? "text-rose-400" : "text-amber-400"
                  )}>{fng.value} <span className="text-sm text-neutral-500 font-normal">/ 100</span></span>
                  <span className="text-sm font-medium text-neutral-300 bg-neutral-800 px-2 py-0.5 rounded">{fng.classification}</span>
                </div>
              ) : (
                <span className="text-sm text-neutral-500">Carregando...</span>
              )}
            </div>
          </div>
        </div>

        {/* Top Layout: Control Panel & Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left: Control Panel */}
          <div className="xl:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" /> Painel de Controle (Super Scanner)
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
                      placeholder={loadingCoins ? "Carregando..." : "Busque um par"}
                      className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-2 w-full focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
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
                    className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-2 w-32 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="15m">15 Min</option>
                    <option value="1h">1 Hora</option>
                    <option value="4h">4 Horas</option>
                    <option value="1d">1 Dia</option>
                  </select>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={clsx(
                    "flex flex-1 justify-center items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all",
                    isAnalyzing
                      ? "bg-indigo-600/50 cursor-not-allowed text-indigo-200"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/20"
                  )}
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Analisando...</>
                  ) : (
                    <><Play className="w-5 h-5 fill-current" /> Analisar Agora</>
                  )}
                </button>
              </div>

              {/* Shortcuts */}
              <div className="flex flex-wrap gap-2 items-center mt-4 pb-1">
                <span className="text-sm text-neutral-500 mr-1 hidden lg:inline-block">Populares:</span>
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "XRPUSDT", "SUIUSDT", "HYPEUSDT", "ZECUSDT", "LINKUSDT"].map(s => (
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
              <p className="text-sm text-indigo-400 mt-4 animate-pulse border-t border-neutral-800 pt-4">
                Baixando histórico, calculando indicadores e chamando Inteligência Artificial...
              </p>
            )}
          </div>

          {/* Right: Estatísticas da IA */}
          <div className="xl:col-span-5 grid grid-cols-2 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg flex flex-col justify-center items-center text-center">
              <span className="text-neutral-400 text-sm font-semibold mb-1">Taxa de Acerto (Win Rate)</span>
              <span className="text-4xl font-black text-emerald-400">{stats.winRate}%</span>
              <span className="text-xs text-neutral-500 mt-1">{stats.wins} Wins / {stats.losses} Losses</span>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg flex flex-col justify-center items-center text-center">
              <span className="text-neutral-400 text-sm font-semibold mb-1">Sinais Finalizados</span>
              <span className="text-4xl font-black text-white">{stats.finished}</span>
              <span className="text-xs text-neutral-500 mt-1">Atingiram TP ou SL</span>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg flex flex-col justify-center items-center text-center">
              <span className="text-neutral-400 text-sm font-semibold mb-1">Sinais Abertos</span>
              <span className="text-4xl font-black text-amber-400">{stats.open}</span>
              <span className="text-xs text-neutral-500 mt-1">Aguardando Desfecho</span>
            </div>
            <div className="bg-neutral-900 border border-indigo-900/50 rounded-xl p-5 shadow-lg flex flex-col justify-center items-center text-center">
              <span className="text-indigo-400 text-sm font-semibold mb-2">Rastreador Automático</span>
              <button 
                onClick={handleEvaluate}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20"
              >
                <Activity className="w-5 h-5" /> Validar Sinais Agora
              </button>
            </div>
          </div>
        </div>

        {/* Lembrete de Horários e Radar Macro */}
        <details className="mt-8 mb-2 group bg-neutral-800/20 border border-neutral-700/50 rounded-lg">
          <summary className="text-sm font-semibold text-neutral-300 p-3 flex items-center gap-2 cursor-pointer select-none list-none hover:bg-neutral-800/40 transition-colors rounded-lg">
            <Brain className="w-4 h-4 text-indigo-400" /> Dicas de Horários e Radar Macro
            <ChevronDown className="w-4 h-4 ml-auto text-neutral-500 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="p-4 border-t border-neutral-700/50">
            <h3 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" /> Melhores Horários (BRT)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-6">
              <div className="bg-neutral-800/40 border border-neutral-700/50 p-3 rounded-lg flex flex-col justify-center text-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-green-400 font-bold mb-1">09h às 13h</span>
                <span className="text-neutral-300 font-medium mb-1">Sobreposição NY/Londres</span>
                <span className="text-neutral-400">Alta liquidez e tendência forte</span>
              </div>
              <div className="bg-neutral-800/40 border border-neutral-700/50 p-3 rounded-lg flex flex-col justify-center text-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-yellow-400 font-bold mb-1">21h às 01h</span>
                <span className="text-neutral-300 font-medium mb-1">Abertura Asiática</span>
                <span className="text-neutral-400">Volatilidade noturna, novos ciclos</span>
              </div>
              <div className="bg-neutral-800/40 border border-neutral-700/50 p-3 rounded-lg flex flex-col justify-center text-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-orange-400 font-bold mb-1">14h às 20h</span>
                <span className="text-neutral-300 font-medium mb-1">Tarde/Noite</span>
                <span className="text-neutral-400">Consolidação, cuidado com fakeouts</span>
              </div>
              <div className="bg-neutral-800/40 border border-neutral-700/50 p-3 rounded-lg flex flex-col justify-center text-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-red-400 font-bold mb-1">Sáb e Dom</span>
                <span className="text-neutral-300 font-medium mb-1">Final de Semana</span>
                <span className="text-neutral-400">Risco elevado, baixa liquidez</span>
              </div>
            </div>

            {/* Radar Macro */}
            <h3 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Radar Macro (Extrema Volatilidade)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-neutral-800/40 border border-rose-900/30 p-3 rounded-lg flex flex-col justify-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-rose-400 font-bold mb-1">Inflação dos EUA (CPI/PCE)</span>
                <span className="text-neutral-300 font-medium mb-1">Divulgação mensal (manhã, geralmente 09:30 BRT)</span>
                <span className="text-neutral-400">Dados piores que a expectativa dão força ao dólar, derrubando o mercado de risco. Fique de fora do mercado nos minutos que antecedem a notícia!</span>
              </div>
              <div className="bg-neutral-800/40 border border-indigo-900/30 p-3 rounded-lg flex flex-col justify-center hover:bg-neutral-800/60 transition-colors">
                <span className="text-indigo-400 font-bold mb-1">Decisões de Juros (FED / FOMC)</span>
                <span className="text-neutral-300 font-medium mb-1">Próxima data: <strong className="text-white">28 de Outubro</strong> (aprox. 15:00 BRT)</span>
                <span className="text-neutral-400">Taxas mais altas sugam liquidez e empurram o preço das criptos para baixo. A volatilidade durante as coletivas de imprensa do presidente do FED costuma liquidar muitas posições.</span>
              </div>
            </div>
          </div>
        </details>

        {/* Real-Time Chart */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" /> Gráfico em Tempo Real
          </h2>
          <TradingViewWidget symbol={symbol} interval={interval} />
        </div>

        {/* Signals Feed */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-neutral-400" /> Sinais Recentes
            </h2>
            <div className="flex flex-wrap gap-2">
              {['ALL', 'BUY', 'SELL', 'HIGH_CONFIDENCE', 'OPEN', 'WIN'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all border",
                    filterMode === mode
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
                  )}
                >
                  {mode === 'ALL' && "Todos"}
                  {mode === 'BUY' && "🟢 Compra"}
                  {mode === 'SELL' && "🔴 Venda"}
                  {mode === 'HIGH_CONFIDENCE' && "🔥 Alta Confiança (+80%)"}
                  {mode === 'OPEN' && "⏳ Abertos"}
                  {mode === 'WIN' && "🏆 Apenas Wins"}
                </button>
              ))}
            </div>
          </div>

          {loadingSignals ? (
            <div className="flex items-center justify-center p-12 text-neutral-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : signals.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400">
              Nenhum sinal gerado ainda. Clique em "Analisar Agora".
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedSignals.map((group) => (
                <details key={group.symbol} className="group/coin bg-neutral-900/40 border border-neutral-800/60 rounded-xl overflow-hidden">
                  <summary className="flex items-center gap-3 p-4 cursor-pointer select-none list-none hover:bg-neutral-800/40 transition-colors">
                    <h3 className="text-xl font-black text-white tracking-tight">{group.symbol}</h3>
                    <span className="bg-neutral-800 text-neutral-400 text-xs px-3 py-1 rounded-full font-medium border border-neutral-700/50">
                      {group.signals.length} {group.signals.length === 1 ? 'Análise' : 'Análises'}
                    </span>
                    <ChevronDown className="w-5 h-5 ml-auto text-neutral-500 group-open/coin:rotate-180 transition-transform" />
                  </summary>

                  <div className="p-4 pt-2 border-t border-neutral-800/50 grid grid-cols-1 gap-6 bg-neutral-950/20">
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

                        {/* Status Badge */}
                        {signal.status && signal.status !== 'OPEN' && (
                          <div className={clsx(
                            "mb-4 px-4 py-2 rounded-lg text-sm font-bold inline-block border",
                            signal.status.startsWith('WIN') ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            {signal.status.startsWith('WIN') ? `✅ ALVO ATINGIDO (${signal.status})` : `❌ STOP LOSS ATINGIDO`}
                          </div>
                        )}

                        <div className="bg-neutral-950 p-6 rounded-xl mb-6 text-neutral-300 border border-neutral-800/50 shadow-inner">
                          <article className="prose prose-invert prose-sm md:prose-base max-w-none prose-headings:text-indigo-400 prose-a:text-indigo-400 prose-strong:text-white prose-ul:my-2 prose-li:my-0 prose-p:my-2">
                            <ReactMarkdown>{signal.message}</ReactMarkdown>
                          </article>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Preço Entrada</span>
                            <span className="font-mono text-white">${signal.precoEntrada?.toLocaleString() || signal.price?.toLocaleString()}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Preço Atual</span>
                            <span className="font-mono text-neutral-400">${signal.price?.toLocaleString()}</span>
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
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Take Profit 1</span>
                            <span className="font-mono text-emerald-400">${signal.takeProfit1?.toLocaleString() || signal.takeProfit?.toLocaleString() || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Take Profit 2</span>
                            <span className="font-mono text-emerald-500">${signal.takeProfit2?.toLocaleString() || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Take Profit 3</span>
                            <span className="font-mono text-emerald-600">${signal.takeProfit3?.toLocaleString() || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Stop Loss</span>
                            <span className="font-mono text-rose-400">${signal.stopLoss?.toLocaleString() || '-'}</span>
                          </div>

                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">R/R</span>
                            <span className="font-mono text-amber-400">{signal.rr || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Ordem</span>
                            <span className="text-white">{signal.tipoOrdem || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Tendência</span>
                            <span className="text-white">{signal.tendencia || '-'}</span>
                          </div>
                          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50">
                            <span className="text-neutral-500 block text-xs uppercase tracking-wider mb-1">Prognóstico</span>
                            <span className="text-white line-clamp-1" title={signal.prognostico}>{signal.prognostico || '-'}</span>
                          </div>
                        </div>
                        <RiskCalculator signal={signal} />
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
