# Нотатки про Syrve Cloud API

Джерело: OpenAPI-специфікація `https://api-eu.syrve.live/api-docs/docs` (Redoc на `/docs`).
Звірено зі специфікацією; на справжньому Syrve ще не перевірялось.

- Токен: `POST /api/1/access_token {apiLogin}` → `{correlationId, token}` (1 година). Метод позначений deprecated, є `/api/v2/access_token` (потребує appId/clientSecret з developer portal) — лишаємось на v1.
- Усі виклики — POST, `Authorization: Bearer <token>`, `organizationId` обовʼязковий.
- Помилки: `{correlationId, errorDescription, error}`.
- `loyalty/syrve/program` → ключ відповіді **`Programs`** (з великої літери), у програми є `walletId`.
- `customer/info`: `{type:"phone", phone}` або `{type:"id", id}` (також email, cardNumber, cardTrack). У відповіді `walletBalances[].id` — id гаманця, `balance`; `cards[].number`.
- `customer/create_or_update`: `phone`, `name`, `surName`…, відповідь `{id}`.
- `customer/program/add` → `{walletId, userWalletId}`.
- `customer/card/add`: обовʼязкові `cardTrack` і `cardNumber`.
- `wallet/topup` / `chargeoff`: `customerId`, `walletId`, `sum` (>0), `comment`.
- `transactions/by_revision`: **по одному гостю** (`customerId` та `pageSize` обовʼязкові); відповідь `{transactions, lastRevision, lastTransactionId}`. Знак `sum` не описаний — зміну рахуємо як `balanceAfter − balanceBefore`.
- **Немає ендпоінта «список усіх гостей»** — список (Д2) і worker сповіщень (О6) мають спиратись на наших гостей із БД.
