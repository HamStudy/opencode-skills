# Authentication System

Implement secure authentication for API keys, OAuth, and custom auth methods.

## Auth Types

```typescript
interface ApiAuth {
  type: "api";
  apiKey: string;
}

interface OAuthAuth {
  type: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

interface CustomAuth {
  type: "custom";
  data: Record<string, any>;
}

type AuthCredentials = ApiAuth | OAuthAuth | CustomAuth;

interface AuthStore {
  get(providerId: string): Promise<AuthCredentials | null>;
  set(providerId: string, credentials: AuthCredentials): Promise<void>;
  delete(providerId: string): Promise<void>;
  list(): Promise<string[]>;
}
```

## File-Based Auth Store

```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

class FileAuthStore implements AuthStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || join(homedir(), ".ai-agents", "auth.json");
  }

  private async ensureDir() {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
  }

  private async readData(): Promise<Record<string, any>> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async writeData(data: Record<string, any>) {
    await this.ensureDir();
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
    // Secure file permissions
    await chmod(this.filePath, 0o600);
  }

  async get(providerId: string): Promise<AuthCredentials | null> {
    const data = await this.readData();
    const auth = data[providerId];
    if (!auth) return null;

    // Check if OAuth token needs refresh
    if (auth.type === "oauth" && auth.expiresAt < Date.now() / 1000) {
      return this.refreshOAuth(providerId, auth);
    }

    return auth;
  }

  async set(providerId: string, credentials: AuthCredentials) {
    const data = await this.readData();
    data[providerId] = credentials;
    await this.writeData(data);
  }

  async delete(providerId: string) {
    const data = await this.readData();
    delete data[providerId];
    await this.writeData(data);
  }

  async list(): Promise<string[]> {
    const data = await this.readData();
    return Object.keys(data);
  }
}
```

## OAuth Manager

```typescript
import { createHash, randomBytes } from "crypto";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl: string;
  authUrl: string;
}

class OAuthManager {
  private codeVerifier?: string;

  constructor(private config: OAuthConfig) {}

  generateAuthUrl(scopes: string[]): string {
    this.codeVerifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge();
    const params = new URLSearchParams();
    params.append("client_id", this.config.clientId);
    params.append("redirect_uri", this.config.redirectUri);
    params.append("response_type", "code");
    params.append("scope", scopes.join(" "));
    params.append("code_challenge", challenge);
    params.append("code_challenge_method", "S256");
    return `${this.config.authUrl}?${params.toString()}`;
  }

  private generateCodeChallenge(): string {
    return createHash("sha256").update(this.codeVerifier!).digest("base64url");
  }

  private generateCodeVerifier(): string {
    return randomBytes(16).toString("hex");
  }

  async exchangeCodeForToken(code: string): Promise<OAuthAuth> {
    const body = new URLSearchParams();
    body.append("grant_type", "authorization_code");
    body.append("code", code);
    body.append("client_id", this.config.clientId);
    body.append("client_secret", this.config.clientSecret);
    body.append("redirect_uri", this.config.redirectUri);
    body.append("code_verifier", this.codeVerifier!);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = (await response.json()) as any;
    return {
      type: "oauth",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  }

  async refreshToken(auth: OAuthAuth): Promise<OAuthAuth> {
    const body = new URLSearchParams();
    body.append("grant_type", "refresh_token");
    body.append("refresh_token", auth.refreshToken);
    body.append("client_id", this.config.clientId);
    body.append("client_secret", this.config.clientSecret);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = (await response.json()) as any;
    return {
      type: "oauth",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  }
}
```

## Environment Variable Setup

```typescript
// Required environment variables for different providers:

// OpenAI
process.env.OPENAI_API_KEY = "sk-...";

// Anthropic
process.env.ANTHROPIC_API_KEY = "sk-ant-...";

// Google Gemini
process.env.GOOGLE_API_KEY = "AIzaSy...";

// Azure
process.env.AZURE_API_KEY = "...";
process.env.AZURE_RESOURCE_NAME = "...";

// AWS Bedrock
process.env.AWS_ACCESS_KEY_ID = "...";
process.env.AWS_SECRET_ACCESS_KEY = "...";
process.env.AWS_REGION = "us-west-2";

// Mistral
process.env.MISTRAL_API_KEY = "...";

// Groq
process.env.GROQ_API_KEY = "...";

// For OAuth flows, also set:
process.env.AUTH_STORE_PATH = homedir() + "/.config/ai-agents/auth.json";
```

## Usage Example

```typescript
import { FileAuthStore } from "./auth-store";
import { OAuthManager } from "./oauth-manager";

async function setupAuth() {
  const store = new FileAuthStore();

  // Setup API key auth
  await store.set("openai", {
    type: "api",
    apiKey: process.env.OPENAI_API_KEY!,
  });

  // Setup OAuth
  const oauthMgr = new OAuthManager({
    clientId: "...",
    clientSecret: "...",
    redirectUri: "http://localhost:3000/callback",
    tokenUrl: "https://provider.com/token",
    authUrl: "https://provider.com/authorize",
  });

  const authUrl = oauthMgr.generateAuthUrl(["scope1", "scope2"]);
  console.log("Visit:", authUrl);

  // After user redirects back with code:
  const token = await oauthMgr.exchangeCodeForToken(code);
  await store.set("provider", token);

  // Retrieve and use stored credentials
  const creds = await store.get("openai");
  if (creds?.type === "api") {
    console.log("Using API key:", creds.apiKey.slice(0, 10) + "...");
  }
}

setupAuth().catch(console.error);
```
