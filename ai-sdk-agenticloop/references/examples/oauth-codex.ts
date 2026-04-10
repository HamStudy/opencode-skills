/**
 * OAUTH IMPLEMENTATION FOR CHATGPT/CODEX WITH MANDATORY REFRESH TOKEN SUPPORT
 *
 * ⚠️  CRITICAL: OpenAI/Codex OAuth uses DIFFERENT ENDPOINTS and BEHAVIOR than regular OpenAI API:
 *
 *     ENDPOINTS:
 *     OAuth Flow (ChatGPT Pro/Plus subscription):
 *     - Authorization: https://chatgpt.com/backend-api/codex/authorize
 *     - Token: https://chatgpt.com/backend-api/codex/token
 *     - API Endpoint: https://chatgpt.com/backend-api/codex/responses
 *     - Client ID: "codex_cli"
 *
 *     Regular API Key Auth:
 *     - API Endpoint: https://api.openai.com/v1
 *
 *     BEHAVIOR DIFFERENCES:
 *     1. Model filtering: Only specific models work with OAuth (gpt-5.* variants, codex models)
 *     2. No costs: Usage is included with ChatGPT subscription (costs shown as 0)
 *     3. Special headers: Requires ChatGPT-Account-Id header for organization accounts
 *     4. URL rewriting: Requests to /v1/responses or /chat/completions are rewritten to Codex endpoint
 *     5. Parameter differences: maxOutputTokens should be undefined for Codex
 *     6. Bearer tokens: Uses OAuth access token instead of API key in Authorization header
 *
 *     When using OAuth, requests are rewritten to the Codex endpoint (chatgpt.com),
 *     NOT the standard OpenAI API endpoint (api.openai.com).
 *
 * ⚠️  CRITICAL REQUIREMENT: Your OAuth implementation MUST support refresh tokens.
 *     Access tokens expire (usually in 1-2 hours). Without refresh token support,
 *     users will be forced to re-authenticate constantly.
 *
 * This example demonstrates:
 * - PKCE flow for secure OAuth authentication
 * - Automatic token refresh (REQUIRED - not optional)
 * - Secure token storage with proper file permissions
 * - Complete token lifecycle management
 *
 * PREREQUISITES:
 * 1. Install dependencies:
 *    npm install open
 *
 * 2. For OpenAI/Codex OAuth, use the endpoints shown below.
 *    For other OAuth providers, adapt the endpoints accordingly.
 *
 * TOKEN LIFECYCLE:
 * 1. First auth: User completes OAuth flow → receives access_token + refresh_token
 * 2. Usage: Use access_token for API calls
 * 3. Expiration: When access_token expires (or is about to), use refresh_token to get new tokens
 * 4. Storage: Save both tokens securely - refresh_token is long-lived and reusable
 *
 * REFRESH TOKEN IS MANDATORY:
 * - Never implement OAuth without refresh token support
 * - Always check token expiration before API calls
 * - Automatically refresh when expired or about to expire (5 min buffer recommended)
 * - Store refresh_token securely - it's equivalent to a password
 */

import { createServer } from "http";
import { randomBytes, createHash } from "crypto";
import { chmod, writeFile, readFile, mkdir } from "fs/promises";
import { homedir, platform } from "os";
import { dirname, join } from "path";
import open from "open";

interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * TokenData represents the complete OAuth token response.
 *
 * ⚠️  CRITICAL: Both accessToken AND refreshToken must be stored.
 *     The refreshToken is required for automatic token renewal.
 */
interface TokenData {
  /** Short-lived token for API calls (expires in 1-2 hours typically) */
  accessToken: string;
  /** Long-lived token used to get new access tokens (REQUIRED - store this!) */
  refreshToken: string;
  /** Unix timestamp when accessToken expires */
  expiresAt: number;
  /** Optional account identifier */
  accountId?: string;
}

/**
 * CodexOAuthFlow handles the OAuth PKCE authentication flow.
 *
 * Includes MANDATORY refresh token support. Never use OAuth without this.
 */
class CodexOAuthFlow {
  private codeVerifier: string;
  private config: OAuthConfig;

