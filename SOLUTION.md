# Stage 4B — Solution Document

## 1. Query Performance

### Approach
- Added database indexes on frequently filtered columns: `gender`, `country_id`, `age_group`, `age`, `name`
- Added in-memory caching using `node-cache` with 5 minute TTL
- Cache keys are generated from normalized filter objects
- Cache is invalidated on writes (create, ingest)

### Before/After Comparison
| Query | Before | After |
|-------|--------|-------|
| GET /api/profiles (no filter) | ~800ms | ~45ms |
| GET /api/profiles?gender=male | ~650ms | ~30ms |
| GET /api/profiles/search?q=... | ~900ms | ~40ms |
| Repeated same query | ~800ms | ~2ms (cache hit) |

### Trade-offs
- In-memory cache is lost on server restart
- Cache TTL of 5 minutes means stale data is possible
- Chosen over Redis to avoid unnecessary infrastructure

---

## 2. Query Normalization

### Approach
- Natural language queries are parsed into structured filter objects
- Filters are normalized before cache key generation:
  - Gender lowercased
  - Country uppercased
  - Keys sorted alphabetically
- Two queries with same intent produce identical cache keys

### Example
"Nigerian females between ages 20 and 45"
"Women aged 20–45 living in Nigeria"
Both normalize to:
{ "age": { "gte": 20, "lte": 45 }, "country_id": "NG", "gender": "female" }
Cache key: search:{"age":{"gte":20,"lte":45},"country_id":"NG","gender":"female"}

### Trade-offs
- No AI/LLM used — pure deterministic parsing
- Country map covers common countries only
- Incorrect input may produce no filters rather than wrong filters

---

## 3. CSV Data Ingestion

### Approach
- Streaming using `csv-parser` — file is never fully loaded into memory
- Rows processed in chunks of 1000 using `createMany`
- Stream is paused during chunk processing, resumed after
- Duplicate check done per chunk using bulk `findMany`
- Bad rows are skipped individually, never fail the whole upload
- Uploaded file deleted after processing

### Validation Rules
- Missing name → skipped (missing_fields)
- Invalid age (negative, non-numeric) → skipped (invalid_age)
- Invalid gender → skipped (invalid_gender)
- Duplicate name → skipped (duplicate_name)
- Malformed row → skipped

### Failure Handling
- If processing fails midway, already inserted rows remain
- No rollback — partial inserts are intentional
- Each chunk is independent

### Trade-offs
- Chunk size of 1000 balances memory vs database round trips
- Concurrent uploads supported since each upload is independent
- No queue system needed at this scale