# CLAUDE.md — BestSender Backend

> Этот файл является главным справочником по проекту для Claude и разработчиков.
> Обновляй его при любых архитектурных изменениях.

---

## 1. ОБЗОР ПРОЕКТА

**Название:** BestSender Backend API
**Назначение:** Логистическая платформа — агрегатор курьерских служб (Россия, СНГ, международные)
**Фреймворк (текущий):** Express.js 4.16.1
**БД:** PostgreSQL через Sequelize ORM v5
**Язык:** Node.js (JavaScript, CommonJS)
**Порт:** 8000
**Статус:** Production-ready legacy-монолит, требующий миграции

---

## 2. СТРУКТУРА ДИРЕКТОРИЙ

```
bs_backend/
├── acl/                    # Роли и права доступа (ACL)
├── api_daemon/             # Фоновые демоны для работы с API перевозчиков
│   ├── apiDaemon.js        # Текущий демон (размещение/трекинг заказов)
│   └── apiDaemonOld.js     # Legacy-демон (26KB, поддерживает множество перевозчиков)
├── bin/
│   ├── www                 # HTTP-сервер (точка входа, port 8000)
│   ├── api                 # Точка входа API-демона
│   └── daemon              # Точка входа фонового процесса
├── config/
│   ├── app.js              # Конфигурация приложения (загружается из env)
│   ├── db.js               # Конфигурация PostgreSQL + пулы соединений
│   └── email_templates/    # HTML/txt шаблоны писем
├── helpers/
│   ├── jsonResponce.js     # Стандартизированный JSON-ответ
│   ├── processListQuery.js # Построитель запросов (сортировка, пагинация)
│   └── processWhere.js     # Построитель WHERE-условий
├── libs/
│   ├── api/                # Интеграции с API перевозчиков (16 штук)
│   │   ├── factory.js      # Фабрика API-клиентов
│   │   ├── cse.js          # CSE (53KB — самый сложный)
│   │   ├── sdek.js         # SDEK (22KB)
│   │   ├── aramex.js       # Aramex (20KB, SOAP/WSDL)
│   │   ├── ems.js          # EMS почта России (16KB)
│   │   ├── dpd.js          # DPD Европа (16KB)
│   │   ├── ponyexpress.js  # Pony Express (14KB)
│   │   ├── ase.js          # ASE (13KB)
│   │   ├── tatex.js        # Tatex (8KB)
│   │   ├── alemtat.js      # AlemTat (10KB)
│   │   ├── rocketdelivery.js # Rocket Delivery (10KB)
│   │   ├── spark.js        # Spark (7KB)
│   │   ├── measoft.js      # Measoft (7KB)
│   │   ├── gps.js          # GPS-трекинг (6KB)
│   │   ├── yandex.js       # Yandex Go
│   │   ├── smartdelivery.js# Smart/Dream Delivery
│   │   └── shared/
│   │       └── cities.json # Справочник городов
│   ├── rates.js            # Расчёт тарифов (31KB — ключевая логика)
│   ├── cache.js            # Файловый кэш (TTL-based)
│   ├── config.js           # Загрузчик ConfigParam из БД
│   ├── mailer.js           # Nodemailer + Handlebars
│   ├── users.js            # Генерация/проверка magic-link ключей
│   └── file.js             # Утилиты для файлов
├── logs_daemon/            # Демон очистки access-логов
├── middleware/
│   ├── authMiddleware.js   # Аутентификация (3 способа)
│   └── aclMiddleware.js    # ACL + логирование доступа
├── models/                 # Sequelize-модели (~40 файлов)
│   └── index.js            # Инициализация и связи моделей
├── routes/                 # Express-роутеры (~26 файлов, ~5917 строк)
├── status_daemon/          # Демон авто-отмены просроченных заказов
├── app.js                  # Настройка Express-приложения
└── package.json
```

---

## 3. СТЕК ТЕХНОЛОГИЙ

