import { Schema, model } from 'mongoose';
import { ROLES } from '@aerotrack/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'passenger', index: true },
    emailVerified: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      browserNotifications: { type: Boolean, default: false },
    },
    tutorialCompleted: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });

export const User = model('User', userSchema);
