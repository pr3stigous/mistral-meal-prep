# Cook Together — Social Meal Prep Events

## The Problem

Cooking with friends should be fun, but the logistics are a nightmare. Someone picks the recipes, then spends an hour figuring out how much of everything to buy for 8 people instead of 4. They text the group asking who can bring what — half the replies come in late, two people bring chips, nobody brings the onions. On the day, everyone stands around asking "what should I do?" while the host scrambles to coordinate five dishes at once.

The bigger the group and the more recipes involved, the worse it gets.

## What Cook Together Does

Cook Together turns meal prep into a social event that actually works. A host picks 1–5 recipes, sets the group size and any dietary needs, and the app handles the rest:

- **Figures out the math** — scales every ingredient for your group size (and knows that you don't 4x the salt just because you 4x the chicken)
- **Handles dietary needs** — swaps ingredients for gluten-free, dairy-free, vegan, or nut-free guests, with notes on how substitutions affect taste and texture
- **Creates a contribution board** — a deduplicated list of everything the group needs, so guests can claim items to bring. No duplicates, no gaps
- **Gives the host a game plan** — a full shopping list with cost estimates in local currency, a step-by-step prep timeline, equipment checklist, tips from common mistakes, and storage instructions

For multi-recipe events (the hard part), the app gets smart:

- If you're making chili and chili dogs, it knows the chili *is* the topping — so it won't put "canned chili" on the shopping list
- It merges identical ingredients across recipes into one shopping list entry
- It builds an interleaved timeline — start the slow-cook items first, use downtime (oven, simmering) to prep the next dish
- It flags helpful things like "dice all the onions for both recipes at once" or "these two dishes both need the oven at different temps"

Once the event is published, guests browse it, RSVP, claim contribution items, and chat in threaded comments. The host can edit details, manage attendees, and regenerate the package if plans change.

---

## How It Works (Technical Overview)

Built with **React Native (Expo)**, **Supabase** (Postgres + Edge Functions), and **Mistral AI** for recipe intelligence. ~35,800 lines of TypeScript/SQL across 121 files.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  React Native (Expo)                                │
│                                                     │
│  Screens ─── Components ─── Hooks ─── Services      │
│     │                         │          │          │
│     └────── Navigator ────────┘          │          │
│                                          │          │
└──────────────────────────────────────────┼──────────┘
                                           │
                    Supabase Client SDK    │
                                           │
┌──────────────────────────────────────────┼──────────┐
│  Supabase                                │          │
│                                          ▼          │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  PostgreSQL   │  │  Edge Functions (Deno)       │ │
│  │              │  │                              │ │
│  │  Events      │  │  parse-recipe-url            │ │
│  │  Attendees   │  │  enhance-recipe-for-mealprep │ │
│  │  Recipes     │  │  generate-event-package      │ │
│  │  Contribs    │  │  generate-multi-recipe-pkg   │ │
│  │  Comments    │  │  generate-host-package       │ │
│  │  Invites     │  │  generate-recipes            │ │
│  │  Drafts      │  │                              │ │
│  │  RLS + RPCs  │  │  → Mistral AI                │ │
│  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Recipe Parsing Pipeline
1. User pastes any recipe URL → `parse-recipe-url` fetches the page, extracts JSON-LD/microdata, and sends it to Mistral to produce a structured recipe (name, ingredients with quantities/units/categories, instructions, equipment, prep/cook times, nutritional info, skill level, meal prep score)
2. `enhance-recipe-for-mealprep` adds meal prep-specific scoring and tips

### Event Package Generation
- **Two modes**: `full_package` (scaling + dietary → LLM generates contributions + host package) and `host_package_only` (no scaling needed → client builds contributions from raw recipe data, LLM only generates host package) — cuts LLM cost in half for simple events
- **Caching**: package is fingerprinted by recipe IDs, group size, dietary accommodations, and skill level. Navigating away and back reuses the cached package instantly
- **Auto-retry**: up to 2 retries for transient failures (network drops, app backgrounding), with immediate fail-fast for rate limits
- **Rate limiting**: per-user daily limits tracked in `llm_usage_logs` table with cost tracking per request
- **Currency localization**: detects user's timezone → maps to local currency for shopping list cost estimates

### Multi-Recipe Coordination
The `generate-multi-recipe-package` edge function receives 2–5 full recipe objects and produces a unified package in a single LLM call. The prompt enforces:

- **Recipe manifest**: every input recipe must be explicitly accounted for (`kept_separate`, `merged_with`, or `used_as_component`). Server-side validation auto-fixes any recipes the LLM omits.
- **Component detection**: if Recipe A produces something Recipe B needs (e.g., homemade chili → chili dog topping), the shopping list excludes the store-bought version and the timeline schedules A to finish before B starts.
- **Cross-recipe merging**: identical ingredients across recipes are summed (same name + same unit → one entry). Equipment is deduplicated.
- **Interleaved timeline**: long-cook items start first; passive time (oven, simmering, resting) is used to prep the next dish. Each step is tagged with its source recipe name.

### Database Design
- Row-Level Security (RLS) on all tables — users only see events they host, attend, or are invited to
- Security-definer RPCs for operations that need cross-user access (inserting contributions, fetching event detail data)
- `event_recipes` junction table for multi-recipe events with sort order and color index
- Event drafts stored as JSONB for flexible schema evolution
- Push notification triggers via database functions

### Client-Side Patterns
- **Debounced auto-save** (5s) on the creation form with ref-based access to avoid stale closures
- **Optimistic UI** for contribution claims
- **Swipe-back gesture blocking** during package generation to prevent data loss
- **Client-side contribution fallback** (`multiRecipeToContributions`) — if the LLM call fails, contributions are built directly from recipe ingredients so the host can still publish
- **Async host package fallback** — if the package wasn't generated at preview time, a fire-and-forget edge function call generates it after publish

---

## File Structure

```
src/
├── screens/mealprep/
│   ├── create/                      # Event creation flow
│   │   ├── CreateEventFormScreen    # Single-screen form with all sections
│   │   ├── EventPreviewV2Screen     # Preview + AI package generation + publish
│   │   └── sections/               # Form section components
│   │       ├── RecipeSection        # Recipe picker (single + multi)
│   │       ├── RecipePickerMulti    # Multi-recipe selector with tabs
│   │       ├── MealPlanCard         # Shows selected recipes with stats
│   │       ├── HeroBannerSection    # Emoji + gradient picker
│   │       ├── DateTimeSection      # Date/time pickers
│   │       ├── GroupSizeSection     # Participant range selector
│   │       ├── LocationSection      # City/state/country
│   │       ├── InvitesSection       # Friend picker for invites
│   │       └── ...                  # Dietary, skill level, notes, etc.
│   │
│   ├── detail-sections/             # Event detail view components
│   │   ├── DetailHeroBanner         # Hero with emoji + gradient
│   │   ├── DetailContributionBoard  # Claimable contribution items
│   │   ├── DetailRecipeCard         # Recipe preview with expandable details
│   │   ├── DetailShareInvite        # Share link + invite friends
│   │   └── ...                      # Attendees, comments, meta grid, etc.
│   │
│   ├── list-sections/               # Event list/browse components
│   │   ├── YourEventsCarousel       # Horizontal scroll of your events
│   │   ├── WellPalEventsSection     # Events from friends
│   │   ├── FeaturedEventCard        # Large featured event card
│   │   └── ...                      # Search, filters, FAB, drafts
│   │
│   ├── edit-sections/               # Event editing components
│   ├── hooks/useEventDetail.ts      # Event detail data fetching hook
│   ├── useEventDraft.ts             # Draft CRUD with React Query
│   └── MealPrepEventDetailScreen    # Main event detail screen (~2300 lines)
│
├── components/mealprep/
│   ├── HostPackageSection           # Accordion UI for the host package
│   ├── RecipeDetailSheet            # Bottom sheet with full recipe details
│   ├── EventCommentsSection         # Threaded comments
│   ├── ContributionRow              # Single contribution item with claim UI
│   └── PrepScoreCubes               # Visual meal prep score indicator
│
├── lib/
│   ├── eventFormTypes.ts            # Form data types, validation, serialization
│   ├── eventWizardTypes.ts          # Multi-recipe contribution merging logic
│   └── types.ts                     # Core types (MealPrepEvent, EventAttendee, etc.)
│
├── services/
│   └── mealPrepInviteService.ts     # Invite token generation, deep links, RSVP
│
├── navigators/
│   └── MealPrepNavigator.tsx        # Stack navigator for all meal prep screens
│
└── constants/
    └── mealPrepTheme.ts             # Design tokens (colors, fonts, spacing, shadows)

supabase/
├── functions/
│   ├── parse-recipe-url/            # Scrapes + parses any recipe URL via LLM
│   ├── enhance-recipe-for-mealprep/ # Adds meal prep scoring + tips
│   ├── generate-event-package/      # Single-recipe: contributions + host package
│   ├── generate-multi-recipe-package/ # Multi-recipe: manifest + contributions + host package
│   ├── generate-host-package/       # Standalone host package generation
│   └── generate-recipes/            # AI recipe generation from prompts
│
└── migrations/                      # 22 SQL migrations
    ├── event_wizard_schema          # Core tables: events, attendees, contributions, drafts
    ├── meal_prep_invitations        # Invite tokens, deep link support
    ├── meal_prep_notifications      # Push notification triggers
    ├── private_events_rls           # Row-level security policies
    ├── insert_event_contributions   # Security-definer RPC
    ├── create_event_recipes         # Multi-recipe junction table
    └── ...                          # Widget columns, recipe fields, RPCs
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo), TypeScript |
| Navigation | React Navigation (native stack) |
| State | React Query, React hooks, Context |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Edge Runtime | Deno (Supabase Edge Functions) |
| AI | Mistral AI (mistral-small-latest) via JSON mode |
| Styling | React Native StyleSheet, custom design system |

---

## By the Numbers

- **121 files**, ~35,800 lines of code
- **83 React components/screens** across creation, detail, editing, and browsing flows
- **6 Supabase Edge Functions** for AI-powered recipe parsing and event package generation
- **22 SQL migrations** defining the schema, RLS policies, and RPCs
- **2 LLM generation modes** (full package vs host-only) to minimize cost
- Supports **1–5 recipes per event** with intelligent cross-recipe coordination
