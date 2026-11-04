# M03 test report

## Environment

- Date: 2026-11-04
- Node.js 24.19.0; npm 11.17.0
- Local database: XAMPP MariaDB 10.4.32, isolated `ahoden_elite_clean_test`
- Production compatibility target: MySQL 8.4 in GitHub Actions
- Branch: `feature/B03-service-catalogue-quotes-availability`

## Verification

| Command | Exit | Pass/fail/skip | Environment |
| --- | ---: | --- | --- |
| `npm run lint` | 0 | PASS | local workspace |
| `npm run typecheck` | 0 | PASS | local workspace |
| `npm run build` | 0 | PASS | local workspace |
| `npm run test:unit` | 0 | 20 pass, 0 fail | local workspace; includes two pre-existing unstaged startup-probe tests |
| `npm run test:api` | 0 | 8 pass, 0 fail | local |
| `npm run test:integration` | 0 | 22 pass, 0 fail; fresh 3-migration schema | real MariaDB |
| `npx postman spec lint openapi/openapi.yaml` | 0 | no specification issues; remote governance rules unavailable | local structural lint |
| `npx postman collection lint postman/Ahoden_Backend.postman_collection.json` | 0 | no issues reported; legacy v2.1 collection | local structural lint |
| `npx postman environment lint postman/Ahoden_Local.environment.json --fail-severity warning` | 0 | 1 scanned, 0 errors, 0 warnings | local structural lint |
| live `postman collection run` for M01–M03 with `--no-report-events` | 0 | 15 requests, 27 assertions, 0 fail | compiled API + real MariaDB |
| `npm audit --omit=dev --audit-level=high` | 0 | 0 production vulnerabilities | npm registry |
| full `npm audit --audit-level=high` after compatible fix | 1 | 13 moderate development-tool findings; high/runtime findings fixed | npm registry |
| `git diff --check` | 0 | PASS | local |
| GitHub Actions `backend-ci` run 41837641969 | 0 | PASS; clean migrations, committed-branch gates, Postman smoke | MySQL 8.4 CI |

Local Mocha result: 50 passing, 0 failing across the current workspace (20 unit,
8 API, 22 integration). The pushed branch excludes the user's pre-existing
unstaged database-startup test and implementation, so CI's committed unit count is
expected to be two lower. Postman feature-flag/governance fetches were unavailable
without cloud access; local lint and request execution completed and no run events
were published.

## Failures found and fixed

1. The first real migration failed because Knex generated an index identifier over
   MySQL's 64-character limit. Explicit short composite-index names fixed it; only
   partially created M03 objects were removed from the verified local `_test`
   database before the guarded clean reset.
2. The first availability rerun showed MariaDB's implicit first-`TIMESTAMP`
   `ON UPDATE CURRENT_TIMESTAMP` behavior moving a capacity slot when its reserved
   count changed. M03 business instants were changed to UTC `DATETIME`, and the
   complete integration suite passed.
3. Stable Postman fixtures initially overlapped the integration suite's open-ended
   effective ranges. Test-only 2026 ranges now end in 2027; assertions select their
   owned service ID rather than assuming an empty global catalogue.
4. The first live Postman execution completed all requests but had 26/27 assertions:
   the fixture price started in 2098, so current public catalogue output correctly
   lacked indicative pricing. Moving only the fixture price start to 2026 produced
   27/27 passing assertions on rerun.
5. Running unit and API scripts concurrently once caused a transient `dist` clean/
   build race and startup-test timeout. Sequential rerun passed; all final
   build-producing gates are run sequentially.
6. GitHub Actions run 41836322356 stopped at lint because the service-list test
   called `find`/`some` on Supertest's `any` response body. The response data now
   has an explicit test-only type; local lint reran and MySQL 8.4 run 41837035515
   passed.
7. The network-enabled audit found one high runtime advisory plus moderate
   transitive findings. A non-forced lockfile refresh upgraded `body-parser`, `qs`,
   and `serialize-javascript`; the production tree now reports zero vulnerabilities.
   Thirteen moderate findings remain in Mocha/ESLint glob/minimatch tooling because
   npm proposes a forced breaking Mocha downgrade; no `--force` change was made.

## Acceptance coverage

- Success: owner configuration, public catalogue, owned address, quote creation,
  explicit GHS tax/total, recurrence snapshots, and later price versions.
- Invalid: strict amount injection, overlapping price versions, unapproved
  production activation, and malformed configuration ranges.
- Forbidden/ownership: manager price mutation, customer-only addresses/quotes,
  and concealed cross-customer address/quote access.
- Availability: inactive service, out-of-zone locality, closing-time boundary,
  exact slot start, and full capacity.
- Durability: transactional price audit, immutable quote triggers, old pricing
  snapshot retention, and server-clock expiry.

## Skipped or blocked verification

- No production catalogue activation, production migration, maps provider, live
  funds, or external customer notification was attempted.
- Final launch prices, tax treatment, zones, hours, capacity, and operational
  policies remain a client business blocker under B-001.
