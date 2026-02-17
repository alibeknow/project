# E2E Tests — BestSender Backend

## Стек
- **Jest** 29 — test runner
- **Supertest** 6 — HTTP assertions против реального Express-приложения
- **@testcontainers/postgresql** 10 — PostgreSQL в Docker (автоматически поднимается и гасится)

## Требования
- **Docker Desktop** запущен (для testcontainers)
  - Если Docker недоступен — установите переменные `DB_TEST_*` для локальной БД
- Node.js 16+
- `npm install` выполнен

## Запуск

```bash
# Все E2E тесты
npm test

# С подробным выводом (console.log из приложения)
npm run test:verbose

# С покрытием
npm run test:coverage

# Watch mode
npm run test:watch
```

## Без Docker (локальная PostgreSQL)

```bash
DB_TEST_HOST=localhost \
DB_TEST_PORT=5432 \
DB_TEST_NAME=bs_test \
DB_TEST_USERNAME=postgres \
DB_TEST_PASSWORD=postgres \
npm test
```

## Структура

```
tests/
├── e2e/
│   ├── setup/
│   │   ├── globalSetup.js      # Запуск PostgreSQL testcontainer + sync schema
│   │   ├── globalTeardown.js   # Остановка контейнера
│   │   ├── jestSetup.js        # Установка DB env vars в test-процессе
│   │   ├── mockConfig.js       # Мок для config/app.js (пустой в репо)
│   │   └── seed.js             # Создание тестовых данных (компании, пользователи, заказы)
│   ├── helpers/
│   │   ├── auth.js             # Хелперы для аутентификации (X-API-Key)
│   │   └── testApp.js          # Supertest instance
│   ├── auth.e2e.test.js        # POST /login, /register, /logout, X-API-Key, X-Auth-Token
│   ├── users.e2e.test.js       # GET + POST /add /edit /delete, ACL по ролям
│   ├── orders.e2e.test.js      # Полный CRUD + смена статусов + invoice + messages
│   ├── rates.e2e.test.js       # CRUD + /search (guest-доступ)
│   ├── messages.e2e.test.js    # Треды, сообщения, вложения
│   ├── payment_notifications.e2e.test.js  # CloudPayments вебхуки
│   ├── reports.e2e.test.js     # Отчёты (orders, income, carriers, customers)
│   └── crud.e2e.test.js        # carriers, zones, countries, companies, groups,
│                                #   additional_services, package_types, rate_types,
│                                #   tags, config, dashboard, access_log, news, pages, acl
└── README.md
```

## Принципы тестов

### Аутентификация в тестах
Все тесты используют **X-API-Key header** (не cookies).
Для каждой роли есть фиксированный API-ключ, создаваемый в `seed.js`.

```javascript
// Пример использования в тесте
const { authAs } = require('./helpers/auth');
const res = await request.get('/api/orders').set(authAs('admin'));
```

### Формат ответов API
Все успешные ответы: `{ ts: <number>, result: <any> }`
Все ошибки: `{ error: { code, message, stack } }`

### ACL-тесты
Для критических endpoints проверяется доступ разных ролей:
- `admin` — полный доступ
- `client` — ограниченный (только свои данные)
- Без аутентификации → 401
- Аутентифицирован, но нет права → 403

### Изоляция данных
- Все тесты работают с одной тестовой БД
- Запускаются последовательно (`--runInBand`)
- Каждый тест-файл использует данные из `seed.js` и при необходимости создаёт/удаляет свои

### config/app.js
В репозитории файл пустой. Для тестов используется `tests/e2e/setup/mockConfig.js`
через `moduleNameMapper` в `jest.config.js`.

## Добавление новых тестов

1. Создай файл `tests/e2e/your-feature.e2e.test.js`
2. Импортируй `{ getRequest }` и `{ authAs }`
3. Вызывай `seedAll()` в `beforeAll`
4. Используй шаблон:

```javascript
const { getRequest } = require('./helpers/testApp');
const { authAs } = require('./helpers/auth');
const { seedAll } = require('./setup/seed');

let request, seeds;

beforeAll(async () => {
  seeds = await seedAll();
  request = getRequest();
}, 30000);

describe('GET /api/your-route', () => {
  it('admin can access', async () => {
    const res = await request.get('/api/your-route').set(authAs('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('result');
  });
});
```
