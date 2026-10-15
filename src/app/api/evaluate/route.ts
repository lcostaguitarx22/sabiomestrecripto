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

      // Validação de sanidade do Stop Loss para não computar erros de regex como Loss
      const entryPrice = parseFloat(data.precoEntrada) || parseFloat(data.price) || 0;
      if (action === "BUY" && stopLoss >= entryPrice && entryPrice > 0) continue;
      if (action === "SELL" && stopLoss <= entryPrice && entryPrice > 0) continue;

      let newStatus = "OPEN";

      // kline format: [Open time, Open, High, Low, Close, Volume, Close time, ...]
      for (const k of klines) {
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);

        if (action === "BUY") {
          // Checa se atingiu os Take Profits primeiro (ordem limite no book / realização de lucro)
          if (takeProfit3 && high >= takeProfit3) { newStatus = "WIN_TP3"; break; }
          if (takeProfit2 && high >= takeProfit2) { newStatus = "WIN_TP2"; break; }
          if (takeProfit1 && high >= takeProfit1) { newStatus = "WIN_TP1"; break; }
          if (data.takeProfit && high >= data.takeProfit) { newStatus = "WIN_TP1"; break; }

          // Se não bateu nenhum alvo de lucro, verifica se foi estopado
          if (low <= stopLoss) {
            newStatus = "LOSS";
            break;
          }
        } else if (action === "SELL") {
          // Checa se atingiu os Take Profits primeiro
          if (takeProfit3 && low <= takeProfit3) { newStatus = "WIN_TP3"; break; }
          if (takeProfit2 && low <= takeProfit2) { newStatus = "WIN_TP2"; break; }
          if (takeProfit1 && low <= takeProfit1) { newStatus = "WIN_TP1"; break; }
          if (data.takeProfit && low <= data.takeProfit) { newStatus = "WIN_TP1"; break; }

          // Se não bateu nenhum alvo, verifica se foi estopado
          if (high >= stopLoss) {
            newStatus = "LOSS";
            break;
          }
        }
      }

      if (newStatus !== "OPEN") {
        await updateDoc(doc(db, "signals", document.id), { status: newStatus });
        updatedCount++;

        // Avisar no Telegram sobre o resultado
        if (data.score >= 80) { // Só avisa de sinais VIP que foram mandados pro Telegram
          let emoji = newStatus === "LOSS" ? "🚨" : "✅";
          let resultText = newStatus === "LOSS" ? "STOP LOSS ATINGIDO" : `ALVO ALCANÇADO (${newStatus.replace("WIN_", "")})`;
          const actionText = action === "BUY" ? "BUY (LONG)" : "SELL (SHORT)";
          const orderIdLine = data.signalId ? `<b>ID da Ordem:</b> #${data.signalId}\n` : "";
          
          const tgMessage = `
${emoji} <b>RESULTADO DA OPERAÇÃO</b> ${emoji}
${orderIdLine}<b>Ativo:</b> #${symbol.replace("USDT", "")}
<b>Operação:</b> ${actionText}
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
