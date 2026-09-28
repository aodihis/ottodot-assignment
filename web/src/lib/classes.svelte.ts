import * as api from './api';
import type { ClassView } from './types';

/**
 * The class list. Everything a screen needs to decide what to offer — seats
 * left, live selections, the cancellation deadline — is computed by the server
 * and only rendered here.
 */
class Classes {
  list = $state<ClassView[]>([]);

  async load() {
    this.list = (await api.listClasses()).classes;
  }

  byId(id: string): ClassView | null {
    return this.list.find((entry) => entry.id === id) ?? null;
  }
}

export const classes = new Classes();
