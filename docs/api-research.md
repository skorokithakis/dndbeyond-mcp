# D&D Beyond API - Reverse Engineered Endpoints

## Service Domains

| Service | Base URL | Auth Required |
|---------|----------|---------------|
| Character Service | `https://character-service.dndbeyond.com/character/v5` | Bearer token (most endpoints) |
| Monster Service | `https://monster-service.dndbeyond.com/v1` | Optional (enhances access) |
| Auth Service | `https://auth-service.dndbeyond.com/v1` | CobaltSession cookie |
| Waterdeep (main site) | `https://www.dndbeyond.com/api` | Varies |

## Authentication

1. **CobaltSession cookie** → exchange via `POST /v1/cobalt-token` on auth-service → short-lived JWT
2. **Bearer token** in `Authorization: Bearer {jwt}` header
3. Some endpoints work without auth but return limited data (accessType: 4 = restricted)

---

## Monster Endpoints (`monster-service.dndbeyond.com`)

### Search/List Monsters
```
GET /v1/Monster?search={query}&skip={skip}&take={take}&showHomebrew={f|t}&sources={sourceId}
```
- **Auth:** Optional (free monsters return full stats without auth)
- **Params:**
  - `search` — text search (name matching)
  - `skip` — pagination offset (default: 0)
  - `take` — page size (default: 10, max: 100)
  - `showHomebrew` — `t` or `f` (default: excludes homebrew)
  - `sources` — filter by source book ID (repeatable)
- **Response:**
  ```json
  {
    "accessType": { "<monsterId>": 1|4 },
    "pagination": { "take": 10, "skip": 0, "currentPage": 1, "pages": 549, "total": 5485 },
    "stats": { "elapsedMilliseconds": 22 },
    "metaData": {},
    "data": [<MonsterObject>, ...]
  }
  ```
- **accessType values:** 1 = free/owned (full stats), 4 = restricted (empty stats)
- **Note:** Only `search`, `skip`, `take`, `showHomebrew`, `sources` actually filter. Other params are silently ignored.

### Get Monster by ID
```
GET /v1/Monster/{id}
```
- **Auth:** Optional
- **Response:**
  ```json
  {
    "stats": null|{...},
    "accessType": 1|4,
    "data": <MonsterObject>
  }
  ```

### Get Monsters by IDs (batch)
```
GET /v1/Monster?ids={id1}&ids={id2}&ids={id3}
```
- **Auth:** Optional
- Max ~100 IDs per request

### Monster Object Shape
```typescript
{
  id: number;
  entityTypeId: number;
  name: string;
  alignmentId: number;        // → config.alignments
  sizeId: number;              // → config.sizes (2=Small, 3=Medium, etc.)
  typeId: number;              // → config.monsterTypes
  armorClass: number;
  armorClassDescription: string;
  averageHitPoints: number;
  hitPointDice: { diceCount, diceValue, diceMultiplier, fixedValue, diceString };
  passivePerception: number;
  challengeRatingId: number;   // → config.challengeRatings
  isHomebrew: boolean;
  isLegendary: boolean;
  isMythic: boolean;
  hasLair: boolean;
  isLegacy: boolean;
  isReleased: boolean;
  url: string;
  avatarUrl: string;
  largeAvatarUrl: string;
  basicAvatarUrl: string;
  sourceId: number;
  sourcePageNumber: number;

  // Ability scores (statId: 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA)
  stats: [{ statId, name, value }];

  // Skills (skillId maps to config)
  skills: [{ skillId, value, additionalBonus }];

  // Senses (senseId: 1=Blindsight, 2=Darkvision, 3=Tremorsense, 4=Truesight)
  senses: [{ senseId, notes }];

  // Saving throws
  savingThrows: [{ statId, bonusModifier }];

  // Movement (movementId: 1=Walk, 2=Burrow, 3=Climb, 4=Fly, 5=Swim)
  movements: [{ movementId, speed, notes }];

  // Languages
  languages: [{ languageId, notes }];

  // Damage adjustments & condition immunities (ID arrays)
  damageAdjustments: number[];
  conditionImmunities: number[];

  // HTML descriptions (contain the actual stat block text)
  specialTraitsDescription: string;    // HTML
  actionsDescription: string;          // HTML
  reactionsDescription: string;        // HTML
  legendaryActionsDescription: string; // HTML
  mythicActionsDescription: string;    // HTML
  bonusActionsDescription: string;     // HTML
  characteristicsDescription: string;  // HTML
  lairDescription: string;             // HTML
  languageDescription: string;
  languageNote: string;

  // Metadata
  subTypes: number[];
  environments: number[];      // → config.environments
  tags: any[];
  sources: [{ sourceId, pageNumber, sourceType }];
  version: string;
  hideCr: boolean;
  swarm: null | object;
  homebrewStatus: number;
  initiativeBonus: number;
  collectionUserId: number;
  conditionImmunitiesHtml: string;
  sensesHtml: string;
  skillsHtml: string;
}
```

---

## Spell Endpoints (`character-service.dndbeyond.com`)

