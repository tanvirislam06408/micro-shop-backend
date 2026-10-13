import { env } from '../config/env.js';

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_REQUEST_TIMEOUT_MS = 5000;

export interface OrderTelegramNotificationPayload {
  id: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  customerNote?: string | null;
  productId: string;
  productName: string;
  planName: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: Date | string;
}

export interface TelegramNotificationResult {
  sent: boolean;
  reason?: 'missing_config' | 'api_error' | 'network_error';
}

function sanitizeTelegramErrorText(input: string, botToken?: string): string {
  let sanitized = input.replace(/bot\d+:[A-Za-z0-9_-]+/gi, 'bot[REDACTED]');
  if (botToken && botToken.length > 0) {
    sanitized = sanitized.split(botToken).join('[REDACTED]');
  }
  return sanitized;
}

function logTelegramFailure(
  orderId: string,
  reason: 'missing_config' | 'api_error' | 'network_error',
  message: string,
  botToken?: string,
): void {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'telegram_notification_failed',
      orderId,
      reason,
      message: sanitizeTelegramErrorText(message, botToken),
      timestamp: new Date().toISOString(),
    }),
  );
}

export function formatOrderTelegramMessage(
  order: OrderTelegramNotificationPayload,
): string {
  const createdAtIso =
    order.createdAt instanceof Date
      ? order.createdAt.toISOString()
      : String(order.createdAt);

  const lines = [
    'NEW ORDER — MicroBD.shop',
    '',
    `Order ID: ${order.id}`,
    `Customer ID: ${order.customerId}`,
    `Customer Email: ${order.customerEmail}`,
    `Customer Phone: ${order.customerPhone}`,
    ...(order.customerNote ? [`Customer Note: ${order.customerNote}`] : []),
    `Product: ${order.productName} (${order.productId})`,
    `Plan: ${order.planName}`,
    `Total Amount: ${order.amount} ${order.currency}`,
    `Payment Method: ${order.paymentMethod}`,
    `Payment Status: ${order.status}`,
    `Created At: ${createdAtIso}`,
  ];

  return lines.join('\n');
}

export async function sendOrderTelegramNotification(
  order: OrderTelegramNotificationPayload,
): Promise<TelegramNotificationResult> {
  const botToken = (
    process.env.TELEGRAM_BOT_TOKEN ??
    env.TELEGRAM_BOT_TOKEN ??
    ''
  ).trim();
  const chatId = (
    process.env.TELEGRAM_CHAT_ID ??
    env.TELEGRAM_CHAT_ID ??
    ''
  ).trim();

  if (!botToken || !chatId) {
    logTelegramFailure(
      order.id,
      'missing_config',
      'Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured',
    );
    return { sent: false, reason: 'missing_config' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TELEGRAM_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatOrderTelegramMessage(order),
        }),
        signal: controller.signal,
      },
    );

    let payload: { ok?: boolean; description?: string } | null = null;
    try {
      payload = (await response.json()) as {
        ok?: boolean;
        description?: string;
      };
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.ok !== true) {
      const description = payload?.description
        ? `: ${payload.description}`
        : '';
      logTelegramFailure(
        order.id,
        'api_error',
        `Telegram API responded with HTTP ${response.status}${description}`,
        botToken,
      );
      return { sent: false, reason: 'api_error' };
    }

    return { sent: true };
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.name === 'AbortError'
          ? `Telegram API request timed out after ${TELEGRAM_REQUEST_TIMEOUT_MS}ms`
          : error.message
        : 'Unknown network error while contacting Telegram API';

    logTelegramFailure(order.id, 'network_error', rawMessage, botToken);
    return { sent: false, reason: 'network_error' };
  } finally {
    clearTimeout(timeoutId);
  }
}
