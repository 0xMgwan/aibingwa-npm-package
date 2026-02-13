# Publishing to GitHub Packages

This guide explains how to publish `@0xMgwan/aibingwa-agent` to GitHub Packages (npm registry).

## Prerequisites

1. **GitHub Account** — You already have one
2. **GitHub Personal Access Token (PAT)** — For local publishing
3. **Repository Access** — Push access to the repo

## Option 1: Automatic Publishing (Recommended)

The repo includes a GitHub Actions workflow that automatically publishes to GitHub Packages when you create a release.

### Steps:

1. **Create a Release on GitHub:**
   - Go to your repo: https://github.com/0xMgwan/aibingwa-npm-package
   - Click "Releases" → "Create a new release"
   - Tag version: `v1.0.0` (matches `package.json` version)
   - Release title: `Release v1.0.0`
   - Click "Publish release"

2. **GitHub Actions will automatically:**
   - Install dependencies
   - Build the package
   - Publish to GitHub Packages
   - You'll see the workflow run in the "Actions" tab

3. **Done!** The package is now published to:
   ```
   https://npm.pkg.github.com/@0xMgwan/aibingwa-agent
   ```

## Option 2: Manual Publishing (Local)

If you want to publish manually from your machine:

### Step 1: Create a GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name: `npm-publish`
4. Select scopes:
   - ✅ `write:packages`
   - ✅ `read:packages`
   - ✅ `delete:packages`
5. Click "Generate token"
6. **Copy the token** (you won't see it again)

### Step 2: Configure npm

```bash
npm login --scope=@0xMgwan --registry=https://npm.pkg.github.com
```

When prompted:
- **Username:** Your GitHub username
- **Password:** Paste the PAT token you just created
- **Email:** Your GitHub email

### Step 3: Publish

```bash
npm publish
```

You should see:
```
npm notice Publishing to GitHub Packages as @0xMgwan
npm notice 📦  @0xMgwan/aibingwa-agent@1.0.0
npm notice 📝  ...
```

## Updating the Version

Before publishing a new version:

1. Update `package.json`:
   ```json
   "version": "1.0.1"
   ```

2. Commit and push:
   ```bash
   git add package.json
   git commit -m "chore: bump version to 1.0.1"
   git push origin main
   ```

3. Create a release on GitHub (Option 1) or run `npm publish` (Option 2)

## Installing from GitHub Packages

Users can now install your package:

```bash
npm install @0xMgwan/aibingwa-agent
```

Or with a specific version:

```bash
npm install @0xMgwan/aibingwa-agent@1.0.0
```

They'll need to configure their `.npmrc`:

```
@0xMgwan:registry=https://npm.pkg.github.com
```

Or log in to GitHub Packages:

```bash
npm login --scope=@0xMgwan --registry=https://npm.pkg.github.com
```

## Troubleshooting

**"404 Not Found"** when installing:
- Make sure the package is published (check the "Packages" tab on GitHub)
- Make sure `.npmrc` is configured correctly
- Make sure you're logged in to GitHub Packages

**"Permission denied"** when publishing:
- Check your PAT has `write:packages` scope
- Make sure you're logged in: `npm whoami --registry=https://npm.pkg.github.com`

**"Package already exists"**:
- You need to bump the version in `package.json` before publishing again

## Next Steps

1. Create a release on GitHub (automatic publishing)
2. Users can install with: `npm install @0xMgwan/aibingwa-agent`
3. Update version and repeat for future releases
