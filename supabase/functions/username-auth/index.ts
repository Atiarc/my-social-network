// Supabase Edge Function: username-auth
// Actions: register, resolve-login
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase server environment variables.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeUsername(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function validUsername(value: string): boolean {
  return /^[a-z0-9_]{3,25}$/.test(value);
}

// Reserved, non-deliverable internal identifier used only by Supabase Auth.
// Never use a real user's email address as a username alias.
function authAlias(username: string): string {
  return username + "@users.invalid";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const username = normalizeUsername(body?.username);

    if (!validUsername(username)) {
      return json({ error: "Username must be 3–25 characters: a-z, 0-9, underscore." }, 400);
    }

    if (action === "resolve-login") {
      // No account lookup and no personal information is returned.
      // Supabase Auth verifies the supplied password in the browser client.
      return json({ email: authAlias(username) });
    }

    if (action !== "register") {
      return json({ error: "Unknown action." }, 400);
    }

    const displayName = String(body?.display_name ?? "").trim().slice(0, 60);
    const password = String(body?.password ?? "");

    if (!displayName) return json({ error: "Name is required." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    // Auth alias uniqueness prevents duplicate username registrations.
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: authAlias(username),
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName }
    });

    if (authError || !created.user) {
      // Generic response avoids confirming whether a username is already registered.
      return json({ error: "Registration could not be completed. Choose another username or try again." }, 409);
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      display_name: displayName,
      bio: ""
    });

    if (profileError) {
      // Roll back Auth user if profile creation fails (including a username collision
      // with an existing email-based member's profile).
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Could not create the profile. The username may already be in use." }, 409);
    }

    return json({ ok: true, message: "Account created. Log in with your username and password." });
  } catch (_error) {
    return json({ error: "Invalid request." }, 400);
  }
});
