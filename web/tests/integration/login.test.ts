import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../../src/views/Login.svelte';
import { DEMO_ACCOUNTS } from '../../src/lib/demoAccounts';
import { fail, ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores } from '../helpers/stores';

beforeEach(resetStores);
afterEach(() => vi.unstubAllGlobals());

const meAsParent = () =>
  ok({
    user: { id: 'u1', email: 'parent1@demo.test', name: 'Nadia', role: 'parent' },
    parent: { id: 'p1' },
    students: [{ id: 's1', name: 'Alya' }],
  });

describe('Login', () => {
  it('lists every seeded account, so the demo needs no README', () => {
    routeFetch({});

    const view = render(Login, {});

    const listed = view.all('.accounts__list li[data-email]');
    expect(listed).toHaveLength(DEMO_ACCOUNTS.length);
    for (const account of DEMO_ACCOUNTS) {
      expect(listed.join(' ')).toContain(account.email);
    }

    view.cleanup();
  });

  it('fills the form from a seeded account rather than signing in behind the user', () => {
    routeFetch({});

    const view = render(Login, {});
    view.click('.accounts__list li[data-email="parent1@demo.test"] .use-account');

    expect(view.find<HTMLInputElement>('input[name=email]').value).toBe('parent1@demo.test');
    expect(view.find<HTMLInputElement>('input[name=password]').value).toBeTruthy();
    // Nothing was submitted: the user still presses the button.
    expect(view.target.querySelector('.login__form button[type=submit]')).not.toBeNull();

    view.cleanup();
  });

  it('signs in and bootstraps the session in one step', async () => {
    const calls = routeFetch({
      'POST /auth/login': () => ok({ user: { id: 'u1', email: 'parent1@demo.test', name: 'Nadia', role: 'parent' } }, 'Logged in'),
      '/auth/me': meAsParent,
    });

    const view = render(Login, {});
    view.type('input[name=email]', 'parent1@demo.test');
    view.type('input[name=password]', 'password123');
    view.click('.login__form button[type=submit]');

    await vi.waitFor(() => expect(calls.some((call) => call.url === '/api/auth/me')).toBe(true));

    expect(calls[0].url).toBe('/api/auth/login');
    expect(calls[0].body).toEqual({ email: 'parent1@demo.test', password: 'password123' });

    view.cleanup();
  });

  it('reports the reason a sign-in was refused', async () => {
    routeFetch({ 'POST /auth/login': () => fail(401, 'INVALID_CREDENTIALS', 'Those details are not right') });

    const view = render(Login, {});
    view.type('input[name=email]', 'nobody@demo.test');
    view.type('input[name=password]', 'wrong-password');
    view.click('.login__form button[type=submit]');

    await vi.waitFor(() => expect(view.target.querySelector('.failure')).not.toBeNull());

    expect(view.find<HTMLElement>('.failure').dataset.code).toBe('INVALID_CREDENTIALS');
    expect(view.text('.failure-message')).toMatch(/email or password/i);

    view.cleanup();
  });

  it('offers registration, and says so when the email is taken', async () => {
    routeFetch({ 'POST /auth/register': () => fail(409, 'EMAIL_TAKEN', 'That email is already registered') });

    const view = render(Login, {});
    view.click('.switch-mode');
    view.type('input[name=name]', 'Nadia');
    view.type('input[name=email]', 'parent1@demo.test');
    view.type('input[name=password]', 'password123');
    view.click('.login__form button[type=submit]');

    await vi.waitFor(() => expect(view.target.querySelector('.failure')).not.toBeNull());

    expect(view.find<HTMLElement>('.failure').dataset.code).toBe('EMAIL_TAKEN');

    view.cleanup();
  });
});