### Full Spell Compendium (NO AUTH REQUIRED)
```
GET /character/v5/game-data/always-known-spells?classId={id}&classLevel={level}&sharingSetting=2
```
- **Auth:** NOT required
- **Params:**
  - `classId` — class ID (see class map below)
  - `classLevel` — max 20 for all spells
  - `sharingSetting` — always `2`
  - `campaignId` — optional
  - `spellListIds[]` — optional, repeatable
  - `backgroundId` — optional
- **Class ID Map:**
  | Class | ID | Spell Count (lvl 20) |
  |-------|----|---------------------|
  | Bard | 1 | 226 |
  | Cleric | 2 | 200 |
  | Druid | 3 | 235 |
  | Paladin | 4 | 69 |
  | Ranger | 5 | 90 |
  | Sorcerer | 6 | 259 |
  | Warlock | 7 | 83 |
  | Wizard | 8 | 423 |
  | Barbarian | 9 | ? |
  | Fighter | 10 | ? |
  | Monk | 11 | ? |
  | Rogue | 12 | ? |
  | Artificer | 252717 | ? |
  | Blood Hunter | 357975 | ? |
- **Response:** Same envelope as character data: `{ id, success, message, data[], pagination }`
- **Spell object:** Same shape as character spell definitions (has `definition` with full spell text)

### Class Spells (AUTH REQUIRED)
```
GET /character/v5/game-data/spells?classId={id}&classLevel={level}&sharingSetting=2[&campaignId={id}]
```
- **Auth:** Bearer token required (401 without)

### Always Prepared Spells
```
GET /character/v5/game-data/always-prepared-spells?classId={id}&classLevel={level}&sharingSetting=2
```
- **Auth:** Optional (returns empty without auth for most classes)

---

## Item/Equipment Endpoints (`character-service.dndbeyond.com`)

### Items (AUTH REQUIRED)
```
GET /character/v5/game-data/items?sharingSetting=2[&campaignId={id}]
```
- **Auth:** Bearer token required (401 without)
- Returns magic items and equipment

### Feats (AUTH REQUIRED)
```
GET /character/v5/game-data/feats
```
- **Auth:** Bearer token required

### Classes (AUTH REQUIRED)
```
GET /character/v5/game-data/classes
```
- **Auth:** Bearer token required

### Races (AUTH REQUIRED)
```
GET /character/v5/game-data/races
```
- **Auth:** Bearer token required

### Backgrounds (AUTH REQUIRED)
```
GET /character/v5/game-data/backgrounds
```
- **Auth:** Bearer token required

---

## Config/Lookup Endpoints (`www.dndbeyond.com`)

### Game Configuration (NO AUTH)
```
GET /api/config/json
```
Contains all enum ID-to-name mappings needed to decode monster/spell data:
- `challengeRatings[]` — id, value, proficiencyBonus, xp
- `monsterTypes[]` — id, name (Aberration, Beast, Celestial, etc.)
- `monsterSubTypes[]` — 191 subtypes
- `environments[]` — 31 environments
- `alignments[]` — id, name
- `damageTypes[]` — 13 types
- `senses[]` — Blindsight, Darkvision, Tremorsense, Truesight
- `conditionTypes[]` — Standard, Special
- `armorTypes[]`, `gearTypes[]`, `weaponCategories[]`
- `languages[]`, `activationTypes[]`, `spellComponents[]`
- Game rule constants (max spell level, max stat score, etc.)

### Navigation Sources
```
GET /navigation/sources.json
```

---

## Homebrew Magic Items (`www.dndbeyond.com`)

Homebrew creation is a server-rendered form workflow on `www.dndbeyond.com`. There is no JSON create/update API: every write is an HTML form POST, and every response is either an HTML page or an HTTP redirect. The only JSON read path for homebrew items is `character-service` game data (see below).

### Auth and anti-forgery

Two different anti-forgery mechanisms are used:

1. **Form POSTs** (create/edit, modifier create/edit) embed two hidden inputs, generated per page load:
   ```html
   <input name="security-token"     type="hidden" value="<32 hex chars>">
   <input name="authenticity-token" type="hidden" value="<JWE, ~159 chars>">
   ```
   Both must be copied from the page that renders the form into the POST. No CSRF header is sent.
2. **AJAX POSTs** (delete item, publish, collection toggle, delete modifier) send a UUID in the **urlencoded body** as `request-verification-token=<uuid>`. The UUID is read from the `RequestVerificationToken` cookie. If that cookie is absent, the page first calls:
   ```
   POST /refresh-request-verification-token   → 200 {"result":"success"} + Set-Cookie: RequestVerificationToken=...
   ```
   The token is **not** sent as a header.

A cookie jar is required for the `www` flows. Besides the saved `CobaltSession`, the site sets `CobaltSessionHash`, `_swb`, `Geo`, and `RequestVerificationToken`; a request carrying only the CobaltSession cookie can load pages, but the AJAX writes need the verification cookie obtained in the same session.

### My Homebrew Creations list

```
GET https://www.dndbeyond.com/my-creations
GET https://www.dndbeyond.com/my-creations?filter-status=1
```

