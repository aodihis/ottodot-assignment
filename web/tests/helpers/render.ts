import { flushSync, mount, unmount, type Component } from 'svelte';

/**
 * The whole component-test harness.
 *
 * Svelte 5's own `mount`/`unmount`/`flushSync` are the official API for this, so
 * there is no testing library here — `@testing-library/svelte` would pull in three
 * packages to wrap the same calls, and `vitest-browser-svelte` would need a real
 * browser. Events are plain DOM listeners in Svelte 5, so `click()` and a bubbling
 * `input` event drive `onclick` and `bind:value` exactly as a browser would.
 *
 * Async work that a stub resolves is awaited with `await vi.waitFor(...)`, never
 * `await flushSync()` — the latter is synchronous and awaits nothing.
 */
export function render<P extends Record<string, unknown>>(component: Component<P>, props: P) {
  const target = document.createElement('div');
  document.body.append(target);
  const instance = mount(component, { target, props });
  flushSync();

  const find = <T extends Element>(selector: string): T => {
    const element = target.querySelector<T>(selector);
    if (!element) throw new Error(`no element matching ${selector}`);
    return element;
  };

  return {
    target,
    find,
    cleanup() {
      unmount(instance);
      target.remove();
    },
    click(selector: string) {
      const element = find<HTMLElement>(selector);
      element.click();
      flushSync();
      return element;
    },
    /** Types into an input the way a browser does, so `bind:value` sees it. */
    type(selector: string, value: string) {
      const input = find<HTMLInputElement>(selector);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      return input;
    },
    text(selector: string): string {
      return target.querySelector(selector)?.textContent?.trim() ?? '';
    },
    all(selector: string): string[] {
      return [...target.querySelectorAll(selector)].map(
        (element) => element.textContent?.trim() ?? '',
      );
    },
  };
}
