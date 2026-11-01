import crypto from 'crypto';
import {
  BookingContact,
  Patient,
  PatientContactLink,
  RELATIONSHIPS,
  PatientSession,
  GENDER,
  AuditLog,
} from '../models/index.js';
import { logger } from '../shared/logger.js';

function hashToken(val) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function normalizePhoneNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

// In-memory OTP storage with rate limits (5 min validity, 60s cooldown, 3 max attempts)
const otpStore = new Map();

export const patientAuthService = {
  /**
   * Request Phone OTP
   */
  async requestOtp({ phone, clinicId }) {
    if (!phone || phone.trim().length < 10) {
      const err = new Error('Please enter a valid mobile number.');
      err.statusCode = 400;
      throw err;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    const now = Date.now();
    const existing = otpStore.get(normalizedPhone);

    // 1. Resend cooldown: 60 seconds
    if (existing && now - existing.lastRequestedAt < 60 * 1000) {
      const remainingSecs = Math.ceil((60 * 1000 - (now - existing.lastRequestedAt)) / 1000);
      const err = new Error(`Please wait ${remainingSecs} seconds before requesting a new OTP.`);
      err.statusCode = 429;
      throw err;
    }

    // 2. Rate limit: Max 5 requests per hour
    const oneHourAgo = now - 60 * 60 * 1000;
    if (existing && existing.firstRequestInHour > oneHourAgo && existing.hourlyCount >= 5) {
      const err = new Error('Too many OTP requests. Please try again after an hour.');
      err.statusCode = 429;
      throw err;
    }

    // Generate 6-digit OTP
    const rawOtp = process.env.NODE_ENV === 'test' ? '123456' : crypto.randomInt(100000, 999999).toString();
    const otpHash = hashToken(rawOtp);
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes

    const hourlyCount = existing && existing.firstRequestInHour > oneHourAgo ? existing.hourlyCount + 1 : 1;
    const firstRequestInHour = existing && existing.firstRequestInHour > oneHourAgo ? existing.firstRequestInHour : now;

    otpStore.set(normalizedPhone, {
      otpHash,
      expiresAt,
      attempts: 0,
      lastRequestedAt: now,
      hourlyCount,
      firstRequestInHour,
    });

    logger.info(`[OTP Service] OTP generated for ${normalizedPhone}: ${process.env.NODE_ENV !== 'production' ? rawOtp : '******'}`);

    return {
      success: true,
      message: 'OTP sent successfully to your mobile number.',
      normalizedPhone,
      cooldownSecs: 60,
      devOtp: process.env.NODE_ENV !== 'production' ? rawOtp : undefined,
    };
  },

  /**
   * Verify Phone OTP and Establish Persistent Session
   */
  async verifyOtp({ phone, otp, clinicId, userAgent = '', ipAddress = '' }) {
    if (!phone || !otp) {
      const err = new Error('Mobile number and OTP are required.');
      err.statusCode = 400;
      throw err;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    const record = otpStore.get(normalizedPhone);

    // Development bypass for fast reliable automated testing
    const isDevBypass = process.env.NODE_ENV !== 'production' && otp === '123456';

    if (!record && !isDevBypass) {
      const err = new Error('OTP expired or not requested. Please request a new OTP.');
      err.statusCode = 400;
      throw err;
    }

    if (record) {
      if (Date.now() > record.expiresAt) {
        otpStore.delete(normalizedPhone);
        const err = new Error('OTP has expired. Please request a new OTP.');
        err.statusCode = 400;
        throw err;
      }

      record.attempts += 1;
      if (record.attempts > 3) {
        otpStore.delete(normalizedPhone);
        const err = new Error('Maximum verification attempts exceeded. Please request a new OTP.');
        err.statusCode = 429;
        throw err;
      }

      const inputHash = hashToken(otp);
      if (inputHash !== record.otpHash && !isDevBypass) {
        const err = new Error('Invalid OTP. Please check the code and try again.');
        err.statusCode = 400;
        throw err;
      }

      // Valid OTP: delete from store
      otpStore.delete(normalizedPhone);
    }

    // 1. Find or create BookingContact
    let bookingContact = await BookingContact.findOne({ clinicId, normalizedPhone });
    if (!bookingContact) {
      bookingContact = await BookingContact.create({
        clinicId,
        phone,
        normalizedPhone,
        isVerified: true,
        lastVerifiedAt: new Date(),
      });
    } else {
      bookingContact.isVerified = true;
      bookingContact.lastVerifiedAt = new Date();
      await bookingContact.save();
    }

    // 2. Check if default Self patient profile exists, create if not
    const existingLinks = await PatientContactLink.find({
      clinicId,
      bookingContactId: bookingContact._id,
    }).populate('patientId');

    let selfPatient = null;
    if (existingLinks.length === 0) {
      selfPatient = await Patient.create({
        clinicId,
        fullName: 'Primary Patient',
        gender: GENDER.OTHER,
      });

      await PatientContactLink.create({
        clinicId,
        bookingContactId: bookingContact._id,
        patientId: selfPatient._id,
        relationship: RELATIONSHIPS.SELF,
        isDefault: true,
      });
    }

    // 3. Establish Persistent Session (7-day idle rolling, 30-day absolute)
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(rawSessionToken);
    const now = Date.now();
    const idleExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7 days
    const absoluteExpiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000); // 30 days

    await PatientSession.create({
      clinicId,
      bookingContactId: bookingContact._id,
      sessionTokenHash,
      expiresAt: idleExpiresAt,
      absoluteExpiresAt,
      userAgent,
      ipAddress,
    });

    // 4. Fetch linked family members
    const allLinks = await PatientContactLink.find({
      clinicId,
      bookingContactId: bookingContact._id,
    }).populate('patientId');

    const linkedPatients = allLinks
      .filter((l) => l.patientId)
      .map((l) => ({
        id: l.patientId._id.toString(),
        fullName: l.patientId.fullName,
        gender: l.patientId.gender,
        age: l.patientId.age,
        relationship: l.relationship,
        isDefault: l.isDefault,
      }));

    return {
      sessionToken: rawSessionToken,
      expiresAt: idleExpiresAt,
      bookingContact: {
        id: bookingContact._id.toString(),
        phone: bookingContact.phone,
        normalizedPhone: bookingContact.normalizedPhone,
      },
      linkedPatients,
    };
  },

  /**
   * Get Active Session and Linked Family Profiles (Used on Page Refresh)
   */
  async getActiveSession({ sessionToken, clinicId }) {
    if (!sessionToken) return null;
    const tokenHash = hashToken(sessionToken);

    const session = await PatientSession.findOne({
      sessionTokenHash: tokenHash,
      expiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() },
      revokedAt: null,
    });

    if (!session) return null;

    const bookingContact = await BookingContact.findById(session.bookingContactId);
    if (!bookingContact) return null;

    // Refresh rolling idle expiry
    const rollingIdle = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.expiresAt = rollingIdle < session.absoluteExpiresAt ? rollingIdle : session.absoluteExpiresAt;
    session.lastActivityAt = new Date();
    await session.save();

    const allLinks = await PatientContactLink.find({
      clinicId: session.clinicId,
      bookingContactId: bookingContact._id,
    }).populate('patientId');

    const linkedPatients = allLinks
      .filter((l) => l.patientId)
      .map((l) => ({
        id: l.patientId._id.toString(),
        fullName: l.patientId.fullName,
        gender: l.patientId.gender,
        age: l.patientId.age,
        relationship: l.relationship,
        isDefault: l.isDefault,
      }));

    return {
      bookingContact: {
        id: bookingContact._id.toString(),
        phone: bookingContact.phone,
        normalizedPhone: bookingContact.normalizedPhone,
      },
      linkedPatients,
      expiresAt: session.expiresAt,
    };
  },

  /**
   * Add a New Family Member Under the Active Contact
   */
  async addFamilyMember({ bookingContactId, clinicId, fullName, gender, age, relationship }) {
    if (!fullName || !gender) {
      const err = new Error('Full name and gender are required for patient profile.');
      err.statusCode = 400;
      throw err;
    }

    const patient = await Patient.create({
      clinicId,
      fullName: fullName.trim(),
      gender,
      age: age ? Number(age) : undefined,
    });

    const link = await PatientContactLink.create({
      clinicId,
      bookingContactId,
      patientId: patient._id,
      relationship: relationship || RELATIONSHIPS.OTHER,
      isDefault: false,
    });

    return {
      id: patient._id.toString(),
      fullName: patient.fullName,
      gender: patient.gender,
      age: patient.age,
      relationship: link.relationship,
    };
  },

  /**
   * Patient Session Logout
   */
  async logout(sessionToken) {
    if (!sessionToken) return;
    const tokenHash = hashToken(sessionToken);
    await PatientSession.updateOne({ sessionTokenHash: tokenHash }, { revokedAt: new Date() });
  },
};

