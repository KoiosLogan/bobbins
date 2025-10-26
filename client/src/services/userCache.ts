import type { User } from '../types';

type Listener = (user: User | null) => void;

let cachedUser: User | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => {
    listener(cachedUser);
  });
};

export const userCache = {
  getCurrentUser(): User | null {
    return cachedUser;
  },
  setCurrentUser(user: User | null) {
    cachedUser = user;
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(cachedUser);
    return () => {
      listeners.delete(listener);
    };
  },
  clear() {
    cachedUser = null;
    notify();
  },
};
