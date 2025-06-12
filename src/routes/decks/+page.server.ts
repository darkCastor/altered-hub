import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login'); // Redirect to login if not authenticated
  }

  // If user is authenticated, proceed to load data for the page or return empty
  // For now, just returning an empty object as an example.
  // Replace with actual data loading logic for the decks page if needed.
  return {
    // You could pass the user object again if needed by the page directly,
    // though it's also available via $page.data.user from the layout load.
    // user: locals.user
  };
};
