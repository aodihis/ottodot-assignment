import { Hono } from 'hono';
import type { Db } from '../../db';
import { z } from 'zod';
import type { Env } from '../../app';
import { ApiError, successBody } from '../../helpers/http';
import { requireParent } from '../auth/middleware';
import {
  bookingView,
  cancelBooking,
  createBooking,
  getBooking,
  latestPayment,
  payBooking,
  paymentView,
  refundOf,
  settledCharge,
  type BookingWithRelations,
} from './bookings.service';

const createSchema = z.object({
  classId: z.string().trim().min(1),
  studentIds: z
    .array(z.string().trim().min(1))
    .min(1, 'Pick at least one child')
    .refine((ids) => new Set(ids).size === ids.length, 'Each child can appear only once'),
});

const paySchema = z.object({
  card: z.object({
    number: z.string().trim().min(12).max(25),
    holder: z.string().trim().min(1).optional(),
  }),
});

/** What a refused payment shows the parent: the booking, and the attempt that failed. */
function paymentContext(booking: BookingWithRelations) {
  const payment = latestPayment(booking);
  return { booking: bookingView(booking), payment: payment ? paymentView(payment) : null };
}

export function createBookingRoutes(db: Db) {
  const app = new Hono<Env>();

  // Parent-scoped. Scoped explicitly because this sub-app is mounted at /api,
  // where a bare '*' would gate every sibling route too. One registration is
  // enough: Hono's `/bookings/*` also matches the bare path, so adding an
  // exact-path line as well ran this twice per request.
  app.use('/bookings/*', requireParent(db));

  app.post('/bookings', async (c) => {
    const body = createSchema.parse(await c.req.json());
    const booking = await createBooking(db, c.get('parentId'), body);

    return c.json(successBody('Booking created', { booking: bookingView(booking) }), 201);
  });

  app.get('/bookings/:id', async (c) => {
    const booking = await getBooking(db, c.req.param('id'), c.get('parentId'));

    return c.json(successBody('OK', { booking: bookingView(booking) }));
  });

  app.post('/bookings/:id/pay', async (c) => {
    const body = paySchema.parse(await c.req.json());
    const result = await payBooking(db, c.req.param('id'), c.get('parentId'), body.card);

    switch (result.kind) {
      case 'confirmed':
      case 'already_confirmed': {
        const charge = settledCharge(result.booking);
        return c.json(
          successBody(result.kind === 'confirmed' ? 'Payment received' : 'This booking is already paid', {
            booking: bookingView(result.booking),
            payment: charge ? paymentView(charge) : null,
          }),
        );
      }
      case 'declined':
        throw new ApiError(402, 'CARD_DECLINED', 'The card was declined', {
          reason: result.reason,
          ...paymentContext(result.booking),
        });
      case 'seat_taken':
        throw new ApiError(409, 'SEAT_TAKEN', 'Those seats were taken while you were paying', {
          requested: result.requested,
          seatsAvailable: result.seatsAvailable,
          ...paymentContext(result.booking),
        });
      case 'duplicate':
        throw new ApiError(
          409,
          'DUPLICATE_BOOKING',
          'That child already has a confirmed seat in this class',
          paymentContext(result.booking),
        );
      case 'expired':
        throw new ApiError(409, 'BOOKING_EXPIRED', 'Your hold lapsed — pick the class again', {
          booking: bookingView(result.booking),
        });
      case 'not_payable':
        throw new ApiError(409, 'BOOKING_NOT_PAYABLE', 'This booking can no longer be paid', {
          booking: bookingView(result.booking),
        });
      case 'class_started':
        throw new ApiError(409, 'CLASS_ALREADY_STARTED', 'That class has already started', {
          booking: bookingView(result.booking),
        });
    }
  });

  app.post('/bookings/:id/cancel', async (c) => {
    const result = await cancelBooking(db, c.req.param('id'), c.get('parentId'));

    switch (result.kind) {
      case 'cancelled': {
        const refund = refundOf(result.booking);
        return c.json(
          successBody('Booking cancelled', {
            booking: bookingView(result.booking),
            refund: refund ? paymentView(refund) : null,
          }),
        );
      }
      case 'window_closed':
        throw new ApiError(409, 'CANCELLATION_WINDOW_CLOSED', 'The cancellation window has closed', {
          booking: bookingView(result.booking),
        });
      case 'not_cancellable':
        throw new ApiError(409, 'BOOKING_NOT_CANCELLABLE', 'This booking cannot be cancelled', {
          booking: bookingView(result.booking),
        });
      case 'class_started':
        throw new ApiError(409, 'CLASS_ALREADY_STARTED', 'That class has already started', {
          booking: bookingView(result.booking),
        });
    }
  });

  return app;
}
