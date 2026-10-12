import { NextResponse } from "next/server";
import { fetchCoinGeckoTrending } from "@/services/coingecko";

export async function GET() {
  try {
    const gems = await fetchCoinGeckoTrending();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: gems.length,
      data: gems,
    });
  } catch (error: any) {
    console.error("[API Radar Gems] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao consultar CoinGecko" },
      { status: 500 }
    );
  }
}
