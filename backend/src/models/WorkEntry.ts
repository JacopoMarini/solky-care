import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkEntry extends Document {
  userId: Types.ObjectId;
  locationId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  hours: number;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  notes?: string;
}

const WorkEntrySchema = new Schema<IWorkEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hours: { type: Number, required: true, min: 0, max: 24 },
    startTime: { type: String, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, match: /^\d{2}:\d{2}$/ },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

WorkEntrySchema.index({ userId: 1, locationId: 1, date: 1 }, { unique: true });

export const WorkEntry = mongoose.model<IWorkEntry>('WorkEntry', WorkEntrySchema);
