import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/**
 * Gera um identificador sequencial único de 4 dígitos no formato "0000" a "9999"
 * para cada ordem/análise gerada no sistema.
 * 
 * Utiliza transação no Firestore em 'settings/counters' para garantir unicidade
 * mesmo com múltiplas chamadas simultâneas.
 */
export async function getNextSignalId(): Promise<string> {
  const counterRef = doc(db, "settings", "counters");

  try {
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let current = 0;

      if (counterDoc.exists() && typeof counterDoc.data().lastSignalId === "number") {
        current = counterDoc.data().lastSignalId;
      }

      // Incrementa sequencialmente de 1 a 9999 (ao passar de 9999, reinicia em 1)
      const next = current >= 9999 ? 1 : current + 1;

      transaction.set(
        counterRef,
        {
          lastSignalId: next,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return next;
    });

    return String(nextNumber).padStart(4, "0");
  } catch (error) {
    console.error("[SignalID] Falha ao obter ID sequencial por transação:", error);
    // Fallback pseudo-aleatório seguro no formato de 4 dígitos
    const fallback = Math.floor(1000 + Math.random() * 9000);
    return String(fallback).padStart(4, "0");
  }
}
