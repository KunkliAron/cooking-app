import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { app } from "./app";
import { handleMcp } from "./mcp";

/**
 * One Worker serves three things:
 *   /mcp        the connector Claude talks to, behind OAuth
 *   /authorize  the page where you approve that connection with the app password
 *   /api/*      the web app's own API, behind the session cookie
 * OAuthProvider also answers the OAuth discovery, registration and token endpoints.
 */
const providers = new Map<string, OAuthProvider<Env>>();

// The provider needs this deployment's public address, which is only known from a request.
function providerFor(origin: string): OAuthProvider<Env> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: { fetch: (request, env) => handleMcp(request as Request, env) },
      defaultHandler: { fetch: (request, env, ctx) => app.fetch(request as Request, env, ctx) },
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: ["recipes"],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
