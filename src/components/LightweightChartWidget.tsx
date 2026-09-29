"use client";
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, SeriesMarker, Time, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';

interface LightweightChartWidgetProps {
  symbol: string;
  interval: string;
  signals?: any[];
}

export default function LightweightChartWidget({ symbol, interval, signals = [] }: LightweightChartWidgetProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [debugMarkersCount, setDebugMarkersCount] = useState(0);

  const fetchCandles = async () => {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`);
      const data = await res.json();
      
      return data.map((d: any) => ({
        time: (d[0] / 1000) as Time,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
      }));
    } catch (err) {
      console.error("Error fetching candles:", err);
      return [];
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#a3a3a3',
      },
      grid: {
        vertLines: { color: '#1f1f1f' },
        horzLines: { color: '#1f1f1f' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#1f1f1f',
      },
      timeScale: {
        borderColor: '#1f1f1f',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    seriesRef.current = candlestickSeries;

    window.addEventListener('resize', handleResize);

    const loadData = async () => {
      setLoading(true);
      const data = await fetchCandles();
      candlestickSeries.setData(data);
      setChartData(data);
      setLoading(false);
    };

    loadData();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, interval]);

  const updateMarkers = (dataToUse: any[]) => {
    if (!seriesRef.current || dataToUse.length === 0) return;

    const markersMap = new Map<number, SeriesMarker<Time>>();

    signals.forEach((sig) => {
      let signalTime: number;
      if (sig.createdAt && typeof sig.createdAt === 'object' && 'seconds' in sig.createdAt) {
        signalTime = sig.createdAt.seconds;
      } else {
        signalTime = Math.floor(new Date(sig.createdAt).getTime() / 1000);
      }
      
      if (isNaN(signalTime)) return; // Ignorar tempos inválidos

      let matchedTime = dataToUse[0].time;
      for (let i = dataToUse.length - 1; i >= 0; i--) {
        if (dataToUse[i].time <= signalTime) {
          matchedTime = dataToUse[i].time;
          break;
        }
      }

      const isBuy = sig.action === 'BUY';

      markersMap.set(matchedTime as number, {
        time: matchedTime as Time,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#10b981' : '#f43f5e',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: `${sig.action} @ ${sig.price}`,
        size: 2,
      });
    });

    const markers = Array.from(markersMap.values())
      .sort((a, b) => (a.time as number) - (b.time as number));

    console.log("Setting markers array length:", markers.length, markers);
    setDebugMarkersCount(markers.length);

    if (!markersPluginRef.current) {
      markersPluginRef.current = createSeriesMarkers(seriesRef.current, markers);
    } else {
      markersPluginRef.current.setMarkers(markers);
    }
  };

  useEffect(() => {
    if (!loading && chartData.length > 0) {
      updateMarkers(chartData);
    }
  }, [signals, loading, chartData]);

  return (
    <div className="w-full h-[75vh] min-h-[600px] bg-[#0a0a0a] rounded-xl overflow-hidden border border-neutral-800 shadow-xl relative flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="text-indigo-500 flex flex-col items-center gap-2">
            <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-medium">Carregando Gráfico...</span>
          </div>
        </div>
      )}
      <div className="absolute top-4 left-4 z-10 text-xs text-neutral-500 bg-black/50 px-2 py-1 rounded">
        Sinais recebidos: {signals?.length || 0} | Marcadores gerados: {debugMarkersCount}
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