- **Returns:** HTML (200). No JSON list endpoint was observed; the list is fully server-rendered.
- **Default filter:** private only (`filter-status=1`). Published items are not shown unless requested.
- **Query parameters:**
  | Param | Values |
  |-------|--------|
  | `filter-name` | free text |
  | `filter-status` | `1` Private, `2` Published, `3` Deleted. Repeat the parameter to combine (`filter-status=1&filter-status=2`). Comma-separated values such as `1,2,3` are not honoured and return all statuses. |
  | `filter-moderation-status` | `1` New, `2` In Moderation, `3` Rejected, `4` Approved |
  | `filter-type` | entity type ID; `112130694` = Magic Items, `1088085227` Feats, `1118725998` Spells, `779871897` Monsters, `1669830167` Backgrounds, `1743923279` Species, `789467139` Subclasses |
- **Row structure** (one `div` per creation):
  ```html
  <div class="list-row list-row-homebrew-creation ..."
       data-type="magic-items"
       data-slug="4910078-dazzling-cloak-...">
    <a href="/homebrew/creations/view?entityTypeId=112130694&amp;id=4910078">Name</a>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-private
                homebrew-status-moderation-never-submitted">Private, Never Submitted</div>
    <div class="list-row-type-primary-text ...">Item</div>
    ...
  </div>
  ```
  Status text examples observed: `Private, Never Submitted`, `Deleted, Never Submitted`. No published row was available to observe its exact text. Magic items report type text `Item`, not `Magic Item`.
- No pagination controls appeared for 14 rows; the full list was returned in one HTML document.

### View an item

```
GET /homebrew/creations/view?entityTypeId=112130694&id={itemId}
```

- **302** → `https://www.dndbeyond.com/magic-items/{itemId}-{slug}`.
- That page is **HTML only** (200); requesting `.json` or `Accept: application/json` still returns the HTML page.
- Page actions:
  - Edit: `/homebrew/creations/magic-items/{itemId}-{slug}/edit`
  - Delete: `/homebrew/creations/delete?entityTypeId=112130694&id={itemId}` (modal link)
  - Share with community: `/homebrew/creations/submit?entityTypeId=112130694&id={itemId}` (modal link)
  - Remove from collection: `/homebrew/collection/toggle?entityId={itemId}&entityTypeId=112130694` (AJAX POST)

### Create from scratch

```
GET  /homebrew/creations/create-magic-item          # template picker / entry page
GET  /homebrew/creations/create-magic-item/create   # blank editor ("Create from Scratch")
POST /homebrew/creations/create-magic-item/create
```

- The POST is `multipart/form-data`.
- On success: **303 See Other**, `Location: /homebrew/creations/magic-items/{newId}-{slug}/edit`, empty body.
- Hidden fields: `security-token`, `authenticity-token`.
- Submitted fields (empty values are still submitted):

| Field | Notes |
|-------|-------|
| `name` | required |
| `version` | free text |
| `rarity` | `1` Common, `2` Uncommon, `3` Rare, `4` Very Rare, `5` Legendary, `7` Artifact, `9` Varies, `10` Unknown Rarity |
| `item-base-type` | `""` Item, `701257905` Armor, `1782728300` Weapon |
| `type` | `10` Wondrous Item, `5` Rod, `6` Scroll, `7` Staff, `8` Wand, `4` Ring, `3` Potion |
| `base-armor` | Armor sub-type ID; ignored unless `item-base-type=701257905` |
| `dexterity-modifier` | `1` Full Modifier, `2` Max 2, `3` None |
| `strength-requirement` | number |
| `stealth-check` | `1` None, `2` Disadvantage |
| `base-weapon` | weapon type ID (228 options); only for `item-base-type=1782728300` |
| `requires-attunement` | checkbox; value `y` when checked, omitted when not |
| `attunement-description` | free text |
| `item-description-type` | `1` WYSIWYG (default), `2` Plain Text, `3` BBCode, `4` Creole, `6` Raw HTML |
| `item-description-wysiwyg` | HTML; **this is what the server validates/persists when type=1** |
| `item-description` | HTML mirror; also submitted |
| `has-charges` | checkbox `y`; only on the edit page |
| `number-of-charges` | number |
| `charge-reset-condition` | `1` Short Rest, `2` Long Rest, `3` Dawn, `5` Other, `4` None/Consumable |
| `charge-reset-description` | free text |
| `notes` | plain text |
| `weight` | number |
| `magic-item-tags-public` | repeated per selected tag (e.g. `27` = Armor) |
| two file fields | `field-avatar`, `field-large-avatar`; the file input names are randomized hashes on each render (empty filename is submitted when unused) |

Description gotcha: when `item-description-type=1`, the server persists `item-description-wysiwyg`. Changing only `item-description` does nothing; the old WYSIWYG value wins. Set both (or use TinyMCE `setContent`) to be safe.

### Create from template

```
GET  /homebrew/creations/create-magic-item   # form with magic-item-type + magic-item selects
POST /homebrew/creations/create-magic-item
```

- The POST is `application/x-www-form-urlencoded`.
- Fields:
  | Field | Notes |
  |-------|-------|
  | `security-token` | hidden |
  | `authenticity-token` | hidden |
  | `magic-item-type` | `1` Armor, `3` Potion, `4` Ring, `5` Rod, `6` Scroll, `7` Staff, `8` Wand, `9` Weapon, `10` Wondrous Item, empty = All |
  | `magic-item` | template definition ID from the select (e.g. `4568` = Amulet of Health) |
