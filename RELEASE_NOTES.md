# Release notes

## v1.0.1

**Release date:** 2025

### Changes since v1.0.0


| Area                   | v1.0.0                                                     | v1.0.1                                                                                    |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Tier filter**        | TIER matched **exactly** (e.g. `C` = only C-tier players). | TIER means **this tier or higher** (e.g. `C` = C, B, A, or S; `S` = S only).              |
| **Xanax score (100%)** | 100% score at **4** lifetime avg xanax per day.            | 100% score at **3.25** lifetime avg xanax per day (softer, higher scores for same usage). |


### Summary

- **Tier filter:** Requesting `C`, `B`, or `A` now returns any player at that tier or better, so you get more results when filtering (e.g. "C or higher" instead of "exactly C").
- **Scoring:** The bar for a full xanax score is lowered from 4 to 3.25 xanax/day, so the same usage yields a higher numeric score and tier.

---

## v1.0.0

- Random active player API with xanax-based tier (S/A/B/C/D).
- Single API call per try (profile + personalstats combined) to minimize Torn API usage.
- Tier thresholds: S ≥ 75, A ≥ 60, B ≥ 40, C ≥ 25, D < 25 (scores 0–100).
- Filters: active hours, ID range, max tries, period (day/month), tier (exact), has faction, has company.
- Response: playerId, name, level, xanScore, tier, faction/company names, tornApiCallsUsed, etc.
- Refactored codebase (constants, API client, utils, services) and improved error messages.

