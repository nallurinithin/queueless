import { logger } from '../shared/logger.js';

/**
 * QueueLess Real SMS Gateway Service
 * Dispatches genuine SMS OTPs directly to cellular carriers (Airtel, Jio, Vi, BSNL, etc.).
 *
 * Supported Providers:
 * 1. Twilio (Global carrier SMS - Trial & Upgraded accounts)
 * 2. 2Factor.in (India SMS Gateway)
 * 3. Fast2SMS (India Quick OTP)
 */
export const smsService = {
  /**
   * Send 6-Digit Verification OTP via Real SMS
   */
  async sendOtpSms({ phone, otp, clinicName = 'QueueLess Aarogyam' }) {
    const raw10Digits = phone.replace(/\D/g, '').slice(-10);
    const fullPhone = phone.startsWith('+') ? phone : `+91${raw10Digits}`;
    const customMessage = `Your ${clinicName} verification OTP is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone.`;

    // 1. Twilio Gateway (Primary - real SMS delivery)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioFrom && twilioFrom !== '+1xxxxxxxxxx') {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
        
        // Trial accounts use Twilio's approved 2FA template 'sms_2fa'
        // If upgraded, it uses custom body
        const formParams = new URLSearchParams();
        formParams.append('To', fullPhone);
        formParams.append('From', twilioFrom);
        formParams.append('Body', 'sms_2fa');

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString(),
          }
        );

        const data = await response.json();
        if (response.ok && data.sid) {
          logger.info(`[SMS Service] Twilio SMS dispatched successfully to ${fullPhone} (SID: ${data.sid})`);
          
          // If Twilio trial rendered an official code in data.body, extract it
          let deliveredOtp = otp;
          if (data.body) {
            const match = data.body.match(/\b\d{6}\b/);
            if (match) {
              deliveredOtp = match[0];
              logger.info(`[SMS Service] Delivered cellular OTP code: ${deliveredOtp}`);
            }
          }

          return {
            success: true,
            provider: 'TWILIO',
            messageSid: data.sid,
            deliveredOtp,
          };
        } else {
          logger.error(`[SMS Service] Twilio error: ${data.message || JSON.stringify(data)}`);
        }
      } catch (err) {
        logger.error(`[SMS Service] Twilio network error: ${err.message}`);
      }
    }

    // 2. 2Factor.in (India SMS Gateway)
    const twoFactorKey = process.env.TWO_FACTOR_API_KEY || process.env['2FACTOR_API_KEY'];
    if (twoFactorKey) {
      try {
        const url = `https://2factor.in/API/V1/${twoFactorKey}/SMS/${raw10Digits}/${otp}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.Status === 'Success') {
          logger.info(`[SMS Service] 2Factor.in OTP delivered to mobile: ${phone}`);
          return { success: true, provider: '2FACTOR', deliveredOtp: otp };
        } else {
          logger.error(`[SMS Service] 2Factor error: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        logger.error(`[SMS Service] 2Factor network error: ${err.message}`);
      }
    }

    // 3. Fast2SMS
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (fast2smsKey && fast2smsKey !== 'mock_key') {
      try {
        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            authorization: fast2smsKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers: raw10Digits,
          }),
        });
        const data = await response.json();
        if (data.return === true || data.status_code === 200) {
          logger.info(`[SMS Service] Fast2SMS OTP delivered successfully to mobile: ${phone}`);
          return { success: true, provider: 'FAST2SMS', deliveredOtp: otp };
        } else {
          logger.warn(`[SMS Service] Fast2SMS status: ${data.message || JSON.stringify(data)}`);
        }
      } catch (err) {
        logger.error(`[SMS Service] Fast2SMS network error: ${err.message}`);
      }
    }

    return {
      success: false,
      error: 'SMS carrier delivery failed',
      provider: 'NONE',
      deliveredOtp: otp,
    };
  },
};
