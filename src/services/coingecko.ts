export interface TrendingGem {
  id: string;
  name: string;
  symbol: string;
  binancePair: string;
  availableOnBinance: boolean;
  marketCapRank: number | null;
  thumb: string;
  priceUsd: number;
  change24h: number;
  volume24h?: number;
  potentialScore: number;
  narrative?: string;
}

export async function fetchCoinGeckoTrending(): Promise<TrendingGem[]> {
  try {
    // 1. Busca os tickers disponíveis na Binance para cruzar pares USDT
    let binancePairs = new Set<string>();
    try {
      const binanceRes = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
        next: { revalidate: 300 }, // Cache de 5 min
      });
      if (binanceRes.ok) {
        const binanceData = await binanceRes.json();
        binanceData.forEach((t: { symbol: string }) => binancePairs.add(t.symbol));
      }
    } catch (e) {
      console.warn("[CoinGecko Service] Aviso ao obter pares da Binance:", e);
    }

    // 2. Busca os itens em Trending na CoinGecko
    const cgRes = await fetch("https://api.coingecko.com/api/v3/search/trending", {
      next: { revalidate: 300 }, // Cache de 5 min
      headers: {
        Accept: "application/json",
      },
    });

    if (!cgRes.ok) {
      throw new Error(`CoinGecko Trending falhou com status ${cgRes.status}`);
    }

    const data = await cgRes.json();
    const coins = data.coins || [];

    const gems: TrendingGem[] = coins.map((itemObj: any) => {
      const item = itemObj.item;
      const rawSymbol = (item.symbol || "").toUpperCase();
      const binancePair = `${rawSymbol}USDT`;
      const isBinance = binancePairs.has(binancePair);
      const price = item.data?.price || 0;
      const change24h = item.data?.price_change_percentage_24h?.usd || 0;
      const rank = item.market_cap_rank || 9999;

      // Cálculo de pontuação de potencial de explosão (0 a 100)
      // Moedas com menor rank ou que estão em alta moderada pontuam alto
      let score = 70;
      if (isBinance) score += 15; // Facilidade de trade & liquidez
      if (change24h > 0 && change24h < 30) score += 10; // Em início de aceleração
      if (rank > 50 && rank < 600) score += 5; // Altcoin média/baixa capitalização (maior assimetria)

      return {
        id: item.id,
        name: item.name,
        symbol: rawSymbol,
        binancePair,
        availableOnBinance: isBinance,
        marketCapRank: rank === 9999 ? null : rank,
        thumb: item.large || item.thumb,
        priceUsd: price,
        change24h: Number(change24h.toFixed(2)),
        potentialScore: Math.min(score, 98),
      };
    });

    return gems;
  } catch (error) {
    console.error("[CoinGecko Service] Erro ao buscar trending:", error);
    throw error;
  }
}
