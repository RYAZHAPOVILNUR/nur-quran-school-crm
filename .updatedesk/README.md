# Карточки релизов (UpdateDesk)

Проект в CRM: **`nur-school`** — это значение поля `project` в каждой карточке.

Карточки в `.updatedesk/releases/` — понятная людям история изменений продукта: что и когда поменялось для
пользователей и команды. По ним в любой момент восстанавливается история, а CRM (crm.nurtech.dev → Разработка →
Соцсети) сама читает карточки из GitHub и пишет посты в Telegram-канал и Instagram проекта. Первые 14 дней канала
пост выходит только после одобрения владельцем.

Сайт updates.nurtech.dev выключен 29.10.2026 — вебхуки на него не ставить. Правило для всех проектов —
`~/.claude/rules/updatedesk.md`.

## Когда писать

- Одна карточка на одно заметное изменение (а не на коммит): новая функция, исправление, которое заметит
  пользователь или админ, дизайн, скорость, заметный текст. Связанные правки — в одну карточку.
- Внутренние правки (рефакторинг, тесты, инструменты, выкладка) — без карточки; если важно для истории, но не для
  постов — карточка с `public: false`.
- Коммить карточку вместе с изменением.

## Файл

`.updatedesk/releases/YYYY-MM-DD-nur-school-коротко.md`

```md
---
project: nur-school
public: true
type: feature
audience: users
title: Короткий заголовок обновления
summary: Одно-два предложения о результате для пользователя.
user_impact:
  - Конкретный эффект для пользователя.
screenshots:
  - artifacts/screens/example.png
checks:
  - npm test
deploy_url: https://...
---

Notes for editor:
- What changed:
- Where to verify:
- Risks:
```

- `public`: `true` — можно писать пост, `false` — только история.
- `type`: `feature`, `fix`, `design`, `performance`, `release`, `docs`, `internal`.
- `audience`: `users`, `admins`, `team` или свой сегмент.
- `summary` и `user_impact` — для пользователя, не пересказ диффа.
- `screenshots` — пути в репозитории или публичные ссылки, если менялся интерфейс.
- `checks` — команды и ручные проверки, которые прошли.
- `backfilled: true` — карточка восстановлена задним числом по `git log`; CRM не делает из неё пост.

## Тело коммита

```txt
UpdateDesk:
release-card: .updatedesk/releases/YYYY-MM-DD-nur-school-коротко.md
public: true
```
