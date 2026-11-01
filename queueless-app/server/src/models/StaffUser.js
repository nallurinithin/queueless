import mongoose from 'mongoose';

export const STAFF_ROLES = {
  CLINIC_OWNER: 'CLINIC_OWNER',
  RECEPTIONIST: 'RECEPTIONIST',
  DOCTOR: 'DOCTOR',
};

export const STAFF_STATUS = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
};

const staffUserSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    passwordHash: {
      type: String,
      default: null, // Null while account is in INVITED status
    },
    role: {
      type: String,
      enum: Object.values(STAFF_ROLES),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(STAFF_STATUS),
      default: STAFF_STATUS.INVITED,
    },
    departmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

staffUserSchema.index({ clinicId: 1, email: 1 }, { unique: true });
staffUserSchema.index({ clinicId: 1, role: 1 });

export const StaffUser = mongoose.model('StaffUser', staffUserSchema);
