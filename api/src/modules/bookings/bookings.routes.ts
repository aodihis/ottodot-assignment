import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Db } from '../../db';
import type { Env } from '../../app';
import {
  BookingStatus,
  CancelledReason,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../generated/prisma/enums';
import { ApiError, successBody } from '../../helpers/http';
import { errorResponse, IdParamSchema, jsonBody, successResponse } from '../../helpers/openapi';
import { CARD_BRANDS } from '../../helpers/payments';
import { requireParent } from '../auth/middleware';
import {
  bookingView,
  cancelBooking,
  createBooking,
  getBooking,
  latestPayment,
  listBookings,
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

const paymentSchema = z.object({
  id: z.string(),
  type: z.enum(PaymentType),
  status: z.enum(PaymentStatus),
  amount: z.number(),
  currency: z.string(),
  method: z.enum(PaymentMethod),
  card: z
    .object({
      brand: z.enum(CARD_BRANDS),
      last4: z.string(),
      holder: z.string().optional(),
    })
    .nullable(),
  reference: z.string(),
  failureReason: z.string().nullable(),
  createdAt: z.date(),
});

const bookingSchema = z.object({
  id: z.string(),
  status: z.enum(BookingStatus),
  parentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  expiresAt: z.date(),
  confirmedAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  cancelledReason: z.enum(CancelledReason).nullable(),
  canCancel: z.boolean(),
  cancellationDeadline: z.date().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      studentId: z.string(),
      name: z.string(),
      classId: z.string(),
      class: z.object({ id: z.string(), title: z.string(), startsAt: z.date() }),
      price: z.number(),
      refundedAt: z.date().nullable(),
      refundAmount: z.number().nullable(),
    }),
  ),
  payments: z.array(paymentSchema),
});

/** What a refused payment shows the parent: the booking, and the attempt that failed. */
function paymentContext(booking: BookingWithRelations) {
  const payment = latestPayment(booking);
  return { booking: bookingView(booking), payment: payment ? paymentView(payment) : null };
}

export function createBookingRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  // Parent-scoped. Scoped explicitly because this sub-app is mounted at /api,
  // where a bare '*' would gate every sibling route too. One registration is
  // enough: Hono's `/bookings/*` also matches the bare path, so adding an
  // exact-path line as well ran this twice per request.
  app.use('/bookings/*', requireParent(db));

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings',
      operationId: 'createBooking',
      tags: ['bookings'],
      summary: 'Select seats in a class',
      description:
        'Opens a booking with a hold timer. Nothing is charged and no seat is taken yet — payment decides. The hold lapses on its own, and `npm run sweep` retires lapsed selections.',
      request: { body: jsonBody(createSchema) },
      security: [{ session: [] }],
      responses: {
        201: successResponse({ booking: bookingSchema }, 'Booking created'),
        401: errorResponse('No valid session'),
        403: errorResponse('This account is not a parent'),
        404: errorResponse('No such class, or not one of your children'),
        409: errorResponse('That class has already started'),
        422: errorResponse('The request body failed validation'),
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const booking = await createBooking(db, c.get('parentId'), body);

      return c.json(successBody('Booking created', { booking: bookingView(booking) }), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings',
      operationId: 'listBookings',
      tags: ['bookings'],
      summary: 'List your bookings',
      description:
        'Every order this parent has placed, newest first. Lapsed holds are retired before the list is built, so an entry still shown as `pending_payment` is genuinely still payable.',
      security: [{ session: [] }],
      responses: {
        200: successResponse({ bookings: z.array(bookingSchema) }),
        401: errorResponse('No valid session'),
        403: errorResponse('This account is not a parent'),
      },
    }),
    async (c) => {
      const bookings = await listBookings(db, c.get('parentId'));

      return c.json(successBody('OK', { bookings: bookings.map(bookingView) }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings/{id}',
      operationId: 'getBooking',
      tags: ['bookings'],
      summary: 'Read a booking',
      request: { params: IdParamSchema },
      security: [{ session: [] }],
      responses: {
        200: successResponse({ booking: bookingSchema }),
        401: errorResponse('No valid session'),
        404: errorResponse('No such booking, or not yours'),
      },
    }),
    async (c) => {
      const booking = await getBooking(db, c.req.param('id'), c.get('parentId'));

      return c.json(successBody('OK', { booking: bookingView(booking) }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/pay',
      operationId: 'payBooking',
      tags: ['bookings'],
      summary: 'Pay for a booking',
      description:
        'Mock gateway. The charge is decided from the card number — 4242 4242 4242 4242 approves, 4000 0000 0000 0002 declines and 4000 0000 0000 9995 is short of funds — and it is decided *before* the seat is claimed, so losing the last seat never charges the card. Paying an already-confirmed booking is a no-op that returns the same booking.',
      request: {
        params: IdParamSchema,
        body: jsonBody(paySchema, 'The card to charge. Nothing but the last four digits is ever kept.'),
      },
      security: [{ session: [] }],
      responses: {
        200: successResponse({ booking: bookingSchema, payment: paymentSchema.nullable() }, 'Payment received'),
        401: errorResponse('No valid session'),
        402: errorResponse('The card was declined'),
        404: errorResponse('No such booking, or not yours'),
        409: errorResponse('The hold lapsed, the class started, a seat was taken, this child is already enrolled, or the booking can no longer be paid'),
        422: errorResponse('The request body failed validation'),
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
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
            200,
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
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/cancel',
      operationId: 'cancelBooking',
      tags: ['bookings'],
      summary: 'Cancel a booking',
      description:
        'Refunds a confirmed booking in full and releases the seats, up to the cancellation deadline. Cancelling is idempotent; a booking that was never paid is simply retired.',
      request: { params: IdParamSchema },
      security: [{ session: [] }],
      responses: {
        200: successResponse({ booking: bookingSchema, refund: paymentSchema.nullable() }, 'Booking cancelled'),
        401: errorResponse('No valid session'),
        404: errorResponse('No such booking, or not yours'),
        409: errorResponse('The cancellation window closed, the class started, or the booking cannot be cancelled'),
      },
    }),
    async (c) => {
      const result = await cancelBooking(db, c.req.param('id'), c.get('parentId'));

      switch (result.kind) {
        case 'cancelled': {
          const refund = refundOf(result.booking);
          return c.json(
            successBody('Booking cancelled', {
              booking: bookingView(result.booking),
              refund: refund ? paymentView(refund) : null,
            }),
            200,
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
    },
  );

  return app;
}
