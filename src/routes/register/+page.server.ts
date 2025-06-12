import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, '/'); // Redirect to homepage if already logged in
  }
  return {}; // Return empty object if not logged in, page will render
};
