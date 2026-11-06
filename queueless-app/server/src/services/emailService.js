import nodemailer from 'nodemailer';
import { logger } from '../shared/logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true,
    auth: { user, pass },
  });

  return transporter;
}

export const emailService = {
  /**
   * Send Staff Invitation Email
   */
  async sendStaffInvitation({ toEmail, staffName, role, clinicName, activationToken }) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const activationLink = `${clientUrl}/staff/activate?token=${activationToken}`;

    const mailer = getTransporter();
    if (!mailer) {
      logger.warn(
        `[Email Service] SMTP credentials not set in .env. Invitation email to ${toEmail} was not dispatched via Gmail.`
      );
      return { success: false, reason: 'SMTP_NOT_CONFIGURED' };
    }

    const senderEmail = process.env.SMTP_USER || process.env.EMAIL_USER;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to ${clinicName}</h2>
        <p style="color: #334155; font-size: 16px;">Hello <strong>${staffName}</strong>,</p>
        <p style="color: #334155; font-size: 15px; line-height: 1.5;">
          You have been invited by the Clinic Administrator to join <strong>${clinicName}</strong> on the QueueLess healthcare management platform as a <strong>${role}</strong>.
        </p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${activationLink}" 
             style="background-color: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
            Activate Account & Set Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
          This invitation link is strictly single-use and will expire in 48 hours.<br />
          If the button above does not work, copy and paste this URL into your browser:<br />
          <a href="${activationLink}" style="color: #0284c7; word-break: break-all;">${activationLink}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
          QueueLess Healthcare Platform — Automated notification on behalf of ${clinicName}.
        </p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${clinicName}" <${senderEmail}>`,
        to: toEmail,
        subject: `Invitation to join ${clinicName} as ${role}`,
        html: htmlContent,
      });

      logger.info(`[Email Service] Invitation email successfully sent to ${toEmail} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      logger.error(`[Email Service] Failed to send email to ${toEmail}:`, err.message);
      return { success: false, error: err.message };
    }
  },
};