- On success: **302 Found**, `Location: /homebrew/creations/edit?entityTypeId=112130694&id={newId}`; that generic editor URL then redirects to `/homebrew/creations/magic-items/{newId}-{slug}/edit`.
- The copy includes the template's basic fields, description, tags, attunement, and **modifiers are copied as new modifier rows** (new IDs, same values). Name becomes `COPY_OF_{template name}`.

### Edit / save an item

```
GET  /homebrew/creations/magic-items/{itemId}-{slug}/edit
POST /homebrew/creations/magic-items/{itemId}-{slug}/edit
GET  /homebrew/creations/edit?entityTypeId=112130694&id={itemId}   # 302 → canonical edit URL
```

- GET returns the full editor HTML (basic info + additional info + modals for modifiers/conditions/spells).
- POST is `multipart/form-data` with the same hidden tokens and every field listed above (including empty fields).
- On success: **303 See Other**, `Location:` back to the same editor URL, empty body.
- The editor does **not** include modifiers/conditions/spells in this POST; they are separate entities/endpoints.
- Modifiers, conditions, and spells are displayed on the editor page as lists with `Edit` / `Delete` links.

### Modifier CRUD

A modifier is a separate entity keyed by the owning homebrew entity. Magic items use `entityTypeId=112130694`. The UI calls it "Modifier Type" but the form field is still named `spell-modifier-type`.

**Create**
```
GET  /modifier/create/{itemId}-112130694/0
POST /modifier/create/{itemId}-112130694/0        # application/x-www-form-urlencoded
```

**Edit**
```
GET  /modifier/{modifierId}/0/edit
POST /modifier/{modifierId}/0/edit                # application/x-www-form-urlencoded
```

- Success: **302 Found**, `Location: /homebrew/creations/magic-items/{itemId}-{slug}/edit#modifiers`, empty body.
- Fields (empty values submitted):

| Field | Notes |
|-------|-------|
| `security-token`, `authenticity-token` | hidden form tokens |
| `spell-modifier-type` | modifier type ID (table below) |
| `spell-modifier-sub-type` | subtype ID from the type's subtype list |
| `rpg-stat` | ability ID (`1` STR … `6` CHA), only meaningful for ability-score subtypes |
| `dice-count` | number |
| `dice-value` | die size (`4`,`6`,`8`,`10`,`12`,`20`) |
| `fixed-value` | number |
| `additional-bonus-type` | `1` Proficiency Bonus, `2` Attuned Item Count, `3` Spell Level |
| `restriction` | free text ("Details" in the UI) |
| `duration-interval` | number |
| `duration-unit` | `1` Round, `2` Minute, `3` Hour, `4` Day |
| `requires-attunement` | checkbox `y` |

**Delete**
```
GET  /modifier/{modifierId}/delete          # returns the confirmation modal HTML
POST /modifier/{modifierId}/delete          # body: request-verification-token=<uuid>
```
- The GET response is an HTML fragment: `... Are you sure you want to delete this? <a class="ajax-post" href="/modifier/{id}/delete">Confirm</a>`.
- The POST is `application/x-www-form-urlencoded` and contains only the verification token. Response is 200 with an empty body; the editor page removes the row.

### Delete an item

```
GET  /homebrew/creations/delete?entityTypeId=112130694&id={itemId}
POST /homebrew/creations/delete?entityTypeId=112130694&id={itemId}
```

- GET returns the confirmation modal HTML: `Are you sure you wish to delete this homebrew item?` with `<a class="ajax-post" href="...">Yes</a>`.
- The POST body is `request-verification-token=<uuid>` (urlencoded). Response: **200 with an empty body**; no redirect.
- **Deletion is soft and reversible.** The item disappears from the default/private list and appears under `?filter-status=3` as `Deleted, Never Submitted`. No UI action was found to purge deleted tombstones (pre-existing deleted copies remain visible indefinitely). Deleted tombstones have no item link/href in the list, but their direct view URL still returns 200 and shows a **RESTORE** action instead of Edit/Delete/Share:
  ```
  GET  /homebrew/creations/restore?entityTypeId=112130694&id={itemId}   # confirmation modal
  POST /homebrew/creations/restore?entityTypeId=112130694&id={itemId}   # AJAX token
  ```
  After deletion the item can still appear in `game-data/items` reads (cache/replica dependent; observed for several minutes and non-monotonically), even though it is gone from the private list. Treat the My Creations HTML as authoritative for deleted status; `game-data/items` has no deleted flag.

### Publish (not executed)

The "Share With Community" action is:
```
GET  /homebrew/creations/submit?entityTypeId=112130694&id={itemId}   # confirmation modal
POST /homebrew/creations/submit?entityTypeId=112130694&id={itemId}   # would publish
```
The modal warns that private homebrew in the collection is already shared with campaign members and asks for confirmation before community-wide sharing. The POST is an AJAX post with `request-verification-token` (same pattern as delete). **This discovery run did not submit it; no item was published.**

Published-item editing/deleting: **not determined.** The account has no published homebrew (the Published filter returns 0 rows), and publishing was explicitly out of scope. The private-item UI exposes Edit/Delete unconditionally; whether the server rejects or changes those actions for a published item was not observable without publishing.

