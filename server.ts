import { initDatabase } from './src/storage/database/init';

async function main() {
  await initDatabase();
  console.log('数据库初始化完成');
}

main().catch(console.error);
