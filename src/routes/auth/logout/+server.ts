import { json } from '@sveltejs/kit';
import { devSessionStore } from '$lib/devAuthStore';
import type { RequestHandler } from './$types';

const SESSION_COOKIE_NAME = 'sessionid';

export const POST: RequestHandler = async ({ cookies }) => {
  const sessionId = cookies.get(SESSION_COOKIE_NAME);

  if (sessionId) {
    devSessionStore.deleteSession(sessionId);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  }

  return json({ success: true, message: 'Logged out successfully.' });
};

// Optional: GET handler if you want to allow logout via GET link, though POST is safer.
export const GET: RequestHandler = async ({ cookies }) => {
  const sessionId = cookies.get(SESSION_COOKIE_NAME);

  if (sessionId) {
    devSessionStore.deleteSession(sessionId);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  }
  // Redirect to home page or login page after logout
  // This is a common pattern for GET logout.
  // For POST, client typically handles navigation.
  return new Response(null, {
    status: 302,
    headers: {
        'Location': '/' // Redirect to homepage
    }
});
};
