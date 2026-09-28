import { randomUUID } from 'node:crypto';
import { createPrisma } from '../src/db';
import type { BookingStatus, CancelledReason, Prisma } from '../src/generated/prisma/client';
import { holdExpiry } from '../src/helpers/bookings';
import { moneyJson, sumMoney } from '../src/helpers/money';
import { hashPassword } from '../src/helpers/password';
import { wipeAll } from '../src/helpers/reset';
import { registerChildren, seatsAvailable } from '../src/helpers/seats';

const prisma = createPrisma();

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);
const SEED_PASSWORD = 'password123';
const CURRENCY = 'SGD';

const PEOPLE = [
  { email: 'admin@demo.test', name: 'Ms. Tan', role: 'admin' as const, children: [] as string[] },
  { email: 'parent1@demo.test', name: 'Nadia', role: 'parent' as const, children: ['Alya', 'Bima'] },
  { email: 'parent2@demo.test', name: 'Rizky', role: 'parent' as const, children: ['Citra'] },
  { email: 'parent3@demo.test', name: 'Sari', role: 'parent' as const, children: ['Dewi', 'Eka'] },
];

async function main() {
  await wipeAll(prisma);

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const parentIds = new Map<string, string>();

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: person.email,
        name: person.name,
        role: person.role,
        passwordHash,
        ...(person.role === 'admin'
          ? {}
          : { parent: { create: { students: { create: person.children.map((name) => ({ name })) } } } }),
      },
      include: { parent: true },
    });

    if (user.parent) parentIds.set(person.email, user.parent.id);
  }

  const childIds = new Map<string, string>();
  for (const person of PEOPLE) {
    for (const name of person.children) {
      const student = await prisma.student.findFirstOrThrow({ where: { name } });
      childIds.set(name, student.id);
    }
  }

  // Resolved by name, so a typo below fails loudly instead of at `undefined`.
  const child = (name: string) => {
    const id = childIds.get(name);
    if (!id) throw new Error(`seed: no child named "${name}"`);
    return id;
  };
  const parent = (email: string) => {
    const id = parentIds.get(email);
    if (!id) throw new Error(`seed: no parent account for "${email}"`);
    return id;
  };

  // Relative dates keep the demo meaningful whenever it is run.
  const plants = await prisma.trialClass.create({
    data: {
      title: 'Plants and How They Grow',
      description: 'Seeds, sunlight and roots — how a tiny seed becomes a plant.',
      subject: 'science',
      startsAt: inDays(7),
      price: 50,
    },
  });
  const fractions = await prisma.trialClass.create({
    data: {
      title: 'Fractions Made Easy',
      description: 'Halves, thirds and quarters with pizza, chocolate and number lines.',
      subject: 'math',
      startsAt: inDays(9),
      price: 50,
    },
  });
  const machines = await prisma.trialClass.create({
    data: {
      title: 'Simple Machines',
      description: 'Levers, pulleys and ramps: how small forces move big things.',
      subject: 'science',
      startsAt: inDays(10),
      price: 60,
    },
  });
  const shapes = await prisma.trialClass.create({
    data: {
      title: 'Shapes Around Us',
      description: 'Triangles, circles and squares hiding in everyday objects.',
      subject: 'math',
      startsAt: inDays(2),
      price: 50,
    },
  });
  const weather = await prisma.trialClass.create({
    data: { title: 'Weather and Seasons', subject: 'science', startsAt: inDays(12), price: 50 },
  });

  /** Books children into a class, keeping the seat counter in step with the rows. */
  const book = async (input: {
    parent: string;
    children: string[];
    cls: { id: string; capacity: number; price: Prisma.Decimal };
    status: BookingStatus;
    cancelledReason?: CancelledReason;
  }) => {
    const now = new Date();
    const amount = sumMoney(input.children.map(() => input.cls.price));
    const paid = input.status === 'confirmed';

    const booking = await prisma.booking.create({
      data: {
        parentId: input.parent,
        status: input.status,
        amount,
        currency: CURRENCY,
        expiresAt: holdExpiry(now),
        cancelledReason: input.cancelledReason ?? null,
        confirmedAt: paid ? now : null,
        cancelledAt: input.status === 'cancelled' ? now : null,
        items: {
          create: input.children.map((name) => ({
            studentId: child(name),
            classId: input.cls.id,
            price: input.cls.price,
          })),
        },
        // A selection waiting for payment has no payment row yet — that is the point.
        ...(input.status === 'pending_payment'
          ? {}
          : {
              payments: {
                create: {
                  type: 'charge' as const,
                  status: paid ? ('succeeded' as const) : ('failed' as const),
                  amount,
                  currency: CURRENCY,
                  card: JSON.stringify({
                    brand: 'visa',
                    last4: paid ? '4242' : '0002',
                    holder: 'Demo Parent',
                  }),
                  reference: `seed_${randomUUID()}`,
                  failureReason: paid
                    ? null
                    : input.cancelledReason === 'seat_taken'
                      ? 'seat_taken'
                      : 'card_declined',
                },
              },
            }),
      },
      include: { items: true },
    });

    if (paid) {
      // A paid booking registers the children: one enrollment per line, plus the
      // counter the capacity guard reads. The two move together, here and on the
      // payment path, because they must agree.
      await registerChildren(prisma, {
        classId: input.cls.id,
        capacity: input.cls.capacity,
        now,
        items: booking.items,
      });
    }
  };

  // Fractions: three confirmed, so exactly one seat is left — the last-seat case.
  await book({ parent: parent('parent1@demo.test'), children: ['Alya'], cls: fractions, status: 'confirmed' });
  await book({ parent: parent('parent2@demo.test'), children: ['Citra'], cls: fractions, status: 'confirmed' });
  await book({ parent: parent('parent3@demo.test'), children: ['Dewi'], cls: fractions, status: 'confirmed' });

  // Simple Machines: full, and one order covers two children.
  await book({ parent: parent('parent1@demo.test'), children: ['Bima'], cls: machines, status: 'confirmed' });
  await book({ parent: parent('parent2@demo.test'), children: ['Citra'], cls: machines, status: 'confirmed' });
  await book({ parent: parent('parent3@demo.test'), children: ['Dewi', 'Eka'], cls: machines, status: 'confirmed' });

  // Shapes starts inside the cancellation cutoff: cancelling it must be refused.
  await book({ parent: parent('parent1@demo.test'), children: ['Alya'], cls: shapes, status: 'confirmed' });

  // A live selection, timer running — what `npm run sweep` exists for.
  await book({ parent: parent('parent1@demo.test'), children: ['Bima'], cls: plants, status: 'pending_payment' });

  // History: a declined card, and a selection that lost the last seat.
  await book({ parent: parent('parent1@demo.test'), children: ['Bima'], cls: weather, status: 'payment_failed' });
  await book({
    parent: parent('parent3@demo.test'),
    children: ['Eka'],
    cls: fractions,
    status: 'cancelled',
    cancelledReason: 'seat_taken',
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
    const seats = seatsAvailable(cls);
    console.log(
      `  ${cls.title.padEnd(28)} $${moneyJson(cls.price).toFixed(2)}  starts in ` +
        `${Math.round((cls.startsAt.getTime() - Date.now()) / DAY)}d  ` +
        `${cls.confirmedCount}/${cls.capacity} booked, ${seats} seat(s) left`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
