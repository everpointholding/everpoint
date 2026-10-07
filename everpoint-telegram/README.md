# EverPoint Holding — Cloudflare + Telegram Admin

This starter uses:
- Cloudflare Worker for the small backend
- Cloudflare KV for shared employee/application data
- Cloudflare Static Assets for the frontend
- Telegram Bot for administrator controls
- Telegram bot token stored as a Cloudflare Worker Secret

## Required Cloudflare resources
1. Create a Workers KV namespace named `everpoint-data`.
2. Put its namespace ID in `wrangler.jsonc` replacing `REPLACE_WITH_KV_ID`.
3. Deploy the Worker.
4. In Cloudflare Workers & Pages > your Worker > Settings > Variables and Secrets, add Secret values:
   - TELEGRAM_BOT_TOKEN = token from @BotFather
   - TELEGRAM_ADMIN_CHAT_ID = your personal Telegram numeric chat ID
   - SESSION_SECRET = a long random secret
5. Deploy again.

## Telegram webhook
After deployment, set the bot webhook to:
https://YOUR-WORKER-DOMAIN/telegram/webhook

You can do this through Telegram's setWebhook API or a one-time browser request. Do NOT put the bot token in frontend code.

## Telegram commands
/start or /menu
/help
/addemployee NAME|EMAIL|PASSWORD
/list
/progress EMPLOYEE_ID|STEP|on/off
/reimburse EMPLOYEE_ID|AMOUNT|STATUS|DESCRIPTION
/notify EMPLOYEE_ID|TITLE|MESSAGE
/announce TITLE|MESSAGE

Progress step names:
application_reviewed
shortlisted
interview
onboarding
device_activation
work_starts

## Important
This starter is intentionally small. It demonstrates the architecture and shared data flow. Before using it for real employee HR data, add stronger authentication, audit logging, rate limiting, password reset, encrypted document handling, and a proper persistent file store.
