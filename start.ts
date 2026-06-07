import { initDatabase } from './src/storage/database/init';

async function start() {
  await initDatabase();
  console.log('数据库初始化完成');
}

start().catch(console.error);
