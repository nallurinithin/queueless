import mongoose from 'mongoose';

export const GENDER = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
};

const patientSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    gender: {
      type: String,
      enum: Object.values(GENDER),
      required: true,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    age: {
      type: Number,
      min: 0,
      max: 130,
    },
    // Note: In strict compliance with specifications:
    // 1. Patient records persist across days/visits (never cleared daily).
    // 2. Mobile numbers are NOT unique keys on Patient.
    // 3. Zero diagnostic, clinical, prescription, or medical-history fields.
  },
  {
    timestamps: true,
  }
);

patientSchema.index({ clinicId: 1, fullName: 1 });

export const Patient = mongoose.model('Patient', patientSchema);