### Текущий (Legacy)
| Категория | Технология | Версия |
|-----------|-----------|--------|
| HTTP-фреймворк | Express.js | 4.16.1 |
| ORM | Sequelize | 5.21.4 |
| БД | PostgreSQL | 9.x+ |
| БД-драйвер | pg | 7.18.1 |
| Аутентификация | bcrypt + cookie-signature | — |
| Шаблоны | Handlebars + Pug | — |
| Дата/время | moment + moment-timezone | 2.25.3 |
| HTTP-клиент | node-fetch | 2.6.1 |
| Кэш | Файловая система | — |
| PDF | puppeteer | 5.3.1 |
| Email | nodemailer | 6.4.11 |
| Платёжная система | cloudpayments | 4.1.1 |
| Push-уведомления | expo-server-sdk | 3.6.0 |
| SOAP | strong-soap, xml-js | — |
| Утилиты | lodash | 4.17.20 |

### Целевой (После миграции)
| Категория | Технология | Примечание |
|-----------|-----------|------------|
| HTTP-фреймворк | NestJS | Fastify-адаптер рекомендован |
| ORM | Drizzle ORM | Типизированные запросы, migrations |
| БД | PostgreSQL | Без изменений |
| БД-драйвер | postgres (porsager) | Или pg + drizzle-orm/pg-core |
| Аутентификация | @nestjs/passport + custom | Без изменений логики |
| Шаблоны | Handlebars | Без изменений |
| Дата/время | dayjs или date-fns | Замена moment (deprecated) |
| HTTP-клиент | axios или undici | node-fetch → ESM-конфликты |
| Кэш | Redis (ioredis) | Замена файлового кэша |
| PDF | puppeteer | Без изменений |
| Email | nodemailer | Без изменений |
| Валидация | class-validator + zod | — |
| Config | @nestjs/config | — |

---

## 4. API ENDPOINTS (полный список)

### Аутентификация
Три метода аутентификации (middleware/authMiddleware.js):
- `X-API-Key` header → APIKey в модели User
- `token` подписанная cookie → User ID
- `X-Auth-Token` header / `auth-token` query-param

### Роли пользователей (9 штук)
`admin`, `supervisor`, `manager`, `company_manager`, `operator`, `sales_manager`, `sales`, `carrier_manager`, `client`

### Маршруты API

#### GET `/` — Health check

#### `/api/orders` (orders.js — 1257 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/orders` | Список заказов (фильтры, пагинация, сортировка) |
| GET | `/api/orders/get` | Один заказ по ID |
| POST | `/api/orders` | Создать заказ |
| PUT | `/api/orders/:id` | Обновить заказ |
| DELETE | `/api/orders/:id` | Удалить заказ |
| POST | `/api/orders/:id/status/update` | Изменить статус заказа |
| POST | `/api/orders/:id/payment_status/update` | Изменить статус оплаты |
| GET | `/api/orders/:id/attachment/download/:attachmentId` | Скачать вложение |
| POST | `/api/orders/:id/attachment/:attachmentId` | Загрузить вложение |
| GET | `/api/orders/:id/invoice/download` | Скачать инвойс (PDF) |
| POST | `/api/orders/:id/invoice/email` | Отправить инвойс на email |
| GET | `/api/orders/messages/list` | Сообщения к заказам |
| POST | `/api/orders/:id/message/add` | Добавить сообщение |
| POST | `/api/orders/:id/history` | История статусов |
| POST | `/api/orders/export` | Экспорт в Excel/CSV |

#### `/api/users` (users.js — 506 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/users` | Список пользователей |
| GET | `/api/users/get` | Один пользователь |
| POST | `/api/users` | Создать пользователя |
| PUT | `/api/users/:id` | Обновить пользователя |
| DELETE | `/api/users/:id` | Удалить пользователя |
| POST | `/api/users/login` | Логин (email/password) |
| POST | `/api/users/request_login_key` | Запрос magic-link |
| POST | `/api/users/login_with_key` | Логин по magic-link |
| GET | `/api/users/logout` | Выйти из системы |
| POST | `/api/users/register` | Регистрация |
| POST | `/api/users/:id/avatar` | Загрузить аватар |
| POST | `/api/users/:id/password/update` | Изменить пароль |
| GET | `/api/users/:id/api_key/reset` | Сбросить API-ключ |

