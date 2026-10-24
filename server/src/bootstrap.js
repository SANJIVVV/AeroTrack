import { loadEnv } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createEmailSender } from './integrations/email/index.js';
import { loadDelayModel } from './services/prediction.js';

export async function bootstrap() {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  return {
    env,
    email: createEmailSender(env),
    delayModel: await loadDelayModel(env.DELAY_MODEL_PATH),
    now: () => new Date(),
  };
}