### JSON read path for homebrew items

There is no single-item JSON endpoint. Tested and not found:

- `GET /character/v5/game-data/items/{id}` → 404
- `GET /character/v5/game-data/item/{id}` → 404
- `GET /homebrew/creations/view.json?...` → 404 HTML
- `/api/homebrew/...` variants → 404 HTML
- `?id={id}` / `?ids={id}` on `game-data/items` are ignored (the full list is returned)

**Working read path:**
```
GET https://character-service.dndbeyond.com/character/v5/game-data/items?sharingSetting=2
Authorization: Bearer {cobalt-token}
```
- Returns a flat array (`data[]`, ~1,880 items in this account) containing **homebrew creations as well as collection/owned items**. Adding `&campaignId={id}` returns the union for that campaign (larger list).
- Homebrew items have `isHomebrew: true`, `sourceId: null`, and each has `grantedModifiers` (note: field name is `grantedModifiers`, not `modifiers`).
- Modifiers are fully expanded:
  ```json
  {
    "id": "80939903",
    "entityId": null,
    "entityTypeId": null,
    "type": "bonus",
    "subType": "armor-class",
    "dice": null,
    "restriction": "",
    "statId": null,
    "requiresAttunement": false,
    "duration": null,
    "friendlyTypeName": "Bonus",
    "friendlySubtypeName": "Armor Class",
    "isGranted": true,
    "bonusTypes": [],
    "value": 3,
    "fixedValue": 3,
    "availableToMulticlass": true,
    "modifierTypeId": 1,
    "modifierSubTypeId": 1,
    "componentId": 12345678,
    "componentTypeId": 112130694,
    "tagConstraints": []
  }
  ```
- Ability-score modifiers put the stat ID in `entityId` and `1472902489` in `entityTypeId` (e.g. CON score modifier: `entityId: 3, entityTypeId: 1472902489`). `statId` is `null`.
- Relevant item-definition fields (flat object, no wrapper):
  ```json
  {
    "id": 12345678,
    "baseTypeId": 2103445194,
    "entityTypeId": 112130694,
    "definitionKey": "112130694:12345678",
    "name": "Example Homebrew Item",
    "type": "Wondrous item",
    "filterType": "Wondrous item",
    "description": "<p>...</p>",
    "rarity": "Uncommon",
    "isHomebrew": true,
    "magic": true,
    "canAttune": true,
    "attunementDescription": "",
    "weight": 2,
    "tags": ["Armor"],
    "grantedModifiers": [],
    "baseItemId": null,
    "baseArmorName": null,
    "armorClass": null,
    "isCustomItem": false,
    "canBeAddedToInventory": true,
    "sourceId": null,
    "sources": []
  }
  ```
  There is **no deleted/published flag** on homebrew item definitions (`homebrewStatus` exists on monsters, not here). `isHomebrew` only identifies it as homebrew; use the My Creations HTML/status filter to know whether it is published or deleted.
- To read one item, fetch the list and filter `data.find(i => i.id === id)`. The endpoint has no per-ID variant.
- If the item is on a character, `GET /character/v5/character/{characterId}?includeCustomItems=true` embeds it as `inventory[].definition`, also with `grantedModifiers`. This is the only way to get a character-specific snapshot.

### Does a modifier change require saving the item again?

**No.** Modifier create/edit/delete writes a separate modifier entity immediately. The item's basic-info form was not resubmitted after adding/editing a modifier, and `game-data/items` reflected the new modifier (after a short propagation lag). The item editor is just a list view of modifier entities.

### Propagation / caching

`character-service` responses are **not strongly consistent**:

- New homebrew items appeared in `game-data/items` after a lag of a few seconds (the list count went 1,881 → 1,882 on a later request).
- After editing a modifier's `fixed-value` from 1 → 2 → 3 on a homebrew item that was on a character, repeated `get_character` responses over several minutes returned modifier values `3`, `2`, `[]`, and `1`, while `game-data/items` returned `1`, `2`, `3`, or omitted the modifier depending on the request. Different requests hit different cached/replica states.
- One `get_character` read did include the new modifier value, so propagation does happen; it is just not immediate or monotonic. Do not assume a write is visible on the next read; retry/backoff or re-read later. Avoid caching stale definitions in tools without a TTL.

### Modifier enums and where the UI gets them

The modifier form is entirely server-rendered; there is **no JSON enum endpoint** and no XHR for these lists.

- **Modifier types** come from the server-rendered `<select name="spell-modifier-type">` (37 options). IDs on this form:

  | ID | Type | ID | Type |
  |----|------|----|------|
  | 1 | Bonus | 2 | Damage |
  | 3 | Advantage | 4 | Disadvantage |
  | 5 | Resistance | 6 | Immunity |
  | 7 | Vulnerability | 8 | Sense |
  | 9 | Set | 10 | Proficiency |
  | 11 | Language | 12 | Expertise |
  | 13 | Half Proficiency | 14 | Feat |
  | 17 | Carrying Capacity | 19 | Natural Weapon |
  | 23 | Stealth Disadvantage | 24 | Speed Reduction |
  | 25 | Melee Weapon Attack | 26 | Ranged Weapon Attack |
  | 28 | Weapon Property | 29 | Half Proficiency Round Up |
  | 30 | Favored Enemy | 31 | Ignore |
  | 32 | Eldritch Blast | 33 | Replace Damage Type |
  | 34 | Twice Proficiency | 36 | Monk Weapon |
  | 37 | Protection | 38 | Stacking Bonus |
  | 39 | Set Base | 40 | Ignore Weapon Property |
  | 41 | Size | 43 | Weapon Mastery |
  | 44 | Enable Feature | 45 | Replace Weapon Ability |