  constructor() {
    // OpenAI/Codex OAuth endpoints - REQUIRED for Codex authentication
    // These are the official endpoints for OpenAI/Codex OAuth flow
    this.config = {
      clientId: "codex_cli",
      authorizationEndpoint: "https://chatgpt.com/backend-api/codex/authorize",
      tokenEndpoint: "https://chatgpt.com/backend-api/codex/token",
      redirectUri: "http://localhost:8080/callback",
      scopes: ["openid", "codex"],
    };

    // Generate PKCE code verifier (one-time use per auth flow)
    this.codeVerifier = this.generateCodeVerifier();
  }

  private generateCodeVerifier() {
    // PKCE requires a random code verifier (32 bytes minimum)
    return randomBytes(32).toString("base64url");
  }

  private generateCodeChallenge() {
    // Code challenge = SHA256(code verifier)
    return createHash("sha256").update(this.codeVerifier).digest("base64url");
  }

  private generateState() {
    // Random state to prevent CSRF attacks
    return randomBytes(16).toString("hex");
  }

  /**
   * Initiate the OAuth flow to get initial tokens.
   *
   * This opens a browser for user authentication.
   * Returns both accessToken AND refreshToken.
   */
  async authenticate(): Promise<TokenData> {
    const state = this.generateState();
    const codeChallenge = this.generateCodeChallenge();

    // Build authorization URL with PKCE parameters
    const authUrl = new URL(this.config.authorizationEndpoint);
    authUrl.searchParams.set("client_id", this.config.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", this.config.redirectUri);
    authUrl.searchParams.set("scope", this.config.scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    console.log("Starting OAuth flow...");
    console.log("Opening browser for authentication...");

    // Start local server to receive the authorization callback
    const code = await this.startCallbackServer(state, authUrl);

    // Exchange authorization code for tokens
    return this.exchangeCode(code);
  }

  private startCallbackServer(
    expectedState: string,
    authUrl: URL,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:8080`);

        // Only handle callback path
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        // Handle OAuth errors
        if (error) {
          res.writeHead(400);
          res.end(`Error: ${error}\n${errorDescription || ""}`);
          server.close();
          reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
          return;
        }

        // Verify state parameter (CSRF protection)
        if (state !== expectedState) {
          res.writeHead(400);
          res.end("Invalid state parameter");
          server.close();
          reject(new Error("Invalid OAuth state - possible CSRF attack"));
          return;
        }

        // Verify we got an authorization code
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code in callback"));
          return;
        }

        // Success - show user a nice message
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✓ Authentication Successful</h1>
              <p>You can close this window and return to the CLI.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(code);
      });

      server.listen(8080, () => {
        console.log(
          "Waiting for authentication callback on http://localhost:8080...",
        );
        // Open browser for user to authenticate
        open(authUrl.toString());
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("OAuth timeout - authentication took too long"));
      }, 300000);
    });
  }

  /**
   * Exchange authorization code for access and refresh tokens.
   *
   * ⚠️  CRITICAL: The response MUST include a refresh_token.
   *     If your OAuth provider doesn't return refresh_token, you cannot
   *     implement automatic token renewal.
   */
  private async exchangeCode(code: string): Promise<TokenData> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: this.codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // ⚠️  CRITICAL: Verify we got a refresh token
    if (!data.refresh_token) {
      throw new Error(
        "OAuth response missing refresh_token. " +
          "Automatic token renewal is impossible. " +
          "Check your OAuth scope includes 'offline_access' or equivalent.",
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() / 1000 + data.expires_in,
      accountId: data.account_id,
    };
  }

  /**
   * Refresh expired access token using the refresh token.
   *
   * ⚠️  MANDATORY: This method MUST be implemented and used.
   *     Access tokens expire frequently (1-2 hours).
   *     Without this, users will constantly need to re-authenticate.
   *
   * @param refreshToken - The long-lived refresh token from initial auth
   * @returns New TokenData with fresh accessToken and possibly new refreshToken
   */
  async refreshTokens(refreshToken: string): Promise<TokenData> {
    console.log("Refreshing access token...");

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Some providers return a new refresh_token, others don't
    // Always use the new one if provided, otherwise keep the old one
    const newRefreshToken = data.refresh_token || refreshToken;

    console.log("Token refreshed successfully");

    return {
      accessToken: data.access_token,
      refreshToken: newRefreshToken,
      expiresAt: Date.now() / 1000 + data.expires_in,
      accountId: data.account_id,
    };
  }
}

/**
 * TokenStore handles secure storage of OAuth tokens.
 *
 * ⚠️  CRITICAL: Both accessToken AND refreshToken must be persisted.
 *     The refreshToken is required for automatic token renewal.
 */
class TokenStore {
  private filePath: string;

  constructor() {
    // Platform-specific config directory with proper security
    const home = homedir();
    const configDir =
      platform() === "darwin"
        ? join(home, "Library", "Application Support", "ai-agent")
        : platform() === "win32"
          ? join(home, "AppData", "Local", "ai-agent")
          : join(home, ".config", "ai-agent");

    this.filePath = join(configDir, "auth.json");
  }

  /**
   * Save tokens to secure storage.
   *
   * ⚠️  CRITICAL: Must save BOTH accessToken AND refreshToken.
   */
  async save(provider: string, tokens: TokenData) {
    await mkdir(dirname(this.filePath), { recursive: true });

    let data: Record<string, TokenData> = {};
    try {
      const existing = await readFile(this.filePath, "utf-8");
      data = JSON.parse(existing);
    } catch {
      // File doesn't exist yet - that's fine
    }

    data[provider] = tokens;
    await writeFile(this.filePath, JSON.stringify(data, null, 2));

    // Set restrictive permissions (Unix only)
    // 0o600 = read/write for owner only
    if (platform() !== "win32") {
      await chmod(this.filePath, 0o600);
    }

    console.log(`Tokens saved for ${provider}`);
  }

  /**
   * Load tokens from secure storage.
   */
  async load(provider: string): Promise<TokenData | null> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const data = JSON.parse(content);
      return data[provider] || null;
    } catch {
      return null;
    }
  }
}

/**
 * Authenticate with automatic token refresh.
 *
 * ⚠️  CRITICAL: This demonstrates the COMPLETE token lifecycle:
 * 1. Check for existing tokens
 * 2. If expired (or about to expire), refresh them
 * 3. If no tokens, start OAuth flow
 * 4. Return valid, non-expired tokens
 *
 * ALWAYS implement this full workflow. Never skip refresh support.
 */
async function authenticateCodex(): Promise<TokenData> {
  const store = new TokenStore();
  const oauth = new CodexOAuthFlow();

  // Step 1: Check for existing tokens
  let tokens = await store.load("codex");

  if (tokens) {
    // Step 2: Check if token is expired or about to expire
    // 300 second (5 minute) buffer - refresh before actual expiration
    const isExpiredOrExpiringSoon = tokens.expiresAt < Date.now() / 1000 + 300;

    if (isExpiredOrExpiringSoon) {
      console.log("Token expired or expiring soon, refreshing...");

      try {
        // ⚠️  MANDATORY: Use refresh token to get new access token
        tokens = await oauth.refreshTokens(tokens.refreshToken);
        await store.save("codex", tokens);
        console.log("Token refreshed successfully");
      } catch (error) {
        console.error("Token refresh failed:", error);
        console.log("Falling back to full re-authentication...");

        // If refresh fails (e.g., refresh token revoked), start over
        tokens = await oauth.authenticate();
        await store.save("codex", tokens);
        console.log("Re-authentication successful");
      }
    } else {
      console.log("Using existing valid token");
    }
  } else {
    // Step 3: No tokens found - start OAuth flow
    console.log("No tokens found, starting OAuth flow...");
    tokens = await oauth.authenticate();
    await store.save("codex", tokens);
    console.log("Authentication successful, tokens saved");
  }

  return tokens;
}

// Example usage
if (import.meta.main) {
  authenticateCodex()
    .then((tokens) => {
      console.log("\n✓ Authentication complete");
      console.log("Access token:", tokens.accessToken.slice(0, 20) + "...");
      console.log("Expires at:", new Date(tokens.expiresAt * 1000).toLocaleString());
      console.log("\nThis token will be automatically refreshed when needed.");
    })
    .catch((error) => {
      console.error("\n✗ Authentication failed:", error.message);
      process.exit(1);
    });
}

export { CodexOAuthFlow, TokenStore, authenticateCodex, type TokenData };
