import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Busca as Top 250 moedas por Market Cap no CoinGecko
    const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false", {
      next: { revalidate: 3600 } // Cache por 1 hora para evitar rate limit
    });
    
    if (!res.ok) {
      throw new Error(`CoinGecko API falhou com status ${res.status}`);
    }

    const data = await res.json();
    
    // Stablecoins que não queremos operar contra o USDT
    const stablecoins = ["usdt", "usdc", "steth", "weth", "dai", "fdusd", "wbtc", "usde", "tusd", "usdd"];

    const coins = data
      .filter((coin: any) => !stablecoins.includes(coin.symbol.toLowerCase()))
      .map((coin: any) => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol.toUpperCase() + "USDT",
        image: coin.image,
        market_cap_rank: coin.market_cap_rank
      }))
      .slice(0, 200); // Pega o top 200 após filtrar as stablecoins

    return NextResponse.json({ success: true, data: coins });
  } catch (error: any) {
    console.error("[API Top Coins] Erro:", error);
    return NextResponse.json({ error: error.message || "Erro desconhecido" }, { status: 500 });
  }
}