#### `/api/messages` (349 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/messages` | Список сообщений |
| GET | `/api/messages/list` | Список с фильтрами |
| GET | `/api/messages/threads/list` | Треды |
| GET | `/api/messages/:threadId` | Один тред |
| POST | `/api/messages` | Отправить сообщение |
| PUT | `/api/messages/:id` | Обновить сообщение |
| DELETE | `/api/messages/:id` | Удалить сообщение |
| GET | `/api/messages/:attachmentId/attachment/download` | Скачать вложение |

#### `/api/payment_notifications` (505 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/payment_notifications/pay` | Вебхук CloudPayments |
| POST | `/api/payment_notifications/pay_confirm` | Подтверждение платежа |
| POST | `/api/payment_notifications/fail` | Ошибка платежа |
| POST | `/api/payment_notifications/test` | Тест вебхука |

#### `/api/rates` (202 строки)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/rates` | Список тарифов |
| GET | `/api/rates/search` | Поиск тарифов |
| GET | `/api/rates/get` | Один тариф |
| POST | `/api/rates` | Создать тариф |
| PUT | `/api/rates/:id` | Обновить тариф |
| DELETE | `/api/rates/:id` | Удалить тариф |

#### `/api/yandex` (536 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/yandex/estimate` | Оценка стоимости |
| POST | `/api/yandex/create` | Создать заказ Яндекс |
| GET | `/api/yandex/track/:trackingId` | Трекинг |
| GET | `/api/yandex/cancel/:orderId` | Отмена заказа |

#### `/api/reports` (707 строк)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/reports/orders` | Отчёт по заказам |
| GET | `/api/reports/orders/export` | Экспорт отчёта |
| GET | `/api/reports/income` | Отчёт по доходам |
| GET | `/api/reports/carriers` | Отчёт по перевозчикам |
| GET | `/api/reports/customers` | Аналитика клиентов |
| GET | `/api/reports/download/:reportId` | Скачать отчёт |

#### Стандартные CRUD-роуты (по 5-8 endpoint каждый):
- `/api/zones` (263 строки) — доставочные зоны
- `/api/addresses` (150 строк) — адреса
- `/api/companies` (74 строки) — компании
- `/api/carriers` (86 строк) — перевозчики
- `/api/countries` (74 строки) — страны
- `/api/regions` (84 строки) — регионы
- `/api/groups` (79 строк) — группы пользователей
- `/api/group_discounts` (94 строки) — скидки групп
- `/api/additional_services` (72 строки) — доп. услуги
- `/api/package_types` (27 строк) — типы упаковки
- `/api/rate_types` (27 строк) — типы тарифов
- `/api/rate_params` (69 строк) — параметры тарифов
- `/api/message_templates` (75 строк) — шаблоны сообщений
- `/api/news` (68 строк) — новости
- `/api/pages` (68 строк) — статические страницы
- `/api/tags` (67 строк) — теги заказов
- `/api/sales_clients` (132 строки) — клиенты продаж
- `/api/sales_users` (45 строк) — сейлзы
- `/api/geo_data` (37 строк) — геоданные
- `/api/dashboard` (80 строк) — дашборд
- `/api/access_log` (39 строк) — логи доступа
- `/api/acl` (51 строка) — ACL
- `/api/config` (56 строк) — конфигурация системы

**Итого: ~100+ endpoint, 26 файлов роутов, ~5917 строк**

---

## 5. МОДЕЛИ БД (40+ моделей)

### Ключевые статусы заказа
```
orderStatus: pending | processing | attention | confirmed | declined |
             returned | destroyed | lost | canceled | in_transit | idle_run | delivered

paymentStatus: pending | authorized | confirmed | failed | refunded | canceled | contract

paymentType: cloudpayments | bankwire | monthlyinvoice

Carrier.api: none | measoft | alemtat | cse | cse_msk_mo | cse_im | cse_cargo |
             cse_business | gps | aramex | ponyexpress | ase | spark | ems | dpd |
             yandex | sdek | tatex | smartdelivery | dreamdelivery | rocketdelivery
```

