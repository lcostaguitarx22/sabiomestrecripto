import axios from "axios";

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export async function getKlines(symbol: string, interval: string, limit: number = 100): Promise<Kline[]> {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit,
      },
    });

    // Binance returns an array of arrays:
    // [0] Open time
    // [1] Open
    // [2] High
    // [3] Low
    // [4] Close
    // [5] Volume
    // [6] Close time
    return response.data.map((candle: any[]) => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6],
    }));
  } catch (error) {
    console.error("Erro ao buscar dados da Binance:", error);
    throw new Error("Falha ao se conectar com a Binance API");
  }
}

export async function getSymbolPrice(symbol: string): Promise<number | null> {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
      params: { symbol: symbol.toUpperCase() }
    });
    return parseFloat(response.data.price);
  } catch (e) {
    return null;
  }
}
