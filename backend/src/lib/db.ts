import mongoose, { Schema } from 'mongoose';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active';

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
};

const schemaOpts = { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: false } } as const;

// ── User ────────────────────────────────────────────────────────────────────
const UserSchema = new Schema(
  {
    email:        { type: String, required: true, unique: true },
    name:         { type: String, required: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, enum: ['admin', 'user'], default: 'user' },
    status:       { type: String, enum: ['pending', 'active'], default: 'pending' },
  },
  schemaOpts
);

// ── Location ────────────────────────────────────────────────────────────────
const LocationSchema = new Schema(
  { name: { type: String, required: true, unique: true } },
  schemaOpts
);

// ── WorkEntry ───────────────────────────────────────────────────────────────
const WorkEntrySchema = new Schema(
  {
    user_id:     { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    location_id: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    date:        { type: String, required: true },
    hours:       { type: Number, required: true },
    start_time:  { type: String, default: null },
    end_time:    { type: String, default: null },
    notes:       { type: String, default: '' },
  },
  schemaOpts
);
WorkEntrySchema.index({ user_id: 1, location_id: 1, date: 1 });

// ── Notification ─────────────────────────────────────────────────────────────
const NotificationSchema = new Schema(
  {
    type:              { type: String, enum: ['new_registration', 'hours_added'], required: true },
    read:              { type: Boolean, default: false },
    trigger_user_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    trigger_user_name: { type: String, required: true },
    meta:              { type: Schema.Types.Mixed, default: {} },
  },
  schemaOpts
);

export const User         = mongoose.models['User']         ?? mongoose.model('User',         UserSchema);
export const Location     = mongoose.models['Location']     ?? mongoose.model('Location',     LocationSchema);
export const WorkEntry    = mongoose.models['WorkEntry']    ?? mongoose.model('WorkEntry',    WorkEntrySchema);
export const Notification = mongoose.models['Notification'] ?? mongoose.model('Notification', NotificationSchema);

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI non impostato nel .env');
  await mongoose.connect(uri);

  // Rimuove il vecchio indice unique su work_entries se ancora presente
  try {
    await mongoose.connection.collection('workentries').dropIndex('user_id_1_location_id_1_date_1');
    console.log('Indice unique work_entries rimosso');
  } catch {
    // indice già assente — ok
  }

  console.log('MongoDB connesso');
}
