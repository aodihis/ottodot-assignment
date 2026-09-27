import { prepareTestDatabase } from './testDatabase';

/** Runs once per test run, before any worker starts. */
export default function setup() {
  const url = prepareTestDatabase();
  console.log(`\n[test db] ${url.replace(/\?.*$/, '')}\n`);
}
