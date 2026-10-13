"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Activity, TrendingUp, TrendingDown, Clock, Brain, Loader2, Play, Trash2, AlertTriangle, ChevronDown, Calculator, DollarSign, Percent, Sparkles, Rocket, ExternalLink, X, Plus, Send, Check } from "lucide-react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import { interval } from "date-fns";

// Carregando o componente TradingView dinamicamente no lado do cliente (CSR apenas)
const TradingViewWidget = dynamic(() => import("@/components/TradingViewWidget"), { ssr: false });

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
            <label className="block text-xs text-neutral-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Banca Total ($)</label>
            <input type="number" value={banca} onChange={e => setBanca(Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1 flex items-center gap-1"><Percent className="w-3 h-3" /> Risco na Operação (%)</label>
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
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronCoins, setCronCoins] = useState<string[]>(["BTCUSDT", "ETHUSDT", "NEARUSDT", "SUIUSDT"]);

  // CoinGecko Radar
  const [trendingGems, setTrendingGems] = useState<any[]>([]);
  const [loadingGems, setLoadingGems] = useState(false);
  const [lastGemsUpdate, setLastGemsUpdate] = useState<string | null>(null);

  // Robô Autônomo VIP Scan
  const [isRobotScanning, setIsRobotScanning] = useState(false);
  const [robotScanProgress, setRobotScanProgress] = useState("");
  const [robotScanResult, setRobotScanResult] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);

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

    // Fetch Cron State
    const unsubscribeCron = onSnapshot(doc(db, "settings", "cron"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCronEnabled(data.isRunning);
        if (data.coins && Array.isArray(data.coins)) {
          setCronCoins(data.coins);
        }
      } else {
        setCronEnabled(false);
      }
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

    return () => {
      unsubscribe();
      unsubscribeCron();
    };
    // Fetch Initial Radar Gems
    fetchRadarGems();
  }, []);

  const fetchRadarGems = async () => {
    setLoadingGems(true);
    try {
      const res = await fetch("/api/radar-gems");
      const json = await res.json();
      if (json.success && json.data) {
        setTrendingGems(json.data);
        setLastGemsUpdate(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (e) {
      console.error("Erro ao carregar radar CoinGecko:", e);
    } finally {
      setLoadingGems(false);
    }
  };

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

  const toggleCron = async () => {
    try {
      await setDoc(doc(db, "settings", "cron"), { isRunning: !cronEnabled, coins: cronCoins }, { merge: true });
    } catch (e) {
      alert("Erro ao alternar o robô.");
    }
  };

  const addCronCoin = async (coinToAdd: string) => {
    if (!cronCoins.includes(coinToAdd)) {
      const newCoins = [...cronCoins, coinToAdd];
      try {
        await setDoc(doc(db, "settings", "cron"), { isRunning: cronEnabled, coins: newCoins }, { merge: true });
      } catch (e) {
        alert("Erro ao adicionar moeda.");
      }
    }
  };

  const removeCronCoin = async (coinToRemove: string) => {
    const newCoins = cronCoins.filter(c => c !== coinToRemove);
    try {
      await setDoc(doc(db, "settings", "cron"), { isRunning: cronEnabled, coins: newCoins }, { merge: true });
    } catch (e) {
      alert("Erro ao remover moeda.");
    }
  };

  const toggleCronCoin = async (coin: string) => {
    setSymbol(coin);
    if (cronCoins.includes(coin)) {
      await removeCronCoin(coin);
    } else {
      await addCronCoin(coin);
    }
  };

  const handleRobotScan = async () => {
    if (cronCoins.length === 0) {
      alert("Adicione pelo menos uma moeda para escanear com o Robô.");
      return;
    }

    setIsRobotScanning(true);
    setRobotScanResult(null);
    let successCount = 0;
    let telegramCount = 0;
    let errorCount = 0;

    for (let i = 0; i < cronCoins.length; i++) {
      const coin = cronCoins[i];
      setRobotScanProgress(`Escaneando ${coin.replace("USDT", "")} (${i + 1}/${cronCoins.length})...`);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: coin, interval: "1h", source: "robot" }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
          if (data.telegramSent) {
            telegramCount++;
          }
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }

    setIsRobotScanning(false);
    setRobotScanProgress("");

    if (telegramCount > 0) {
      setRobotScanResult({
        type: "success",
        message: `Varredura concluída! ${successCount} moeda(s) analisada(s). 🔥 ${telegramCount} sinal(is) VIP (≥80%) enviado(s) ao Telegram!`,
      });
    } else if (successCount > 0) {
      setRobotScanResult({
        type: "info",
        message: `Varredura concluída! ${successCount} moeda(s) analisada(s). Nenhuma atingiu 80% de confiança para disparo no Telegram.`,
      });
    } else {
      setRobotScanResult({
        type: "error",
        message: "Falha ao escanear moedas. Verifique sua conexão e tente novamente.",
      });
    }

    setTimeout(() => {
      setRobotScanResult(null);
    }, 10000);
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
    setIsEvaluating(true);
    try {
      const res = await fetch("/api/evaluate", { method: "POST" });
      if (res.ok) alert("Validação concluída! Os sinais foram atualizados.");
      else alert("Erro ao validar sinais.");
    } catch (e) {
      alert("Falha na conexão.");
    } finally {
      setIsEvaluating(false);
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
              <span className="text-xs text-neutral-500 font-semibold tracking-wider mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> BITCOIN (BTC)</span>
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

              {/* Botão do Robô */}
              <div className="mt-4 pt-4 border-t border-neutral-800 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-emerald-400" /> Robô Autônomo VIP
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Escaneia automaticamente as moedas selecionadas.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Botão Scanear Agora */}
                    <button
                      onClick={handleRobotScan}
                      disabled={isRobotScanning || cronCoins.length === 0}
                      className={clsx(
                        "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-md",
                        isRobotScanning
                          ? "bg-indigo-600/60 text-indigo-200 cursor-not-allowed"
                          : cronCoins.length === 0
                          ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95 hover:shadow-lg"
                      )}
                      title="Escanear as moedas selecionadas com IA e enviar sinais (≥80%) ao Telegram"
                    >
                      {isRobotScanning ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {robotScanProgress || "Escaneando..."}</>
                      ) : (
                        <><Play className="w-3.5 h-3.5 fill-current" /> Scanear Agora</>
                      )}
                    </button>

                    {/* Botão Liga/Desliga Robô */}
                    <button
                      onClick={toggleCron}
                      className={clsx(
                        "px-4 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-2",
                        cronEnabled 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/20" 
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"
                      )}
                    >
                      {cronEnabled ? (
                        <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ROBÔ: ON</>
                      ) : (
                        <><span className="w-2 h-2 rounded-full bg-neutral-500"></span> ROBÔ: OFF</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Lista de Moedas do Cron */}
                <div className="flex flex-wrap gap-2 items-center">
                  {cronCoins.map(c => (
                    <span key={c} className="flex items-center gap-1 bg-neutral-800/80 text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-300">
                      <button onClick={() => setSymbol(c)} className="hover:text-white" title={`Ver gráfico de ${c.replace("USDT", "")}`}>
                        {c.replace("USDT", "")}
                      </button>
                      <button onClick={() => removeCronCoin(c)} className="hover:text-red-400 ml-1 text-neutral-500 font-bold" title={`Remover ${c.replace("USDT", "")}`}>&times;</button>
                    </span>
                  ))}
                  
                  <select 
                    className="bg-neutral-800 text-xs border border-neutral-700 rounded px-2.5 py-1 text-neutral-400 outline-none hover:border-neutral-600 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.value) {
                        addCronCoin(e.target.value);
                        e.target.value = ""; // Reset
                      }
                    }}
                  >
                    <option value="">+ Adicionar</option>
                    {["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "XRPUSDT", "SUIUSDT", "HYPEUSDT", "ZECUSDT", "LINKUSDT"]
                      .filter(c => !cronCoins.includes(c))
                      .map(c => (
                      <option key={c} value={c}>{c.replace("USDT", "")}</option>
                    ))}
                  </select>
                </div>

                {/* Shortcuts Populares */}
                <div className="flex flex-wrap gap-2 items-center mt-1 pb-1">
                  <span className="text-xs text-neutral-500 mr-1 hidden lg:inline-block">Populares:</span>
                  {["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "XRPUSDT", "SUIUSDT", "HYPEUSDT", "ZECUSDT", "LINKUSDT"].map((s) => {
                    const isSelected = cronCoins.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleCronCoin(s)}
                        className={clsx(
                          "px-2.5 py-1 text-xs font-medium rounded-md transition-all border flex items-center gap-1",
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                            : symbol === s
                            ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                            : "bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-white border-neutral-700/50 hover:border-neutral-600"
                        )}
                        title={isSelected ? `${s.replace('USDT', '')} selecionado no Robô (clique para remover)` : `Clique para adicionar ${s.replace('USDT', '')} ao Robô`}
                      >
                        {s.replace("USDT", "")}
                        {isSelected && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Notificação / Feedback do Scan */}
                {robotScanResult && (
                  <div
                    className={clsx(
                      "p-3 rounded-lg text-xs font-medium border flex items-center justify-between transition-all",
                      robotScanResult.type === "success"
                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                        : robotScanResult.type === "info"
                        ? "bg-neutral-950 border-neutral-800 text-neutral-300"
                        : "bg-rose-950/40 border-rose-500/40 text-rose-300"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {robotScanResult.type === "success" && <Send className="w-4 h-4 text-emerald-400 shrink-0" />}
                      <span>{robotScanResult.message}</span>
                    </div>
                    <button
                      onClick={() => setRobotScanResult(null)}
                      className="text-neutral-500 hover:text-white ml-2 p-0.5"
                      title="Fechar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {isRobotScanning && (
                  <p className="text-xs text-emerald-400 animate-pulse flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {robotScanProgress || "Escaneando moedas selecionadas e chamando Inteligência Artificial..."}
                  </p>
                )}
              </div>
            </div >

  { isAnalyzing && (
    <p className="text-sm text-indigo-400 mt-4 animate-pulse border-t border-neutral-800 pt-4">
      Baixando histórico, calculando indicadores e chamando Inteligência Artificial...
    </p>
  )}
          </div >

  {/* Right: Estatísticas da IA */ }
  < div className = "xl:col-span-5 grid grid-cols-2 gap-4" >
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
                disabled={isEvaluating}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEvaluating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                {isEvaluating ? "Validando Sinais..." : "Validar Sinais Agora"}
              </button>
            </div>
          </div >
        </div >

  {/* Lembrete de Horários e Radar Macro */ }
  < details className = "mt-8 mb-2 group bg-neutral-800/20 border border-neutral-700/50 rounded-lg" >
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
        </details >

  {/* Radar de Gemas & Explosões (CoinGecko) */ }
  < section className = "bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-xl" >
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-800">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Radar CoinGecko • Oportunidades & Gemas
            <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-medium">Trending Global</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Moedas mais buscadas no mundo agora com potencial de explosão nos próximos dias/semanas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-center">
        {lastGemsUpdate && (
          <span className="text-xs text-neutral-500 font-mono">
            Atualizado às {lastGemsUpdate}
          </span>
        )}
        <button
          onClick={fetchRadarGems}
          disabled={loadingGems}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <Sparkles className={clsx("w-3.5 h-3.5 text-amber-400", loadingGems && "animate-spin")} />
          {loadingGems ? "Atualizando..." : "Escanear Radar"}
        </button>
      </div>
    </div>

{
  loadingGems && trendingGems.length === 0 ? (
    <div className="flex items-center justify-center py-10 text-neutral-500 gap-2 text-sm">
      <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
      Rastreando tendências mundiais no CoinGecko...
    </div>
  ) : trendingGems.length === 0 ? (
    <div className="text-center py-8 text-neutral-500 text-xs">
      Nenhuma gema detectada no momento. Clique em "Escanear Radar" para atualizar.
    </div>
  ) : (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
    {trendingGems.slice(0, 10).map((gem) => {
      const isSelected = symbol === gem.binancePair;
      const isInCron = cronCoins.includes(gem.binancePair);

      return (
        <div
          key={gem.id}
          className={clsx(
            "bg-neutral-950/60 border rounded-xl p-3.5 flex flex-col justify-between transition-all hover:border-neutral-700 relative group",
            gem.availableOnBinance
              ? "border-neutral-800/80 hover:shadow-lg hover:shadow-amber-500/5"
              : "border-neutral-800/40 opacity-80"
          )}
        >
          <div>
            {/* Top Row: Coin info & Rank */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {gem.thumb ? (
                  <img src={gem.thumb} alt={gem.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{gem.name}</h4>
                  <span className="text-[10px] text-neutral-400 font-mono block uppercase">{gem.symbol}</span>
                </div>
              </div>

              {gem.marketCapRank && (
                <span className="text-[10px] font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded flex-shrink-0">
                  #{gem.marketCapRank}
                </span>
              )}
            </div>

            {/* Middle Row: Price & 24h Change */}
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-neutral-900">
              <span className="text-xs font-mono font-bold text-neutral-200">
                ${typeof gem.priceUsd === "number" && gem.priceUsd < 0.01
                  ? gem.priceUsd.toFixed(6)
                  : typeof gem.priceUsd === "number"
                    ? gem.priceUsd.toFixed(3)
                    : gem.priceUsd}
              </span>
              <span
                className={clsx(
                  "text-[11px] font-bold px-1.5 py-0.5 rounded",
                  gem.change24h >= 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400"
                )}
              >
                {gem.change24h >= 0 ? "+" : ""}{gem.change24h}%
              </span>
            </div>

            {/* Score de Potencial & Badge Binance */}
            <div className="mt-2.5 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-neutral-500">Potencial:</span>
                <span className="text-[10px] font-bold text-amber-400">{gem.potentialScore}%</span>
              </div>
              {gem.availableOnBinance ? (
                <span className="text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.2 rounded">
                  BINANCE
                </span>
              ) : (
                <span className="text-[9px] text-neutral-500 bg-neutral-900 px-1.5 py-0.2 rounded">
                  DEX / OUTRAS
                </span>
              )}
            </div>
          </div>

          {/* Actions Row */}
          <div className="mt-3 pt-2.5 border-t border-neutral-900 flex items-center gap-2">
            {gem.availableOnBinance ? (
              <>
                <button
                  onClick={() => setSymbol(gem.binancePair)}
                  className={clsx(
                    "flex-1 py-1 text-[11px] font-medium rounded transition-colors text-center border",
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800"
                  )}
                  title="Carregar gráfico e analisar"
                >
                  {isSelected ? "Selecionada" : "Analisar"}
                </button>

                <button
                  onClick={() => {
                    if (isInCron) removeCronCoin(gem.binancePair);
                    else addCronCoin(gem.binancePair);
                  }}
                  className={clsx(
                    "px-2 py-1 text-[11px] font-bold rounded transition-colors border",
                    isInCron
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border-neutral-800"
                  )}
                  title={isInCron ? "Remover do Robô Telegram" : "Adicionar ao Robô Telegram"}
                >
                  {isInCron ? "No Robô ✓" : "+ Robô"}
                </button>
              </>
            ) : (
              <a
                href={`https://www.coingecko.com/en/coins/${gem.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-1 text-[11px] font-medium rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 text-center flex items-center justify-center gap-1"
              >
                Ver no CoinGecko <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      );
    })}
  </div>
)
}
        </section >

  {/* Real-Time Chart */ }
  < div className = "mt-8" >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" /> Gráfico em Tempo Real
          </h2>
          <TradingViewWidget symbol={symbol} interval={interval} />
        </div >

  {/* Signals Feed */ }
  < div className = "space-y-4" >
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

{
  loadingSignals ? (
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
            {(() => {
              const wins = group.signals.filter(s => s.status && s.status.startsWith('WIN')).length;
              const losses = group.signals.filter(s => s.status && s.status !== 'OPEN' && !s.status.startsWith('WIN')).length;
              return (
                <div className="flex gap-2">
                  {wins > 0 && (
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-1 rounded-full font-medium border border-emerald-500/20">
                      {wins} {wins === 1 ? 'WIN' : 'WINS'}
                    </span>
                  )}
                  {losses > 0 && (
                    <span className="bg-rose-500/10 text-rose-400 text-xs px-2 py-1 rounded-full font-medium border border-rose-500/20">
                      {losses} {losses === 1 ? 'LOSS' : 'LOSSES'}
                    </span>
                  )}
                </div>
              );
            })()}
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
  )
}
        </div >
      </div >
    </main >
  );
}
