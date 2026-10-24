import mongoose from 'mongoose';
import { bootstrap } from '../bootstrap.js';
import { Session, User } from '../models/index.js';
import { ROLES } from '@aerotrack/shared';

/**
 * Promote an existing, verified account. Run locally by someone with database
 * access: npm run set-role -w server -- someone@example.com admin
 */
const [email, role] = process.argv.slice(2);
if (!email || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -w server -- <email> <${ROLES.join('|')}>`);
  process.exit(1);
}
await bootstrap();
const user = await User.findOne({ email: email.toLowerCase(), isDemo: false });
if (!user) {
  console.error('No such account. Register it in the app first.');
} else if (!user.emailVerified) {
  console.error('Verify the account email first.');
} else {
  user.role = role;
  await user.save();
  await Session.deleteMany({ user: user._id });
  console.log(`Role set to ${role}. The user must sign in again.`);
}
await mongoose.disconnect();