### Связи моделей
```
User         → hasMany: Order, SalesClient
             → belongsTo: Company
             → belongsToMany: Group (через UserGroup)

Order        → belongsTo: User, Carrier, Country(x2), PackageType, RateType, Company
             → hasMany: Package, OrderService, OrderHistory, OrderAPILog, OrderTag, Message

Zone         → belongsTo: Carrier
             → belongsToMany: Region (ZoneRegionFrom, ZoneRegionTo)
             → hasMany: Rate, ZoneAdditionalService
             → belongsToMany: GroupDiscount (через GroupDiscountZone)

Rate         → belongsTo: Zone, RateType
             → hasMany: RateRange

Group        → belongsToMany: User (через UserGroup)
             → hasMany: GroupDiscount, Zone

Carrier      → hasMany: Zone, RateParam
```

---

## 6. АУТЕНТИФИКАЦИЯ И БЕЗОПАСНОСТЬ

### Три метода аутентификации (middleware/authMiddleware.js)
1. **API Key** — заголовок `X-API-Key` → поиск активного пользователя по `APIKey`
2. **Cookie** — подписанная cookie `token` → User ID
3. **Auth Token** — `X-Auth-Token` header или `auth-token` query-param

### Управление сессиями
- `lastActive` и `lastIP` обновляются при каждом запросе
- Bcrypt (10 rounds) для паролей
- UUID v4 для API-ключей
- Magic-link через email (TTL 1 час)

### ACL (acl/index.js)
- 9 ролей с гранулярными правами
- Каждый endpoint защищён разрешением вида `resource:action`
- Все запросы логируются в таблицу `AccessLog`

---

## 7. ФОНОВЫЕ ПРОЦЕССЫ (ДЕМОНЫ)

### API Daemon (api_daemon/apiDaemon.js)
- **Переменная среды:** `BS_API` — указывает перевозчика (sdek, cse, etc.)
- **doOrderPlace()** — размещение заказов у перевозчиков (статус `processing`)
- **doOrderTrack()** — трекинг статусов (статус `confirmed` | `in_transit`)
- **Интервал:** `config.apiDaemon.doOrderPlaceTimeout` (default 60s)

### Status Daemon (status_daemon/statusDaemon.js)
- Авто-отмена `pending`-заказов старше N дней
- **Интервал:** `config.statusDaemon.doOrderStatusUpdateTimeout` (default 60s)

### Logs Daemon (logs_daemon/logsDaemon.js)
- Удаление записей `AccessLog` старше N дней
- **Интервал:** `config.logsDaemon.doAccessLogCleanupTimeout` (default 60s)

---

## 8. ИЗВЕСТНЫЕ БАГИ И ПРОБЛЕМЫ

### Критические баги в коде
1. **`libs/api/cse.js:892`** — `_decodeXMLParam()` — параметр `s` не объявлен → ReferenceError
2. **`libs/rates.js` (getRate)** — `readdir.PackageType.type` вместо `order.PackageType.type` (readdir = fs.readdir!)
3. **`libs/api/cse.js:248`** — HTTP вместо HTTPS → учётные данные в открытом виде
4. **SOAP namespace mix** — SOAP 1.1 и SOAP 1.2 смешаны, Content-Type всегда `application/xml`

### Архитектурные проблемы
- Нет тестов вообще (0 файлов)
- Нет Docker/контейнеризации
- Файловый кэш вместо Redis (не работает в multi-instance окружении)
- Демоны используют `Atomics.wait()` — блокирует event loop
- Sequelize v5 — устаревшая, не поддерживается
- `moment.js` — deprecated, огромный размер бандла
- `puppeteer v5` — устаревший, уязвимости безопасности
- `node-fetch v2` — CommonJS, конфликты с ESM
- `pg v7` — устаревший (текущий v8)
- `bcrypt v3` — устаревший (текущий v5)
- Нет rate limiting — уязвимость к DoS/brute force
- Нет валидации входных данных (только ORM-параметризация)
- `Sequelize.literal()` в нескольких местах → риск SQL-инъекций
- CORS открыт для всех origins

---

## 9. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

```env
# База данных
DB_USERNAME=
DB_PASSWORD=
DB_NAME=bs
DB_HOSTNAME=localhost
DB_DIALECT=postgres

# Приложение
NODE_ENV=development|production
PORT=8000
BS_API=sdek|cse|aramex|...   # Перевозчик для API-демона
```

---

## 10. ПЛАН МИГРАЦИИ НА NESTJS + DRIZZLE ORM

> **Главный принцип: API не меняется.** Все endpoint, форматы запросов/ответов,
> статус-коды, поля — идентичны. Только внутренняя реализация.

