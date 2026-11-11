import { cookies } from 'next/headers';
import { COOKIE, verifySession } from './auth';

// Dipanggil di setiap route handler sebagai lapisan kedua di luar middleware.
export async function isAuthed(): Promise<boolean> {
  return verifySession(cookies().get(COOKIE)?.value);
}
