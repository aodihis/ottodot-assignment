import * as api from './api';
import type { Child, User } from './types';

/**
 * Who is signed in, and their children.
 *
 * `/auth/me` answers with the user, the parent and the children in one call, so
 * bootstrapping the app is one request — and after signing in there is nothing
 * else to fetch before the class list makes sense.
 */
class Session {
  user = $state<User | null>(null);
  parentId = $state<string | null>(null);
  children = $state<Child[]>([]);
  /** False until the bootstrap call has settled, so the first paint is not the login form. */
  ready = $state(false);

  async load() {
    try {
      const me = await api.whoAmI();
      this.user = me.user;
      this.parentId = me.parent?.id ?? null;
      this.children = me.students;
    } catch {
      // A 401 here is the ordinary "not signed in" answer, not a failure worth
      // reporting; anything else means we cannot know who this is either.
      this.clear();
    } finally {
      this.ready = true;
    }
  }

  /** Re-reads the children from the server, so soft-deletes and adds are never inferred. */
  async refreshChildren() {
    this.children = (await api.listChildren()).students;
  }

  async addChild(name: string) {
    await api.addChild(name);
    await this.refreshChildren();
  }

  /**
   * Removing is a soft delete server-side, and it is refused (`STUDENT_HAS_ACTIVE_BOOKING`)
   * while the child still has a seat or a live selection — so the list is re-read
   * rather than edited locally either way.
   */
  async removeChild(id: string) {
    await api.removeChild(id);
    await this.refreshChildren();
  }

  async signIn(email: string, password: string) {
    await api.login(email, password);
    await this.load();
  }

  async signUp(email: string, password: string, name: string) {
    await api.register(email, password, name);
    await this.load();
  }

  async signOut() {
    await api.logout();
    this.clear();
  }

  clear() {
    this.user = null;
    this.parentId = null;
    this.children = [];
  }
}

export const session = new Session();