### Фазы миграции

---

### ФАЗА 0: ПОДГОТОВКА (E2E-тесты) ← СНАЧАЛА ЭТО

**Цель:** Зафиксировать поведение текущего API как "контракт" для регрессии.

#### 0.1 Инфраструктура тестов
```
Стек: Jest + Supertest + testcontainers (PostgreSQL в Docker)
Файлы: tests/e2e/
```

Устанавливаем:
```bash
npm install --save-dev jest @types/jest supertest @types/supertest
npm install --save-dev testcontainers
npm install --save-dev @faker-js/faker
```

Структура тестов:
```
tests/
├── e2e/
│   ├── setup/
│   │   ├── testApp.js          # Поднимает Express-приложение для тестов
│   │   ├── testDb.js           # PostgreSQL через testcontainers
│   │   └── fixtures/
│   │       ├── users.js        # Тестовые пользователи по каждой роли
│   │       ├── orders.js       # Тестовые заказы в разных статусах
│   │       ├── carriers.js     # Перевозчики
│   │       └── zones.js        # Зоны и тарифы
│   ├── auth/
│   │   └── auth.e2e.js
│   ├── orders/
│   │   └── orders.e2e.js
│   ├── users/
│   │   └── users.e2e.js
│   ├── rates/
│   │   └── rates.e2e.js
│   ├── messages/
│   │   └── messages.e2e.js
│   ├── reports/
│   │   └── reports.e2e.js
│   ├── payment_notifications/
│   │   └── payment_notifications.e2e.js
│   └── [один файл на каждый роут]
└── jest.config.js
```

#### 0.2 Что покрывают тесты (по каждому модулю)

**auth.e2e.js:**
- POST /api/users/login → 200 (верные данные), 401 (неверные), 400 (не указаны поля)
- POST /api/users/register → 201, 409 (уже существует)
- POST /api/users/request_login_key → 200
- POST /api/users/login_with_key → 200, 401 (невалидный ключ)
- GET /api/users/logout → 200
- Аутентификация через X-API-Key header
- Аутентификация через X-Auth-Token header
- 401 при обращении без аутентификации к защищённым роутам

**orders.e2e.js:**
- GET /api/orders → 200, структура ответа, пагинация, все фильтры
- GET /api/orders/get?id=X → 200, 404
- POST /api/orders → 201, 400 (невалидные данные), 403 (нет прав)
- PUT /api/orders/:id → 200, 404, 403
- DELETE /api/orders/:id → 200, 404, 403
- POST /api/orders/:id/status/update → 200, все допустимые переходы статусов
- POST /api/orders/:id/payment_status/update → 200
- GET /api/orders/:id/invoice/download → 200 (PDF), 404
- POST /api/orders/export → 200 (файл)
- ACL: разные роли имеют разный доступ

**users.e2e.js:**
- CRUD операции
- Изменение пароля
- Сброс API-ключа
- Загрузка аватара
- Фильтрация и пагинация

**rates.e2e.js:**
- GET /api/rates/search → структура ответа, параметры фильтрации
- CRUD для тарифов
- Корректность расчёта с групповыми скидками

**payment_notifications.e2e.js:**
- POST /pay → CloudPayments webhook (мок подписи)
- Обновление статуса заказа после платежа

**[и т.д. для каждого роута]**

#### 0.3 Покрытие ACL
Для каждого endpoint тестируем:
- `admin` — имеет доступ
- `client` — ограниченный доступ
- `manager` — средний доступ
- Без аутентификации → 401
- С аутентификацией, без прав → 403

#### 0.4 Snapshot-тесты формата ответов
```javascript
// Для каждого endpoint фиксируем структуру ответа
expect(response.body).toMatchObject({
  success: true,
  data: expect.any(Object),
  // ...точная структура
});
```

---

### ФАЗА 1: ИНФРАСТРУКТУРА NESTJS (параллельный проект)

**Создаём новый NestJS-проект рядом:**
```
bs_backend_nest/   ← новый проект
bs_backend/        ← старый (не трогаем пока работают тесты)
```

