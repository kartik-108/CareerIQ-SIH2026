export function googleRedirectUrl(location) {
  return `${location.origin}/pages/dashboard.html`;
}

export async function initiateGoogleOAuth(supabase, location) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: googleRedirectUrl(location) },
  });
  if (error) throw error;
  return data;
}
