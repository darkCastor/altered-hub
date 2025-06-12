import { devUserStore, devSessionStore } from '$lib/devAuthStore';
import type { Handle } from '@sveltejs/kit';

const SESSION_COOKIE_NAME = 'sessionid';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(SESSION_COOKIE_NAME);
  event.locals.user = null; // Initialize user as null

  if (sessionId) {
    const session = devSessionStore.getSession(sessionId);
    if (session) {
      const user = devUserStore.getUserById(session.userId);
      if (user) {
        event.locals.user = {
          id: user.id,
          username: user.username,
        };
      } else {
        // User associated with session not found, clear cookie
        devSessionStore.deleteSession(sessionId);
        event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      }
    } else {
      // Session not found or expired, clear cookie if it exists
      event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    }
  }

  const response = await resolve(event);
  return response;
};
