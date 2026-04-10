import { createServer } from "http"
import { randomBytes, createHash } from "crypto"
import open from "open"

// OAuth implementation for ChatGPT/Codex-style authentication
// This example shows the PKCE flow used by Codex

interface OAuthConfig {
  clientId: string
  authorizationEndpoint: string
  tokenEndpoint: string
  redirectUri: string
  scopes: string[]
}

interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
  accountId?: string
}

class CodexOAuthFlow {
  private codeVerifier: string
  private config: OAuthConfig

  constructor() {
    // Codex-specific configuration
    this.config = {
      clientId: "codex_cli", // Codex uses this client ID
      authorizationEndpoint: "https://chatgpt.com/backend-api/codex/authorize",
      tokenEndpoint: "https://chatgpt.com/backend-api/codex/token",
      redirectUri: "http://localhost:8080/callback",
      scopes: ["openid", "codex"],
    }

    // Generate PKCE code verifier
    this.codeVerifier = this.generateCodeVerifier()
  }

  private generateCodeVerifier(): string {
    // PKCE requires a random code verifier
    return randomBytes(32).toString("base64url")
  }

  private generateCodeChallenge(): string {
    // Code challenge = SHA256(code verifier)
    return createHash("sha256").update(this.codeVerifier).digest("base64url")
  }

  private generateState(): string {
    // Random state to prevent CSRF
    return randomBytes(16).toString("hex")
  }

  async authenticate(): Promise<TokenData> {
    const state = this.generateState()
    const codeChallenge = this.generateCodeChallenge()

    // Build authorization URL
    const authUrl = new URL(this.config.authorizationEndpoint)
    authUrl.searchParams.set("client_id", this.config.clientId)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("redirect_uri", this.config.redirectUri)
    authUrl.searchParams.set("scope", this.config.scopes.join(" "))
    authUrl.searchParams.set("state", state)
    authUrl.searchParams.set("code_challenge", codeChallenge)
    authUrl.searchParams.set("code_challenge_method", "S256")

    console.log("Starting OAuth flow...")
    console.log("Opening browser for authentication...")

    // Start local server to receive callback
    const code = await this.startCallbackServer(state)

    // Exchange code for tokens
    return this.exchangeCode(code)
  }

  private startCallbackServer(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:8080`)

        // Only handle callback path
        if (url.pathname !== "/callback") {
          res.writeHead(404)
          res.end("Not found")
          return
        }

        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        const error = url.searchParams.get("error")
        const errorDescription = url.searchParams.get("error_description")

        // Handle errors
        if (error) {
          res.writeHead(400)
          res.end(`Error: ${error}\n${errorDescription || ""}`)
          server.close()
          reject(new Error(`OAuth error: ${error} - ${errorDescription}`))
          return
        }

        // Verify state
        if (state !== expectedState) {
          res.writeHead(400)
          res.end("Invalid state parameter")
          server.close()
          reject(new Error("Invalid OAuth state - possible CSRF attack"))
          return
        }

        // Check for code
        if (!code) {
          res.writeHead(400)
          res.end("No authorization code received")
          server.close()
          reject(new Error("No authorization code in callback"))
          return
        }

        // Success
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✓ Authentication Successful</h1>
              <p>You can close this window and return to the CLI.</p>
            </body>
          </html>
        `)

        server.close()
        resolve(code)
      })

      server.listen(8080, () => {
        console.log("Waiting for authentication callback on http://localhost:8080...")
        // Open browser for user to authenticate
        open(authUrl.toString())
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close()
        reject(new Error("OAuth timeout - authentication took too long"))
      }, 300000)
    })
  }

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
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() / 1000 + data.expires_in,
      accountId: data.account_id,
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenData> {
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
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token refresh failed: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() / 1000 + data.expires_in,
      accountId: data.account_id,
    }
  }
}

// Example usage with storage
import { writeFile, readFile, mkdir } from "fs/promises"
import { homedir, platform } from "os"
import { join } from "path"

class TokenStore {
  private filePath: string

  constructor() {
    // Platform-specific config directory
    const home = homedir()
    const configDir =
      platform() === "darwin"
        ? join(home, "Library", "Application Support", "ai-agent")
        : platform() === "win32"
          ? join(home, "AppData", "Local", "ai-agent")
          : join(home, ".config", "ai-agent")

    this.filePath = join(configDir, "auth.json")
  }

  async save(provider: string, tokens: TokenData) {
    await mkdir(this.filePath.substring(0, this.filePath.lastIndexOf("/")), { recursive: true })

    let data: Record<string, TokenData> = {}
    try {
      const existing = await readFile(this.filePath, "utf-8")
      data = JSON.parse(existing)
    } catch {
      // File doesn't exist yet
    }

    data[provider] = tokens
    await writeFile(this.filePath, JSON.stringify(data, null, 2))

    // Set restrictive permissions (Unix only)
    if (platform() !== "win32") {
      await chmod(this.filePath, 0o600)
    }
  }

  async load(provider: string): Promise<TokenData | null> {
    try {
      const content = await readFile(this.filePath, "utf-8")
      const data = JSON.parse(content)
      return data[provider] || null
    } catch {
      return null
    }
  }
}

// Main flow
async function authenticateCodex() {
  const store = new TokenStore()

  // Check for existing tokens
  let tokens = await store.load("codex")

  if (tokens) {
    // Check if expired
    if (tokens.expiresAt < Date.now() / 1000 + 300) {
      console.log("Token expired, refreshing...")
      const oauth = new CodexOAuthFlow()
      tokens = await oauth.refreshTokens(tokens.refreshToken)
      await store.save("codex", tokens)
      console.log("Token refreshed successfully")
    } else {
      console.log("Using existing valid token")
    }
  } else {
    // No tokens, start OAuth flow
    console.log("No tokens found, starting OAuth flow...")
    const oauth = new CodexOAuthFlow()
    tokens = await oauth.authenticate()
    await store.save("codex", tokens)
    console.log("Authentication successful, tokens saved")
  }

  return tokens
}

// Run if executed directly
if (import.meta.main) {
  authenticateCodex()
    .then((tokens) => {
      console.log("Access token obtained successfully")
      console.log("Expires at:", new Date(tokens.expiresAt * 1000).toLocaleString())
    })
    .catch((error) => {
      console.error("Authentication failed:", error.message)
      process.exit(1)
    })
}

export { CodexOAuthFlow, TokenStore, authenticateCodex, type TokenData }
import { chmod } from "fs/promises"
