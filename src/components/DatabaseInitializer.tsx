import { initDatabase } from '@/storage/database/init';

export default async function DatabaseInitializer() {
  await initDatabase();
  return null;
}