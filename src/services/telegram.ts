export async function sendTelegramAlert(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Token ou Chat ID não configurados. Alerta não enviado.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML", // Permite formatação em negrito/itálico na mensagem
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Telegram] Falha ao enviar mensagem:", err);
    } else {
      console.log("[Telegram] Alerta enviado com sucesso!");
    }
  } catch (error) {
    console.error("[Telegram] Erro na requisição:", error);
  }
}
