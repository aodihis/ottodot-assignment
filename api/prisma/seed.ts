import { createPrisma } from '../src/db';
import { holdExpiry } from '../src/helpers/bookings';
import { hashPassword } from '../src/helpers/password';
import { wipeAll } from '../src/helpers/reset';

const prisma = createPrisma();

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);
const SEED_PASSWORD = 'password123';

const PEOPLE = [
  { email: 'admin@demo.test', name: 'Ms. Tan', role: 'admin' as const, children: [] as string[] },
  { email: 'parent1@demo.test', name: 'Nadia', role: 'parent' as const, children: ['Alya', 'Bima'] },
  { email: 'parent2@demo.test', name: 'Rizky', role: 'parent' as const, children: ['Citra'] },
  { email: 'parent3@demo.test', name: 'Sari', role: 'parent' as const, children: ['Dewi', 'Eka'] },
];

/** Creates the accounts and returns a lookup that throws on a misspelled child. */
async function seedPeople() {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  for (const person of PEOPLE) {
    await prisma.user.create({
      data: {
        email: person.email,
        name: person.name,
        role: person.role,
        passwordHash,
        ...(person.role === 'admin'
          ? {}
          : {
              parent: {
                create: { students: { create: person.children.map((name) => ({ name })) } },
              },
            }),
      },
    });
  }

  const byName = new Map<string, string>();
  for (const person of PEOPLE) {
    for (const name of person.children) {
      const student = await prisma.student.findFirstOrThrow({ where: { name } });
      byName.set(name, student.id);
    }
  }

  return (name: string) => {
    const id = byName.get(name);
    if (!id) throw new Error(`seed: no child named "${name}"`);
    return id;
  };
}

async function confirmedBooking(input: {
  studentId: string;
  classId: string;
  priceCents: number;
  confirmedAt: Date;
}) {
  await prisma.booking.create({
    data: {
      studentId: input.studentId,
      classId: input.classId,
      status: 'confirmed',
      expiresAt: holdExpiry(input.confirmedAt),
      priceCents: input.priceCents,
      confirmedAt: input.confirmedAt,
      attempts: { create: { outcome: 'success', amountCents: input.priceCents } },
    },
  });

  await prisma.trialClass.update({
    where: { id: input.classId },
    data: { confirmedCount: { increment: 1 } },
  });
}

async function main() {
  await wipeAll(prisma);
  const child = await seedPeople();

  // Relative dates keep the demo meaningful whenever it is run.
  const plants = await prisma.trialClass.create({
    data: { title: 'Plants and How They Grow', subject: 'science', startsAt: inDays(7), priceCents: 5000 },
  });
  const fractions = await prisma.trialClass.create({
    data: { title: 'Fractions Made Easy', subject: 'math', startsAt: inDays(9), priceCents: 5000 },
  });
  const machines = await prisma.trialClass.create({
    data: { title: 'Simple Machines', subject: 'science', startsAt: inDays(10), priceCents: 6000 },
  });
  const shapes = await prisma.trialClass.create({
    data: { title: 'Shapes Around Us', subject: 'math', startsAt: inDays(2), priceCents: 5000 },
  });
  const weather = await prisma.trialClass.create({
    data: { title: 'Weather and Seasons', subject: 'science', startsAt: inDays(12), priceCents: 5000 },
  });

  const now = new Date();
  const confirm = (student: string, cls: { id: string; priceCents: number }) =>
    confirmedBooking({
      studentId: child(student),
      classId: cls.id,
      priceCents: cls.priceCents,
      confirmedAt: now,
    });

  // Fractions: three confirmed, so exactly one seat is left — the last-seat case.
  await confirm('Alya', fractions);
  await confirm('Citra', fractions);
  await confirm('Dewi', fractions);

  // Simple Machines: full.
  await confirm('Bima', machines);
  await confirm('Citra', machines);
  await confirm('Dewi', machines);
  await confirm('Eka', machines);

  // Shapes starts inside the cancellation cutoff: cancelling it must be refused.
  await confirm('Alya', shapes);

  // History: a payment that failed, and a hold that lost the last seat.
  await prisma.booking.create({
    data: {
      studentId: child('Bima'),
      classId: weather.id,
      status: 'payment_failed',
      expiresAt: holdExpiry(now),
      priceCents: weather.priceCents,
      attempts: {
        create: { outcome: 'failure', reason: 'card_declined', amountCents: weather.priceCents },
      },
    },
  });

  await prisma.booking.create({
    data: {
      studentId: child('Eka'),
      classId: fractions.id,
      status: 'cancelled',
      cancelledReason: 'seat_taken',
      expiresAt: holdExpiry(now),
      priceCents: fractions.priceCents,
      attempts: {
        create: { outcome: 'failure', reason: 'seat_taken', amountCents: fractions.priceCents },
      },
    },
  });

  console.log('Seeded demo data.\n');
  console.log('Accounts (all use the password below):');
  for (const person of PEOPLE) {
    const children = person.children.length ? `  (children: ${person.children.join(', ')})` : '';
    console.log(`  ${person.email.padEnd(20)}${person.name}${children}`);
  }
  console.log(`  password: ${SEED_PASSWORD}\n`);
  console.log('Classes (seats are relative to now, so the demo never goes stale):');
  for (const cls of await prisma.trialClass.findMany({ orderBy: { startsAt: 'asc' } })) {
    const seats = cls.capacity - cls.confirmedCount;
    console.log(
      `  ${cls.title.padEnd(28)} starts in ${Math.round((cls.startsAt.getTime() - Date.now()) / DAY)}d  ` +
        `${cls.confirmedCount}/${cls.capacity} confirmed, ${seats} seat(s) left`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