#### 1.1 Инициализация
```bash
npx @nestjs/cli new bs_backend_nest --package-manager npm
cd bs_backend_nest
npm install @nestjs/config @nestjs/platform-fastify
npm install drizzle-orm postgres
npm install --save-dev drizzle-kit
```

#### 1.2 Структура NestJS-проекта
```
src/
├── common/
│   ├── decorators/         # @CurrentUser(), @Permissions()
│   ├── guards/             # AuthGuard, AclGuard
│   ├── interceptors/       # ResponseFormatInterceptor (совместимость формата)
│   ├── filters/            # GlobalExceptionFilter
│   └── pipes/              # ValidationPipe
├── database/
│   ├── drizzle.module.ts
│   ├── drizzle.service.ts
│   └── schema/             # Drizzle-схемы (генерируются из существующей БД)
├── modules/
│   ├── auth/
│   ├── users/
│   ├── orders/
│   ├── rates/
│   ├── messages/
│   ├── carriers/
│   ├── zones/
│   ├── reports/
│   └── [остальные модули]
├── daemons/                # NestJS-сервисы вместо демонов
│   ├── api-daemon/
│   ├── status-daemon/
│   └── logs-daemon/
├── libs/
│   └── api/                # Копия carrier API-интеграций (не меняем логику)
└── main.ts
```

#### 1.3 Drizzle-схемы из существующей БД
```bash
# Интроспекция существующей схемы
npx drizzle-kit introspect:pg --out=src/database/schema --connectionString=postgresql://...
```

---

### ФАЗА 2: МИГРАЦИЯ МОДУЛЕЙ (по одному, с тестами)

**Правило:** Мигрируем модуль → запускаем E2E тесты → только если 100% зелёные — продолжаем.

#### Порядок миграции (от простого к сложному)

| Шаг | Модуль | Сложность | Зависимости |
|-----|--------|-----------|-------------|
| 2.1 | config, health | Низкая | — |
| 2.2 | countries, regions, package_types, rate_types | Низкая | — |
| 2.3 | auth (login, logout, register) | Средняя | users |
| 2.4 | users | Средняя | auth, companies, groups |
| 2.5 | companies, groups, group_discounts | Средняя | users |
| 2.6 | carriers, additional_services | Средняя | — |
| 2.7 | zones, rate_params | Средняя | carriers, regions |
| 2.8 | rates | Высокая | zones, group_discounts |
| 2.9 | orders | Высокая | users, rates, carriers |
| 2.10 | messages | Средняя | users, orders |
| 2.11 | payment_notifications | Высокая | orders |
| 2.12 | yandex | Высокая | orders |
| 2.13 | reports | Высокая | orders, users |
| 2.14 | daemons | Высокая | orders, carriers |
| 2.15 | acl, access_log, dashboard | Средняя | все |
| 2.16 | tags, news, pages, geo_data | Низкая | — |
| 2.17 | sales_clients, sales_users | Низкая | users |
| 2.18 | addresses, message_templates | Низкая | — |

