import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  StaffUser,
  STAFF_ROLES,
  STAFF_STATUS,
  StaffInvitationToken,
  StaffPasswordResetToken,
  StaffSession,
  AuditLog,
} from '../models/index.js';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export const staffAuthService = {
  /**
   * Unified Staff Login
   * Accepts email and password. Identifies role and returns appropriate dashboard route.
   */
  async login(email, password, { userAgent = '', ipAddress = '' } = {}) {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const staffUser = await StaffUser.findOne({ email: normalizedEmail });

    if (!staffUser) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    if (staffUser.status !== STAFF_STATUS.ACTIVE) {
      const err = new Error(
        staffUser.status === STAFF_STATUS.INVITED
          ? 'Account pending activation. Please check your invitation email.'
          : 'Account has been deactivated. Please contact your Clinic Administrator.'
      );
      err.statusCode = 403;
      throw err;
    }

    const isMatch = await bcrypt.compare(password, staffUser.passwordHash || '');
    if (!isMatch) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // Generate high-entropy session token
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await StaffSession.create({
      clinicId: staffUser.clinicId,
      staffUserId: staffUser._id,
      sessionTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });

    staffUser.lastLoginAt = new Date();
    await staffUser.save();

    let redirectPath = '/staff/receptionist';
    if (staffUser.role === STAFF_ROLES.CLINIC_OWNER) {
      redirectPath = '/staff/owner';
    } else if (staffUser.role === STAFF_ROLES.DOCTOR) {
      redirectPath = '/staff/doctor';
    }

    return {
      staffUser: {
        id: staffUser._id.toString(),
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role,
        clinicId: staffUser.clinicId.toString(),
      },
      sessionToken: rawSessionToken,
      redirectPath,
      expiresAt,
    };
  },

  /**
   * Terminate Staff Session
   */
  async logout(rawSessionToken) {
    if (!rawSessionToken) return;
    const tokenHash = hashToken(rawSessionToken);
    await StaffSession.updateOne({ sessionTokenHash: tokenHash }, { revokedAt: new Date() });
  },

  /**
   * Invite New Staff Member (Clinic Owner Only)
   */
  async inviteStaff({ ownerUser, clinicId, name, email, role, phone = '', departmentIds = [] }) {
    const normalizedEmail = (email || '').toLowerCase().trim();

    // Check if email already registered in clinic
    const existing = await StaffUser.findOne({ clinicId, email: normalizedEmail });
    if (existing) {
      const err = new Error(`A staff account with email ${normalizedEmail} already exists.`);
      err.statusCode = 409;
      throw err;
    }

    // Create staff in INVITED status without password
    const staffUser = await StaffUser.create({
      clinicId,
      name,
      email: normalizedEmail,
      phone,
      role,
      status: STAFF_STATUS.INVITED,
      departmentIds,
      passwordHash: null,
    });

    // Generate single-use invitation token (valid for 48 hours)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invitation = await StaffInvitationToken.create({
      clinicId,
      staffUserId: staffUser._id,
      tokenHash,
      role,
      expiresAt,
    });

    await AuditLog.create({
      clinicId,
      actorId: ownerUser._id,
      actorRole: ownerUser.role,
      actorEmailOrPhone: ownerUser.email,
      action: 'STAFF_INVITED',
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
      details: {
        staffName: name,
        staffEmail: normalizedEmail,
        role,
        invitationId: invitation._id.toString(),
      },
    });

    return {
      staffUser: {
        id: staffUser._id.toString(),
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role,
        status: staffUser.status,
      },
      invitationId: invitation._id.toString(),
      invitationToken: rawToken, // Delivered once via email/secure channel
      expiresAt,
    };
  },

  /**
   * Activate Account via Invitation Link
   * Staff member sets their own password; owner never sees or knows it.
   */
  async activateAccount({ token, password }) {
    if (!token || !password || password.length < 8) {
      const err = new Error('Password must be at least 8 characters long.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = hashToken(token);
    const invitation = await StaffInvitationToken.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
      usedAt: null,
      revokedAt: null,
    });

    if (!invitation) {
      const err = new Error('Invalid, expired, or already used invitation token.');
      err.statusCode = 400;
      throw err;
    }

    const staffUser = await StaffUser.findById(invitation.staffUserId);
    if (!staffUser) {
      const err = new Error('Staff member not found.');
      err.statusCode = 404;
      throw err;
    }

    // Hash password using bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    staffUser.passwordHash = passwordHash;
    staffUser.status = STAFF_STATUS.ACTIVE;
    await staffUser.save();

    invitation.usedAt = new Date();
    await invitation.save();

    await AuditLog.create({
      clinicId: staffUser.clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      actorEmailOrPhone: staffUser.email,
      action: 'STAFF_ACCOUNT_ACTIVATED',
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
    });

    return {
      success: true,
      message: 'Account activated successfully. You can now log in.',
    };
  },

  /**
   * Resend Staff Invitation (Owner Only)
   */
  async resendInvitation({ ownerUser, clinicId, staffUserId }) {
    const staffUser = await StaffUser.findOne({ _id: staffUserId, clinicId });
    if (!staffUser || staffUser.status !== STAFF_STATUS.INVITED) {
      const err = new Error('Pending staff member not found.');
      err.statusCode = 404;
      throw err;
    }

    // Revoke any previous active tokens
    await StaffInvitationToken.updateMany(
      { staffUserId: staffUser._id, usedAt: null, revokedAt: null },
      { revokedAt: new Date() }
    );

    // Issue fresh token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invitation = await StaffInvitationToken.create({
      clinicId,
      staffUserId: staffUser._id,
      tokenHash,
      role: staffUser.role,
      expiresAt,
    });

    await AuditLog.create({
      clinicId,
      actorId: ownerUser._id,
      actorRole: ownerUser.role,
      actorEmailOrPhone: ownerUser.email,
      action: 'STAFF_INVITATION_RESENT',
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
    });

    return {
      invitationId: invitation._id.toString(),
      invitationToken: rawToken,
      expiresAt,
    };
  },

  /**
   * Revoke Staff Invitation (Owner Only)
   */
  async revokeInvitation({ ownerUser, clinicId, staffUserId }) {
    const staffUser = await StaffUser.findOne({ _id: staffUserId, clinicId });
    if (!staffUser) {
      const err = new Error('Staff member not found.');
      err.statusCode = 404;
      throw err;
    }

    await StaffInvitationToken.updateMany(
      { staffUserId: staffUser._id, usedAt: null },
      { revokedAt: new Date() }
    );

    staffUser.status = STAFF_STATUS.DEACTIVATED;
    await staffUser.save();

    await AuditLog.create({
      clinicId,
      actorId: ownerUser._id,
      actorRole: ownerUser.role,
      actorEmailOrPhone: ownerUser.email,
      action: 'STAFF_INVITATION_REVOKED',
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
    });

    return { success: true };
  },

  /**
   * Deactivate/Reactivate Staff Member (Owner Only)
   */
  async toggleStaffStatus({ ownerUser, clinicId, staffUserId, newStatus }) {
    const staffUser = await StaffUser.findOne({ _id: staffUserId, clinicId });
    if (!staffUser) {
      const err = new Error('Staff member not found.');
      err.statusCode = 404;
      throw err;
    }

    if (staffUser.role === STAFF_ROLES.CLINIC_OWNER) {
      const err = new Error('Cannot deactivate the Clinic Owner account.');
      err.statusCode = 400;
      throw err;
    }

    staffUser.status = newStatus;
    await staffUser.save();

    if (newStatus === STAFF_STATUS.DEACTIVATED) {
      // Immediately revoke all active sessions
      await StaffSession.updateMany(
        { staffUserId: staffUser._id, revokedAt: null },
        { revokedAt: new Date() }
      );
    }

    await AuditLog.create({
      clinicId,
      actorId: ownerUser._id,
      actorRole: ownerUser.role,
      actorEmailOrPhone: ownerUser.email,
      action: `STAFF_STATUS_CHANGED_${newStatus}`,
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
    });

    return { staffUser };
  },

  /**
   * Request Password Reset Link
   */
  async requestPasswordReset(email) {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const staffUser = await StaffUser.findOne({ email: normalizedEmail, status: STAFF_STATUS.ACTIVE });

    // Always return success message to avoid account enumeration
    if (!staffUser) {
      return { success: true, message: 'If an active account exists, a password reset link has been dispatched.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await StaffPasswordResetToken.create({
      clinicId: staffUser.clinicId,
      staffUserId: staffUser._id,
      tokenHash,
      expiresAt,
    });

    return {
      success: true,
      resetToken: rawToken,
      expiresAt,
    };
  },

  /**
   * Apply Password Reset Link
   */
  async resetPassword({ token, newPassword }) {
    if (!token || !newPassword || newPassword.length < 8) {
      const err = new Error('New password must be at least 8 characters long.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = hashToken(token);
    const resetRecord = await StaffPasswordResetToken.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
      usedAt: null,
    });

    if (!resetRecord) {
      const err = new Error('Invalid or expired password reset token.');
      err.statusCode = 400;
      throw err;
    }

    const staffUser = await StaffUser.findById(resetRecord.staffUserId);
    if (!staffUser) {
      const err = new Error('Staff member not found.');
      err.statusCode = 404;
      throw err;
    }

    const saltRounds = 10;
    staffUser.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await staffUser.save();

    resetRecord.usedAt = new Date();
    await resetRecord.save();

    // Invalidate all existing sessions upon password change
    await StaffSession.updateMany(
      { staffUserId: staffUser._id, revokedAt: null },
      { revokedAt: new Date() }
    );

    await AuditLog.create({
      clinicId: staffUser.clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      actorEmailOrPhone: staffUser.email,
      action: 'STAFF_PASSWORD_RESET',
      entityType: 'StaffUser',
      entityId: staffUser._id.toString(),
    });

    return { success: true, message: 'Password has been successfully updated. Please log in.' };
  },
};

