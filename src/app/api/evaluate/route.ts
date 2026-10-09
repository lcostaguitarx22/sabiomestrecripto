import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/client";
import { collection, query, orderBy, limit, getDocs, updateDoc, doc } from "firebase/firestore";

async function fetchBinanceKlinesSince(symbol: string, interval: string, startTime: number) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=1000`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error fetching binance klines", err);
    return [];
  }
}

export async function evaluateSignals() {
  const q = query(collection(db, "signals"), orderBy("createdAt", "desc"), limit(50));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return 0;

  let updatedCount = 0;

    for (const document of snapshot.docs) {
      const data = document.data();
      
      // Pula se já estiver finalizado (WIN_... ou LOSS)
      if (data.status && data.status !== "OPEN") continue;

      const { symbol, interval, createdAt, stopLoss, takeProfit1, takeProfit2, takeProfit3, action } = data;
      if (!symbol || !createdAt || !stopLoss) continue;

      const startTime = new Date(createdAt).getTime();

      const klines = await fetchBinanceKlinesSince(symbol, interval, startTime);
      if (!klines || klines.length === 0) continue;

      let newStatus = "OPEN";

      // kline format: [Open time, Open, High, Low, Close, Volume, Close time, ...]
      for (const k of klines) {
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);

        if (action === "BUY") {
          // Checa Stop Loss primeiro (pior caso dentro do mesmo candle)
          if (low <= stopLoss) {
            newStatus = "LOSS";
            break;
          }
          // Checa Take Profits (do 3 para o 1)
          if (takeProfit3 && high >= takeProfit3) { newStatus = "WIN_TP3"; break; }
          if (takeProfit2 && high >= takeProfit2) { newStatus = "WIN_TP2"; break; }
          if (takeProfit1 && high >= takeProfit1) { newStatus = "WIN_TP1"; break; }
          if (data.takeProfit && high >= data.takeProfit) { newStatus = "WIN_TP1"; break; } // fallback antigo
        } else if (action === "SELL") {
          // Checa Stop Loss
          if (high >= stopLoss) {
            newStatus = "LOSS";
            break;
          }
          // Checa Take Profits
          if (takeProfit3 && low <= takeProfit3) { newStatus = "WIN_TP3"; break; }
          if (takeProfit2 && low <= takeProfit2) { newStatus = "WIN_TP2"; break; }
          if (takeProfit1 && low <= takeProfit1) { newStatus = "WIN_TP1"; break; }
          if (data.takeProfit && low <= data.takeProfit) { newStatus = "WIN_TP1"; break; } // fallback antigo
        }
      }

      if (newStatus !== "OPEN") {
        await updateDoc(doc(db, "signals", document.id), { status: newStatus });
        updatedCount++;

        // Avisar no Telegram sobre o resultado
        if (data.score >= 80) { // Só avisa de sinais VIP que foram mandados pro Telegram
          let emoji = newStatus === "LOSS" ? "🚨" : "✅";
          let resultText = newStatus === "LOSS" ? "STOP LOSS ATINGIDO" : `ALVO ALCANÇADO (${newStatus.replace("WIN_", "")})`;
          
          const tgMessage = `
${emoji} <b>RESULTADO DA OPERAÇÃO</b> ${emoji}
<b>Ativo:</b> #${symbol.replace("USDT", "")}
<b>Operação:</b> ${action}
<b>Resultado:</b> ${resultText}
          `;
          
          const telegram = await import('@/services/telegram');
          await telegram.sendTelegramAlert(tgMessage.trim());
        }
      }
    }

  return updatedCount;
}

export async function POST() {
  try {
    const updatedCount = await evaluateSignals();
    return NextResponse.json({ success: true, updatedCount });
  } catch (error: any) {
    console.error("Evaluate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
