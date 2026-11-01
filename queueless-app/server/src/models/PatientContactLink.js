import mongoose from 'mongoose';

export const RELATIONSHIPS = {
  SELF: 'SELF',
  CHILD: 'CHILD',
  SPOUSE: 'SPOUSE',
  PARENT: 'PARENT',
  OTHER: 'OTHER',
};

const patientContactLinkSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    bookingContactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingContact',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    relationship: {
      type: String,
      enum: Object.values(RELATIONSHIPS),
      default: RELATIONSHIPS.SELF,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

patientContactLinkSchema.index({ clinicId: 1, bookingContactId: 1, patientId: 1 }, { unique: true });

export const PatientContactLink = mongoose.model('PatientContactLink', patientContactLinkSchema);

