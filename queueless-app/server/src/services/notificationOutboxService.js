import { NotificationOutbox, OUTBOX_STATUS } from '../models/index.js';
import { logger } from '../shared/logger.js';

export const notificationOutboxService = {
  /**
   * Enqueue a notification for asynchronous, resilient delivery
   * Supports dedupKey to prevent duplicate notifications (e.g. approaching alert once per visit)
   */
  async enqueue({
    clinicId,
    recipient,
    recipientType = 'PATIENT',
    channel = 'SMS',
    eventType,
    title = '',
    message,
    payload = {},
    dedupKey,
  }) {
    if (!recipient || !message || !eventType) {
      const err = new Error('Recipient, message, and eventType are required for outbox notification.');
      err.statusCode = 400;
      throw err;
    }

    if (dedupKey) {
      const existing = await NotificationOutbox.findOne({ dedupKey });
      if (existing) {
        logger.info(`Outbox dedupKey hit: ${dedupKey}. Notification suppressed.`);
        return { enqueued: false, duplicate: true, record: existing };
      }
    }

    const record = await NotificationOutbox.create({
      clinicId,
      recipient,
      recipientType,
      channel,
      eventType,
      title,
      message,
      payload,
      dedupKey: dedupKey || undefined,
      status: OUTBOX_STATUS.PENDING,
      attempts: 0,
      maxAttempts: 3,
      nextRetryAt: new Date(),
    });

    return { enqueued: true, duplicate: false, record };
  },

  /**
   * Mock or Carrier Delivery Dispatcher
   */
  async dispatchDelivery(record, { forceFailure = false } = {}) {
    if (forceFailure) {
      throw new Error('Carrier upstream gateway error: timeout or network failure.');
    }

    // In production, integrate SMS / WhatsApp / Email gateway here.
    // For V1, simulate immediate reliable dispatch
    return {
      success: true,
      providerMessageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date(),
    };
  },

  /**
   * Worker Loop: Process Pending Outbox Notifications with Exponential Backoff
   */
  async processOutbox({ clinicId, batchSize = 10, forceFailure = false } = {}) {
    const filter = {
      status: { $in: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.FAILED] },
      attempts: { $lt: 3 },
      nextRetryAt: { $lte: new Date() },
    };
    if (clinicId) filter.clinicId = clinicId;

    const items = await NotificationOutbox.find(filter).limit(batchSize);
    let deliveredCount = 0;
    let failedCount = 0;
    let deadLetterCount = 0;

    for (const item of items) {
      item.attempts += 1;
      item.status = OUTBOX_STATUS.PROCESSING;
      await item.save();

      try {
        await this.dispatchDelivery(item, { forceFailure });
        item.status = OUTBOX_STATUS.DELIVERED;
        item.deliveredAt = new Date();
        item.lastError = null;
        deliveredCount += 1;
      } catch (err) {
        item.lastError = err.message;
        if (item.attempts >= item.maxAttempts) {
          item.status = OUTBOX_STATUS.DEAD_LETTER;
          deadLetterCount += 1;
        } else {
          item.status = OUTBOX_STATUS.FAILED;
          // Exponential backoff: 2^attempts seconds
          const backoffSeconds = Math.pow(2, item.attempts);
          item.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
          failedCount += 1;
        }
      }
      await item.save();
    }

    return {
      processed: items.length,
      delivered: deliveredCount,
      failed: failedCount,
      deadLetter: deadLetterCount,
    };
  },

  /**
   * Manual staff re-queue for dead-letter items
   */
  async retryDeadLetter(outboxId) {
    const item = await NotificationOutbox.findById(outboxId);
    if (!item) {
      const err = new Error('Outbox item not found.');
      err.statusCode = 404;
      throw err;
    }

    item.status = OUTBOX_STATUS.PENDING;
    item.attempts = 0;
    item.nextRetryAt = new Date();
    item.lastError = null;
    await item.save();

    return item;
  },
};

