import mongoose, { Schema, Document, Types } from 'mongoose';

export type NotificationType = 'new_registration' | 'hours_added';

export interface INotification extends Document {
  type: NotificationType;
  read: boolean;
  // Chi ha generato l'evento
  triggerUserId: Types.ObjectId;
  triggerUserName: string;
  // Payload opzionale (data, location, ore)
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    type: { type: String, enum: ['new_registration', 'hours_added'], required: true },
    read: { type: Boolean, default: false },
    triggerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    triggerUserName: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
