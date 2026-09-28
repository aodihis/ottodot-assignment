/**
 * The accounts `npm run seed` creates, shown on the login screen so the demo can
 * be walked without reading the seed file. They are ordinary accounts — and they
 * are unregisterable, because registering one answers `EMAIL_TAKEN`.
 */
export const DEMO_PASSWORD = 'password123';

export const DEMO_ACCOUNTS = [
  { email: 'parent1@demo.test', name: 'Nadia', role: 'parent', note: 'two children' },
  { email: 'parent2@demo.test', name: 'Rizky', role: 'parent', note: 'one child' },
  { email: 'parent3@demo.test', name: 'Sari', role: 'parent', note: 'two children' },
  { email: 'admin@demo.test', name: 'Ms. Tan', role: 'admin', note: 'sees the rosters' },
] as const;

/** The cards the mock gateway recognises. The outcome is the server's to decide. */
export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', outcome: 'approves' },
  { number: '4000 0000 0000 0002', outcome: 'declined' },
  { number: '4000 0000 0000 9995', outcome: 'insufficient funds' },
] as const;
