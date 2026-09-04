"use client";
import React, { useEffect, useRef } from 'react';

let tvScriptLoadingPromise: Promise<void> | null = null;

interface TradingViewWidgetProps {
  symbol: string;
  interval: string;
}

export default function TradingViewWidget({ symbol, interval }: TradingViewWidgetProps) {
  const onLoadScriptRef = useRef<(() => void) | null>(null);

  // Mapeamento de intervalos do nosso app (15m, 1h, 4h, 1d) para o formato do TradingView (15, 60, 240, D)
  const mapInterval = (inv: string) => {
    switch(inv) {
      case '15m': return '15';
      case '1h': return '60';
      case '4h': return '240';
      case '1d': return 'D';
      default: return '15';
    }
  };

  useEffect(() => {
    onLoadScriptRef.current = createWidget;

    if (!tvScriptLoadingPromise) {
      tvScriptLoadingPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.id = 'tradingview-widget-loading-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.type = 'text/javascript';
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }

    tvScriptLoadingPromise.then(() => {
      if (onLoadScriptRef.current) {
        onLoadScriptRef.current();
      }
    });

    function createWidget() {
      if (document.getElementById('tradingview_widget') && 'TradingView' in window) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: `BINANCE:${symbol}`,
          interval: mapInterval(interval),
          timezone: 'America/Sao_Paulo',
          theme: 'dark',
          style: '1',
          locale: 'br',
          enable_publishing: false,
          backgroundColor: "rgba(10, 10, 10, 1)",
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          hide_legend: false,
          save_image: false,
          studies: [
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
            "BB@tv-basicstudies",
            "MASimple@tv-basicstudies"
          ],
          container_id: 'tradingview_widget',
        });
      }
    }
  }, [symbol, interval]);

  return (
    <div className="w-full h-[75vh] min-h-[600px] bg-neutral-950 rounded-xl overflow-hidden border border-neutral-800 shadow-xl relative">
      <div id="tradingview_widget" className="w-full h-full" />
    </div>
  );
}
