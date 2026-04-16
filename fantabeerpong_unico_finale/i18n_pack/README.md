# FantaBeerpong i18n pack

This pack is meant to finish the i18n work for the new FantaBeerpong feature.

## Active app languages
The project declares these active languages in `services/i18nService.ts`:
`it`, `en`, `fr`, `de`, `es`, `pt`, `pl`, `zh`, `ja`, `ar`, `ru`, `tr`.

## What is inside
- `translations/<lang>.ts`: partial dictionary for each active language
- `translations/all_languages.json`: same content in one file
- `COMPONENT_REWIRE_GUIDE.md`: how to replace hardcoded Italian strings with `t('...')`

## Important
Adding dictionary keys alone is **not enough**.
To avoid leftover Italian text when the language changes, the Fanta components must replace hardcoded strings with `t('...')`.

