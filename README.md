# Neurocracy Crawler
A combi-crawler and scraper for Neurocracy.

This is a crawler for Neurocracy that starts at the home screen and works it's way through all known pages (starting at the main page) discoverable via clicking links. Along the way it'll harvest hover-over text, consumable links, and work through them a page at a time.

## Later goals
- Diffs between days
- Auto-crawl every day available on the account (first edition is intended to scrap a named omnipedia date)
- Enable agreement preferences (Colloid hiding)

## Config
- OMNI_USERNAME - Your username to log in to omnipedia
- OMNI_PASSWORD - Your password to log in to omnipedia. 
  - Note: This isn't stored anywhere, and used exclusively to get a token when the cookie is stale. You can see this for yourself in the `login()` method!
- OMNIPEDIA_DATE - Date to select the main page from.