- **Subtypes** are embedded in an inline `<script>` on the modifier form as a flat array (`var subTypes = [[{id,name,type}, ...]]`, mirrored on `window.subTypeJSON`) with **1,599 entries** covering all types; the UI filters it by `type` when the type select changes. No request is made. Examples:

  | Type | Subtype examples (ID) |
  |------|------------------------|
  | 1 Bonus (142 entries) | Armor Class (1), Armored Armor Class (806), AC Max Dex Modifier (770), ability checks/saves/skills, ability scores |
  | 2 Damage (29) | Acid (48), Bludgeoning (49), Cold (50), Fire (51), Force (52), Lightning (53), Necrotic (54), Piercing (55), Poison (56), Psychic (57), Radiant (58), Slashing (59), Thunder (60); also spell/weapon attack subtypes |
  | 3 Advantage (45) / 4 Disadvantage (41) | all skills, ability checks, saving throws, attack rolls against you |
  | 5 Resistance (20) / 6 Immunity (34) / 7 Vulnerability (14) | damage types and conditions; `All` is 212/213/214 |
  | 8 Sense (4) | Blindsight (170), Darkvision (171), Tremorsense (172), Truesight (173) |
  | 9 Set (25) | Armor Class (174), STR/DEX/CON/INT/WIS/CHA Score (175–180), Extra Attacks (356), speeds, Attunement Slots (1753) |
  | 10 Proficiency (279) | skills, saves, weapons, armor, tools, languages, etc. |
  | 11 Language (121) | standard + exotic languages |
  | 12 Expertise (145) / 13 Half Proficiency (129) | skills, tools, weapons |
  | 14 Feat (44) | feat names |
  | 17 Carrying Capacity (7) | Tiny–Gargantuan, Multiplier |
  | 19 Natural Weapon (3) | Bludgeoning (755), Piercing (756), Slashing (754) |
  | 23 Stealth Disadvantage (2) | Impose (772), Remove (771) |
  | 24 Speed Reduction (2) | Impose (813), Remove (812) |
  | 25/26 Melee/Ranged Weapon Attack (13 each) | damage types |
  | 28 Weapon Property (9) | Finesse (861), Heavy (865), Light (866), Loading (867), Range (868), Reach (869), Thrown (862), Two-Handed (864), Versatile (863) |
  | 29 Half Proficiency Round Up (133) | skills, tools, weapons |
  | 30 Favored Enemy (31) | creature types |
  | 31 Ignore (5) | Dual Wield Light Restrictions (1040), Dual Wield Modifier Restrictions (1041), Heavy Armor Speed Reduction (1789), Unarmored Dex AC Bonus (1055), Unarmored Dex Natural AC Bonus (1728) |
  | 32 Eldritch Blast (2) | Bonus Damage (1052), Bonus Range (1053) |
  | 33 Replace Damage Type (13) | damage types |
  | 34 Twice Proficiency (137) | skills, tools, weapons |
  | 36 Monk Weapon (1) | Greatclub (2158) |
  | 37 Protection (1) | 0 HP (1689) |
  | 38 Stacking Bonus (6) | STR (1729), DEX (1730), CON (1731), INT (1732), WIS (1733), CHA (1734) |
  | 39 Set Base (4) | Blindsight (1745), Darkvision (1746), Tremorsense (1747), Truesight (1748) |
  | 40 Ignore Weapon Property (10) | Ammunition (1870), Finesse (1754), Heavy (1758), Light (1759), Loading (1760), Range (1761), Reach (1762), Thrown (1755), Two-Handed (1757), Versatile (1756) |
  | 41 Size (6) | Tiny (1806) … Gargantuan (1811) |
  | 43 Weapon Mastery (121) | mastery per weapon |
  | 44 Enable Feature (2) | Enable Hex Weapon (2018), Enable Pact Weapon (2019) |
  | 45 Replace Weapon Ability (6) | ability scores (2012–2017) |

- **Die types** are static `<option>` values: `4`, `6`, `8`, `10`, `12`, `20` (labels d4–d20).
- **Ability scores** are static `<option>` values: `1` STR, `2` DEX, `3` CON, `4` INT, `5` WIS, `6` CHA.
- **Additional bonus types** are static: `1` Proficiency Bonus, `2` Attuned Item Count, `3` Spell Level.
- **Duration units** are static: `1` Round, `2` Minute, `3` Hour, `4` Day.

### Homebrew summary

