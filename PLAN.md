# Twitter Embed Gallery - Plan

## Stack
- **Astro** (TypeScript)
- **Cloudflare Pages** (SSR)
- **Cloudflare D1** (SQLite database)
- **Cloudflare Workers** (API)

## Structure

```
src/
├── components/
│   └── Tweet.astro       # Embed renderer
├── pages/
│   ├── index.astro       # Gallery grid
│   └── api/
│       └── tweets.ts     # GET (list), POST (add)
└── env.d.ts              # D1 binding types
```

## Database Schema (D1)

```sql
CREATE TABLE tweets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embed_html TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security
- Add `ADMIN_SECRET` as Cloudflare secret
- POST requires `Authorization: Bearer <secret>` header
- Sanitize embed HTML before storing

## Deployment
1. `wrangler pages project create`
2. `wrangler d1 create`
3. Bind D1 to Pages
4. Deploy with `wrangler pages deploy`

## API Endpoints

### GET /api/tweets
Returns all tweets ordered by created_at DESC

### POST /api/tweets
Add new tweet
- Header: `Authorization: Bearer <ADMIN_SECRET>`
- Body: `{ embed_html: string }`
