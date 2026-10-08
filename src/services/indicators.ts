import { RSI, MACD, BollingerBands, EMA, VWAP, bullishengulfingpattern, bearishengulfingpattern, doji, hammerpattern, morningdojistar, eveningdojistar, piercingline, darkcloudcover, bullishharami, bearishharami, morningstar, eveningstar, shootingstar, dragonflydoji, gravestonedoji, tweezertop, tweezerbottom, threeblackcrows, threewhitesoldiers, bullishmarubozu, bearishmarubozu } from "technicalindicators";
import { Kline } from "./binance";

export interface IndicatorsResult {
  currentPrice: number;
  rsi: number;
  macd: { MACD?: number; signal?: number; histogram?: number };
  bollingerBands: { lower: number; middle: number; upper: number };
  ema7: number;
  ema25: number;
  ema99: number;
  ema200: number;
  vwap: number;
  vpvrPOC: number; // Point of Control aproximado
  support: number;
  resistance: number;
  volume: number;
  patterns: string[]; // Lista de padrões de candle detectados
}

export function calculateIndicators(klines: Kline[]): IndicatorsResult {
  const opens = klines.map((k) => k.open);
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const currentPrice = closes[closes.length - 1];
  const currentVolume = volumes[volumes.length - 1];

  // 1. RSI (14 periods)
  const rsiResult = RSI.calculate({ period: 14, values: closes });
  const currentRsi = rsiResult[rsiResult.length - 1] || 50;

  // 2. MACD (12, 26, 9)
  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const currentMacd = macdResult[macdResult.length - 1] || {};

  // 3. Bollinger Bands (20, 2)
  const bbResult = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const currentBb = bbResult[bbResult.length - 1] || { lower: 0, middle: 0, upper: 0 };

  // 4. Moving Averages (EMA 7, 25, 99, 200)
  const ema7Result = EMA.calculate({ period: 7, values: closes });
  const currentEma7 = ema7Result[ema7Result.length - 1] || currentPrice;

  const ema25Result = EMA.calculate({ period: 25, values: closes });
  const currentEma25 = ema25Result[ema25Result.length - 1] || currentPrice;

  const ema99Result = EMA.calculate({ period: 99, values: closes });
  const currentEma99 = ema99Result[ema99Result.length - 1] || currentPrice;

  const ema200Result = EMA.calculate({ period: 200, values: closes });
  const currentEma200 = ema200Result[ema200Result.length - 1] || currentPrice;

  // 5. VWAP
  const vwapResult = VWAP.calculate({
    high: highs,
    low: lows,
    close: closes,
    volume: volumes
  });
  const currentVwap = vwapResult[vwapResult.length - 1] || currentPrice;

  // 6. VPVR (Volume Profile Visible Range) - Aproximação de POC (Point of Control)
  // Divide a variação de preço (Min-Max) em bins e acumula volume. O POC é o bin com mais volume.
  const globalMin = Math.min(...lows);
  const globalMax = Math.max(...highs);
  const binCount = 20;
  const binSize = (globalMax - globalMin) / binCount;
  const bins = new Array(binCount).fill(0);
  
  for (let i = 0; i < klines.length; i++) {
    const kline = klines[i];
    const typicalPrice = (kline.high + kline.low + kline.close) / 3;
    let binIndex = Math.floor((typicalPrice - globalMin) / binSize);
    if (binIndex >= binCount) binIndex = binCount - 1;
    bins[binIndex] += kline.volume;
  }
  
  let maxVol = 0;
  let pocIndex = 0;
  for (let i = 0; i < binCount; i++) {
    if (bins[i] > maxVol) {
      maxVol = bins[i];
      pocIndex = i;
    }
  }
  const pocPrice = globalMin + (pocIndex * binSize) + (binSize / 2);

  // 7. Support and Resistance (Basic: Min/Max of last 20 periods)
  const recentLows = lows.slice(-20);
  const recentHighs = highs.slice(-20);
  const support = Math.min(...recentLows);
  const resistance = Math.max(...recentHighs);

  // 8. Padrões de Candlestick (Avaliando os últimos 5 candles)
  const last5 = {
    open: opens.slice(-5),
    high: highs.slice(-5),
    low: lows.slice(-5),
    close: closes.slice(-5),
  };
  
  const last1 = {
    open: opens.slice(-1),
    high: highs.slice(-1),
    low: lows.slice(-1),
    close: closes.slice(-1),
  };

  const patterns: string[] = [];
  
  // Engulfing
  if (bullishengulfingpattern(last5)) patterns.push("Bullish Engulfing");
  if (bearishengulfingpattern(last5)) patterns.push("Bearish Engulfing");
  
  // Harami (Mulher Grávida)
  if (bullishharami(last5)) patterns.push("Bullish Harami");
  if (bearishharami(last5)) patterns.push("Bearish Harami");

  // Estrelas
  if (morningstar(last5) || morningdojistar(last5)) patterns.push("Morning Star");
  if (eveningstar(last5) || eveningdojistar(last5)) patterns.push("Evening Star");
  if (shootingstar(last5)) patterns.push("Shooting Star");

  // Dojis e Martelos
  if (doji(last1)) patterns.push("Doji");
  if (dragonflydoji(last1)) patterns.push("Dragonfly Doji");
  if (gravestonedoji(last1)) patterns.push("Gravestone Doji");
  if (hammerpattern(last5)) patterns.push("Hammer");

  // Pinças (Tweezers)
  if (tweezertop(last5)) patterns.push("Tweezer Top");
  if (tweezerbottom(last5)) patterns.push("Tweezer Bottom");

  // Força Extrema
  if (threeblackcrows(last5)) patterns.push("Three Black Crows");
  if (threewhitesoldiers(last5)) patterns.push("Three White Soldiers");
  if (bullishmarubozu(last1)) patterns.push("Bullish Marubozu");
  if (bearishmarubozu(last1)) patterns.push("Bearish Marubozu");

  // Outros clássicos
  if (piercingline(last5)) patterns.push("Piercing Line");
  if (darkcloudcover(last5)) patterns.push("Dark Cloud Cover");

  return {
    currentPrice,
    rsi: currentRsi,
    macd: currentMacd,
    bollingerBands: currentBb as { lower: number; middle: number; upper: number },
    ema7: currentEma7,
    ema25: currentEma25,
    ema99: currentEma99,
    ema200: currentEma200,
    vwap: currentVwap,
    vpvrPOC: pocPrice,
    support,
    resistance,
    volume: currentVolume,
    patterns,
  };
}