| Operation | Method + URL | Content type | Success |
|-----------|--------------|--------------|---------|
| List | `GET /my-creations[?filter-*]` | HTML | 200 HTML |
| View | `GET /homebrew/creations/view?entityTypeId=112130694&id={id}` | HTML | 302 → `/magic-items/{id}-{slug}` |
| Create scratch | `POST /homebrew/creations/create-magic-item/create` | multipart | 303 → editor |
| Create template | `POST /homebrew/creations/create-magic-item` | urlencoded | 302 → generic editor |
| Edit/save | `POST /homebrew/creations/magic-items/{id}-{slug}/edit` | multipart | 303 → editor |
| Add modifier | `POST /modifier/create/{id}-112130694/0` | urlencoded | 302 → editor#modifiers |
| Edit modifier | `POST /modifier/{modifierId}/0/edit` | urlencoded | 302 → editor#modifiers |
| Delete modifier | `POST /modifier/{modifierId}/delete` | urlencoded (token only) | 200 empty |
| Delete item | `POST /homebrew/creations/delete?entityTypeId=112130694&id={id}` | urlencoded (token only) | 200 empty (soft delete) |
| Publish | `POST /homebrew/creations/submit?entityTypeId=112130694&id={id}` | urlencoded (token only) | not executed |

Items read as JSON via `GET character-service/character/v5/game-data/items?sharingSetting=2` (`grantedModifiers`), or through `GET /character/v5/character/{id}?includeCustomItems=true` for items on a character.

---

## Character Sheet Custom Values ("Customize")

These are the per-character overrides/bonuses exposed by the sheet's **Customize** accordions. They are stored in the character's `characterValues` array (except ability scores, which use a different endpoint).

### UI access

- **AC:** click the AC number in the combat box → right sidebar → expand `Customize`.
  Fields: `Override AC`, `Override Base Armor + DEX`, `Additional Magic Bonus`, `Additional Misc Bonus` (each with an optional source-notes input).
- **Ability score:** click an ability score box → sidebar → inputs `Other Modifier` and `Override Score`.
- **Saving throw:** click a saving-throw row → sidebar → expand `Customize`.
  Fields: `Saving Throw Override`, `Saving Throw Magic Bonus`, `Saving Throw Misc Bonus`, `Saving Throw Proficiency Level` (+ notes).
- **Skill:** click a skill row → sidebar → expand the `Customize` collapsible.
  Fields: `Skill Override`, `Skill Magic Bonus`, `Skill Misc Bonus`, `Skill Proficiency Level`, `Skill Stat Override` (+ notes).

### Endpoint and body

```
PUT https://character-service.dndbeyond.com/character/v5/custom/value
Content-Type: application/json
```

```json
{
  "characterId": 123,
  "typeId": 3,
  "value": 1,
  "notes": null,
  "valueId": null,
  "valueTypeId": null,
  "contextId": null,
  "contextTypeId": null,
  "partyId": null
}
```

- The row key is `(typeId, valueId, valueTypeId, contextId, contextTypeId)` (plus character).
- Sending a non-null `value` creates or updates the row.
- **Removal:** send the same key with `"value": null` **and** `"notes": null`. The server then drops the row from `characterValues` (this is what the UI does when a field is cleared). Sending `value: null` with notes still set clears the value but leaves the row.
- `value` can be a number (overrides/bonuses) or a string (the `NOTES` type, id 9).
- Response: `200 {"success":true,"message":"Custom value set.","data":""}`.

### `typeId` values

From `AdjustmentTypeEnum` in the character app bundle; IDs confirmed by observing the PUT bodies.

| typeId | Enum | UI field | `valueId` | `valueTypeId` |
|--------|------|----------|-----------|----------------|
| 1 | `OVERRIDE_AC` | AC → Override AC | `null` | `null` |
| 2 | `MAGIC_BONUS_AC` | AC → Additional Magic Bonus | `null` | `null` |
| 3 | `MISC_BONUS_AC` | AC → Additional Misc Bonus | `null` | `null` |
| 4 | `OVERRIDE_BASE_ARMOR` | AC → Override Base Armor + DEX | `null` | `null` |
| 9 | `NOTES` | source/notes text | entity | entity |
| 10/11 | `FIXED_VALUE_BONUS` / `FIXED_VALUE_OVERRIDE` | item/attack customization | entity ID | entity type |
| 23 | `SKILL_OVERRIDE` | Skill → Skill Override | skill ID (e.g. `"2"` = Athletics) | `"1958004211"` |
| 24 | `SKILL_MISC_BONUS` | Skill → Skill Misc Bonus | skill ID | `"1958004211"` |
| 25 | `SKILL_MAGIC_BONUS` | Skill → Skill Magic Bonus | skill ID | `"1958004211"` |
| 26 | `SKILL_PROFICIENCY_LEVEL` | Skill → Skill Proficiency Level | skill ID | `"1958004211"` |
| 27 | `SKILL_STAT_OVERRIDE` | Skill → Skill Stat Override | skill ID | `"1958004211"` |
| 38 | `SAVING_THROW_OVERRIDE` | Save → Saving Throw Override | stat ID `"1"`–`"6"` | `"1472902489"` |
| 39 | `SAVING_THROW_MISC_BONUS` | Save → Saving Throw Misc Bonus | stat ID | `"1472902489"` |
| 40 | `SAVING_THROW_MAGIC_BONUS` | Save → Saving Throw Magic Bonus | stat ID | `"1472902489"` |
| 41 | `SAVING_THROW_PROFICIENCY_LEVEL` | Save → Saving Throw Proficiency Level | stat ID | `"1472902489"` |
| 5/6/7 | `OVERRIDE_PASSIVE_PERCEPTION` / `..._INVESTIGATION` / `..._INSIGHT` | passive scores | `null` | `null` |
| 8 | `NAME_OVERRIDE` | custom action/item name | entity ID | entity type |
| 12/13 | `TO_HIT_BONUS` / `TO_HIT_OVERRIDE` | attack to-hit | entity ID | entity type |
| 14/15 | `SAVE_DC_BONUS` / `SAVE_DC_OVERRIDE` | action save DC | entity ID | entity type |
| 17 | `IS_PROFICIENT` | custom proficiency toggle | entity ID | entity type |
| 32–35 | `*_PROFICIENCY_LEVEL` | armor/weapon/tool/language proficiency | entity ID | entity type |
| 42–56 | creature/item customization | see enum (`CREATURE_*`, `USE_*`, `CAPACITY_*`, etc.) | entity ID | entity type |

