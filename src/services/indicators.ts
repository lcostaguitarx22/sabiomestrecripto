import { RSI, MACD, BollingerBands, SMA, EMA } from "technicalindicators";
import { Kline } from "./binance";

export interface IndicatorsResult {
  currentPrice: number;
  rsi: number;
  macd: { MACD?: number; signal?: number; histogram?: number };
  bollingerBands: { lower: number; middle: number; upper: number };
  sma20: number;
  sma50: number;
  ema20: number;
  support: number;
  resistance: number;
  volume: number;
}

export function calculateIndicators(klines: Kline[]): IndicatorsResult {
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

  // 4. Moving Averages
  const sma20Result = SMA.calculate({ period: 20, values: closes });
  const currentSma20 = sma20Result[sma20Result.length - 1] || currentPrice;

  const sma50Result = SMA.calculate({ period: 50, values: closes });
  const currentSma50 = sma50Result[sma50Result.length - 1] || currentPrice;

  const ema20Result = EMA.calculate({ period: 20, values: closes });
  const currentEma20 = ema20Result[ema20Result.length - 1] || currentPrice;

  // 5. Support and Resistance (Basic: Min/Max of last 20 periods)
  const recentLows = lows.slice(-20);
  const recentHighs = highs.slice(-20);
  const support = Math.min(...recentLows);
  const resistance = Math.max(...recentHighs);

  return {
    currentPrice,
    rsi: currentRsi,
    macd: currentMacd,
    bollingerBands: currentBb as { lower: number; middle: number; upper: number },
    sma20: currentSma20,
    sma50: currentSma50,
    ema20: currentEma20,
    support,
    resistance,
    volume: currentVolume,
  };
}