#### Для каждого модуля выполняем:
1. Создаём Drizzle-схему для таблицы
2. Создаём NestJS Module, Controller, Service
3. Переносим логику из route/*.js и сохраняем формат ответа
4. Запускаем E2E тесты — должны проходить 100%
5. При необходимости — исправляем до зелёного

---

### ФАЗА 3: ЗАМЕНА БИБЛИОТЕК (без изменения API)

#### 3.1 moment.js → dayjs
- Замена во всех файлах
- Та же API (почти), не влияет на API-ответы
- Экономия: ~300KB минифицированного кода

#### 3.2 node-fetch v2 → undici (встроен в Node.js 18+)
- В carrier API-интеграциях
- Не меняем поведение, только реализацию HTTP-клиента

#### 3.3 Файловый кэш → Redis (ioredis)
- Замена в libs/cache.js
- **Критично:** сначала убедиться что Redis доступен в production
- Тот же интерфейс: `get(key, ttl)`, `set(key, value)`
- Ключи совместимы (тот же md5-формат)

#### 3.4 puppeteer v5 → puppeteer v21+
- Обновление для безопасности
- Проверить PDF-генерацию инвойсов

#### 3.5 pg v7 → pg v8 (через drizzle-orm)
- Drizzle сам использует pg v8

#### 3.6 bcrypt v3 → bcryptjs v2 или bcrypt v5
- bcryptjs — чистый JS, без нативных зависимостей
- Хэши обратно совместимы (тот же алгоритм)

#### 3.7 Убрать heapdump
- Только для разработки, не нужен в production

---

### ФАЗА 4: ФИНАЛЬНАЯ ПРОВЕРКА И ПЕРЕКЛЮЧЕНИЕ

#### 4.1 Параллельный запуск
```
Port 8000  ← Legacy Express (продакшн)
Port 8001  ← NestJS (тестирование)
```

#### 4.2 Полный прогон E2E против NestJS
- 100% тестов должны проходить
- Сравнение ответов endpoint по endpoint

#### 4.3 Нагрузочное тестирование
- k6 или Artillery против обоих серверов
- Сравнение latency и throughput

#### 4.4 Переключение
- Blue-green deployment или nginx upstream swap
- Мониторинг 24-48 часов
- Rollback-план: переключить nginx обратно на 8000

#### 4.5 Удаление legacy-кода
- После 2 недель стабильной работы
- Архив: `git tag legacy-express-final`

---

### ФАЗА 5: УЛУЧШЕНИЯ БЕЗОПАСНОСТИ (после миграции)

Эти изменения не меняют API, но добавляют защиту:
- Rate limiting (nestjs/throttler)
- Helmet.js (HTTP security headers)
- Валидация входных данных (class-validator)
- Переход на HTTPS-only
- Ротация API-ключей
- CSRF-защита для cookie-based сессий

---

## 11. ВАЖНЫЕ ПРАВИЛА ДЛЯ РАЗРАБОТКИ

### Никогда не делай без тестов
1. Любое изменение бизнес-логики — сначала тест, потом код
2. Перед PR — прогон всех E2E тестов

### Совместимость API — абсолютный приоритет
- Не переименовывай поля в ответах
- Не меняй HTTP-статус-коды
- Не меняй формат ошибок
- Не меняй URL endpoint
- Не удаляй поля из ответов (можно добавлять новые)

### Порядок работы с carrier API
- Файлы в `libs/api/` максимально не трогаем
- Баги исправляем точечно (только то что сломано)
- Логику маппинга urgency/cargo не меняем без явного требования

### Кэш
- Текущий файловый кэш: ключи вида `api_cse_` + md5
- При переходе на Redis — очищать существующий файловый кэш после деплоя

---

## 12. КОМАНДЫ РАЗРАБОТКИ

```bash
# Запуск
npm start           # Production
npm run dev         # Development (nodemon)

# База данных (Sequelize)
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all

# Тесты (после их создания)
npm test            # Все тесты
npm run test:e2e    # Только E2E
npm run test:watch  # Watch mode
```

---

## 13. КОНФИГУРАЦИЯ ПУЛОВ СОЕДИНЕНИЙ БД

```javascript
// Development
{ max: 5, min: 0, acquire: 30000, idle: 10000 }

// Production
{ max: 50, min: 1, acquire: 30000, idle: 10000 }
```

---

## 14. ИНТЕГРАЦИИ ПЕРЕВОЗЧИКОВ (сводка)

| Перевозчик | Тип API | Аутентификация | Особенности |
|-----------|---------|---------------|-------------|
| CSE | SOAP | login/password | 5 вариантов, самый сложный |
| SDEK | REST | JWT | Крупнейшая сеть РФ |
| Aramex | SOAP/WSDL | Account ID | Международный |
| EMS | REST | DEA | Почта России |
| DPD | REST | User/API Key | Европа |
| Pony Express | REST | Access Key | Региональный РФ |
| ASE | REST | Auth Code | Региональный |
| AlemTat | REST | API Key | Региональный |
| Rocket Delivery | REST | JWT | Через Яндекс |
| Spark | REST | User/Pass/Token | Быстрая доставка |
| Yandex Go | REST | Bearer | Такси-логистика |
| Measoft | REST | login/pass | Курьерская система |
| GPS | REST | Auth Token | Трекинг |
| Tatex | REST | API Key | Региональный |
| Smart/Dream | REST | Custom | Мультиинстанс |

---

*Последнее обновление: 2026-02-17*
*Автор анализа: Claude Sonnet 4.5*
