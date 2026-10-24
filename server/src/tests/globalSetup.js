/**
 * Integration tests need a MongoDB-compatible server.
 *  - If TEST_MONGODB_URI is set, it is used (e.g. a local mongod or Docker).
 *  - Otherwise mongodb-memory-server downloads and starts a temporary mongod.
 * Never point TEST_MONGODB_URI at Atlas production data: tests drop their databases.
 */
let stop;

export async function setup(project) {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server-core');
    const server = await MongoMemoryServer.create();
    uri = server.getUri();
    stop = async () => {
      await server.stop();
    };
  }
  project.provide('mongoUri', uri);
}

export async function teardown() {
  await stop?.();
}
