import { AuthorizationError, CimdFetchError, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { PASSWORD_ERRORS, checkPassword, clientIp } from "./auth";

declare global {
  interface Env {
    /** Injected by OAuthProvider for the default handler. */
    OAUTH_PROVIDER: OAuthHelpers;
  }
}

/** What the consent page shows about the app asking for access. All of it is escaped on output. */
interface PageDetails {
  clientName: string;
  clientDomain: string;
  redirectHost: string;
  loopback: boolean;
}

// Client names and domains are chosen by whoever registers the client, so never emit them raw.
const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(body: string, headers = new Headers(), status = 200): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  // No form-action here: browsers apply it to the redirect that follows the form post, and
  // approving redirects to the connecting app's own address, so it would block "Allow".
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  return new Response(
    `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to My Recipes</title>
<style>
  body { font-family: system-ui, sans-serif; background: #faf6f1; color: #2b2118; margin: 0; }
  main { max-width: 380px; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 1.4rem; }
  label { display: block; font-weight: 600; margin: 20px 0 6px; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: 12px; font-size: 16px; border: 1px solid #e6dcd0; border-radius: 10px; }
  /* Allow comes first in the page so pressing Enter in the password box allows; it is shown on the right. */
  .buttons { display: flex; flex-direction: row-reverse; gap: 10px; margin-top: 16px; }
  button { flex: 1; padding: 13px; font: inherit; font-weight: 700; border-radius: 10px; border: 1px solid #e6dcd0; background: #fff; cursor: pointer; }
  button.allow { background: #b4532a; border-color: #b4532a; color: #fff; }
  .warn { background: #fff3cd; padding: 10px 12px; border-radius: 10px; }
  .error { color: #b3261e; font-weight: 600; }
</style>
<main>${body}</main>
</html>`,
    { status, headers },
  );
}

function errorPage(message: string, status = 400): Response {
  return page(`<h1>Could not connect</h1><p>${escape(message)}</p><p>Go back to the app and start connecting again.</p>`, undefined, status);
}

function consentPage(details: PageDetails, handle: string, error?: string): string {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
  return `
<h1>Allow ${escape(details.clientName)} to use your recipes?</h1>
<p>${
    details.clientDomain
      ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
      : "This app registered itself, so its name is not verified."
  } Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.loopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>' : ""}
<p>It will be able to read, add, change and delete your recipes and your grocery list.</p>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}
<form method="post">
  ${hidden("handle", handle)}
  ${hidden("clientName", details.clientName)}
  ${hidden("clientDomain", details.clientDomain)}
  ${hidden("redirectHost", details.redirectHost)}
  ${hidden("loopback", details.loopback ? "1" : "")}
  <label for="password">App password</label>
  <input id="password" type="password" name="password" autocomplete="current-password" autofocus>
  <div class="buttons">
    <button class="allow" name="decision" value="approve">Allow</button>
    <button name="decision" value="deny">Deny</button>
  </div>
</form>`;
}

/** Errors from a bad or expired request are shown here; a redirect is only safe when the library says so. */
function handleError(error: unknown): Response {
  console.log("connector sign-in: error", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
  if (error instanceof AuthorizationError) return errorPage(error.description || "This connection request is not valid or has expired.");
  if (error instanceof CimdFetchError) return errorPage("The app asking for access could not be verified.");
  throw error;
}

export async function authorizeGet(request: Request, env: Env): Promise<Response> {
  try {
    const oauth = env.OAUTH_PROVIDER;
    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    return page(
      consentPage(
        {
          clientName: details.clientName,
          clientDomain: details.clientDomain ?? "",
          redirectHost: details.redirectHost,
          loopback: details.redirectIsLoopback,
        },
        consent.handle,
      ),
      consent.headers,
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function authorizePost(request: Request, env: Env): Promise<Response> {
  try {
    const oauth = env.OAUTH_PROVIDER;
    const form = await request.formData();
    const field = (name: string) => String(form.get(name) ?? "");
    const handle = field("handle");

    if (field("decision") !== "approve") {
      console.log("connector sign-in: denied");
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    // The password is checked before the handle is used, so a typo can be retried on the same page.
    const result = await checkPassword(env, clientIp(request), field("password"));
    if (result !== "ok") {
      console.log("connector sign-in: password", result);
      const details: PageDetails = {
        clientName: field("clientName"),
        clientDomain: field("clientDomain"),
        redirectHost: field("redirectHost"),
        loopback: field("loopback") === "1",
      };
      return page(consentPage(details, handle, PASSWORD_ERRORS[result]), undefined, result === "locked" ? 429 : 401);
    }

    const approved = await oauth.approveConsent(request, handle);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, // from the library's storage, not from the form
      userId: "owner",
      metadata: {},
      scope: approved.request.scope,
      props: {},
    });
    console.log("connector sign-in: approved, returning to", new URL(redirectTo).origin + new URL(redirectTo).pathname);
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    return handleError(error);
  }
}
