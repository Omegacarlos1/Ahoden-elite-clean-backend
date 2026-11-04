# M03 Postman passed-result samples

This guide intentionally exercises only successful M03 responses. Expected HTTP
statuses are `200` or `201`. Negative authorization, validation, service-zone, and
capacity cases remain in the Mocha suites and are not part of this Postman folder.

## Naming convention

- Folder: `M03 Catalogue and Quotes - Passed Only`
- Request: `<Action> - <expected status>`
- Environment variables: stable target/configuration values such as `baseUrl`,
  `m03ServiceId`, and `m03StartsAt`
- Collection variables: values created during a run, such as `m02AccessToken`,
  `m03AddressId`, and `m03QuoteId`
- Descriptions: state the role and expected status without placing credentials or
  private address notes in examples

## Environment

Select `Ahoden Local (secret-free)` from
`postman/Ahoden_Local.environment.json`. For the isolated test API, override
`baseUrl` with `http://127.0.0.1:3001`; normal local development uses
`http://127.0.0.1:3000`.

The checked-in stable variables are:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `baseUrl` | Environment | API origin |
| `m03ServiceId` | Environment | Labelled development service fixture |
| `m03StartsAt` | Environment | Matching development capacity-slot start |
| `m02AccessToken` | Collection/runtime | Customer access token from successful M02 login |
| `m03AddressId` | Collection/runtime | Address ID captured after creation |
| `m03QuoteId` | Collection/runtime | Quote ID captured after creation |

## Port 3000 setup

Port `3000` uses the local development database, so seed the labelled M03 fixture
there before starting the server:

```powershell
npm run db:migrate
npm run db:seed:dev
npm run dev
```

The seed command is idempotent and prints the exact `m03ServiceId` and
`m03StartsAt`. It refuses to run unless `NODE_ENV=development`, the database name
ends with `_dev`, and the host is explicitly allowed. It does not delete or reset
development data.

## Run order

Run these two successful M02 setup requests first:

1. `Register customer - 201`
2. `Login customer - 200`

Then run the `M03 Catalogue and Quotes - Passed Only` folder in this order.

### 1. List active services - 200

- Method: `GET`
- URL: `{{baseUrl}}/api/v1/services`
- Authorization: none
- Expected: `200`

The saved tests verify the labelled development fixture and its GHS indicative
price.

### 2. Create customer address - 201

- Method: `POST`
- URL: `{{baseUrl}}/api/v1/addresses`
- Authorization: `Bearer {{m02AccessToken}}`
- Expected: `201`

```json
{
  "label": "Postman Home",
  "addressLine1": "1 Development Street",
  "locality": "Oyarifa",
  "region": "Greater Accra"
}
```

The test stores `data.id` as `m03AddressId`.

### 3. List customer addresses - 200

- Method: `GET`
- URL: `{{baseUrl}}/api/v1/addresses`
- Authorization: `Bearer {{m02AccessToken}}`
- Expected: `200`

The saved test confirms that the response contains `m03AddressId`.

### 4. Create server-calculated quote - 201

- Method: `POST`
- URL: `{{baseUrl}}/api/v1/quotes`
- Authorization: `Bearer {{m02AccessToken}}`
- Expected: `201`

```json
{
  "serviceId": "{{m03ServiceId}}",
  "addressId": "{{m03AddressId}}",
  "startsAt": "{{m03StartsAt}}",
  "inputs": {
    "bedrooms": 2
  }
}
```

Do not add a client amount, currency, tax, customer ID, or zone ID. The test
verifies the server-calculated GHS subtotal, explicit tax, total, and bookable
state, then stores `data.id` as `m03QuoteId`.

### 5. Get quote - 200

- Method: `GET`
- URL: `{{baseUrl}}/api/v1/quotes/{{m03QuoteId}}`
- Authorization: `Bearer {{m02AccessToken}}`
- Expected: `200`

The saved test verifies the quote ID, total, and current bookable state.

## CLI command

With the compiled test API listening on port 3001:

```powershell
npm run test:postman:m03-passed -- --env-var baseUrl=http://127.0.0.1:3001 --no-report-events
```

Verified result on 4 November 2026: 7 requests, 11 assertions, 0 failures; every
HTTP response was `200` or `201`.

For the normal development API listening on port 3000, run:

```powershell
npm run test:postman:m03-passed -- --env-var baseUrl=http://127.0.0.1:3000 --no-report-events
```
