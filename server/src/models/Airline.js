import { Schema, model } from 'mongoose';
import { AIRLINE_REGIONS } from '@aerotrack/shared';

// Demonstration airline directory (seeded from shared/src/airlines.ts). Not a partnership claim.
const airlineSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    region: { type: String, enum: AIRLINE_REGIONS, required: true },
    hub: { type: String, required: true, uppercase: true, maxlength: 4 },
    description: { type: String, required: true, maxlength: 500 },
    officialSite: { type: String, required: true, maxlength: 200 },
    image: { type: String, required: true, maxlength: 60 },
    photoMatchesAirline: { type: Boolean, default: false },
    featuredFlightNumber: { type: String, maxlength: 10, default: null },
    active: { type: Boolean, default: true },
    isDemoDirectory: { type: Boolean, default: true },
  },
  { timestamps: true },
);
airlineSchema.index({ code: 1 }, { unique: true });
airlineSchema.index({ region: 1 });

export const Airline = model('Airline', airlineSchema);