Notes:
- Save/skill IDs are sent as **strings** in the JSON (`"1"`, `"2"`), not numbers.
- `1472902489` is the stat/ability entity type; `1958004211` is the skill entity type.
- `contextId`/`contextTypeId` support context-scoped values (e.g. campaign/item context); they were `null` in all observed sheet-customize writes.

### Ability scores are NOT character values

The ability-score Customize fields use a different endpoint and do not appear in `characterValues`:

```
PUT https://character-service.dndbeyond.com/character/v5/character/ability-score
Content-Type: application/json
```

```json
{ "characterId": 123, "statId": 1, "type": 2, "value": 1 }
```

| `type` | Meaning |
|--------|---------|
| 2 | bonus ("Other Modifier") → writes `bonusStats[statId-1].value` |
| 3 | override ("Override Score") → writes `overrideStats[statId-1].value` |
| 1 | base score (used by the builder, not the Customize pane; not exercised here) |

- `statId` is `1`–`6` (STR–CHA).
- Clearing the field sends the same payload with `"value": null`.
- `get_character` returns the results in `bonusStats` and `overrideStats`, not `characterValues`.

### Reading the result

`get_character` returns `characterValues[]` with `{typeId, value, notes, valueId, valueTypeId, contextId, contextTypeId}`. Existing rows may use types unrelated to the Customize pane (e.g. action/item customizations). AC types 1–4 are the ones that affect AC; the sheet applied an `Additional Misc Bonus` (`typeId=3, value=1`) by changing displayed AC from 23 to 24. Other types should be surfaced as listed values rather than applied to derived calculations unless their semantics are confirmed.

### Deletion / precision caveats

- A `PUT` with `value:null, notes:null` removes the row; a `PUT` with `value:null, notes:"..."` leaves a null-valued row. Both were observed.
- The UI fires the PUT on blur, separately for the number and the notes field. Do not update a value and its notes with two blind writes unless you want the second to match the first's key; the row key is the type/context tuple, so repeated writes update the same row (observed server-side), but the browser can briefly show duplicate/local rows until refresh.
- Character-service reads can be eventually consistent (see the homebrew propagation note); re-read after a short delay rather than assuming the write is immediately visible.

---

## Verified Non-Existent Services

These domains do NOT exist (CORS/DNS failure):
- `spell-service.dndbeyond.com`
- `item-service.dndbeyond.com`
- `feat-service.dndbeyond.com`
- `class-service.dndbeyond.com`
- `content-service.dndbeyond.com`
- `compendium-service.dndbeyond.com`
- `game-data-service.dndbeyond.com` (CORS blocked)

These domains exist but return 404 on all tested paths:
- `gamedata-service.dndbeyond.com`
- `encounter-service.dndbeyond.com`

---

## Implementation Strategy

### Monsters — Ready to implement
- Use `monster-service.dndbeyond.com/v1/Monster` for search and detail
- Works without auth for SRD/free content
- With auth (Bearer token), provides full stat blocks for owned content
- Decode IDs using `/api/config/json` enums

### Spells — Ready to implement
- Use `always-known-spells` endpoint to build full compendium
- Query all casting classes at level 20, deduplicate by spell definition ID
- Works WITHOUT auth
- Same spell definition shape already used in character tool

### Items — Needs auth
- Use `game-data/items` with Bearer token
- Should work with existing cobalt token auth
- Homebrew item CRUD is not a JSON API; it is the server-rendered form workflow documented in **Homebrew Magic Items** above

### Feats — Needs auth
- Use `game-data/feats` with Bearer token

### Classes — Needs auth
- Use `game-data/classes` with Bearer token

### Conditions — Use config
- Condition names are in `/api/config/json` but rules text is likely in character data or embedded in the SSR pages
- May need to hardcode the 15 standard D&D conditions

## Sources
- [MrPrimate/ddb-proxy](https://github.com/MrPrimate/ddb-proxy) — community reverse-engineered proxy
- Browser network inspection of dndbeyond.com (Feb 2026)
- Playwright capture of the homebrew editor and character Customize UI against the live site (Oct 2026)
