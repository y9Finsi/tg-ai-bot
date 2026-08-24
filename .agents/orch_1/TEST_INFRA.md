# E2E Test Infra: Telegram AI Bot Admin Panel & TGK Refactoring

## Test Philosophy
- Opaque-box and contract-driven verification for backend logic and API routes.
- Component and build verification for frontend React modules.
- Methodology: Category-Partition + Boundary Value Analysis + Integration Contract Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | WYSIWYG Photo Consistency | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Calendar Day MSK Cron Scheduler | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Intelligent Channel Text Adaptation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Centralized Model Matrix Routing | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | Model Matrix Health-Check Endpoint | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | Channel Access Check Endpoint | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |
| 7 | Frontend Decomposition & Hash Nav | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 8 | Force-Directed Memory Graph Physics | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 9 | CRM Virtualized Chat History | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 10 | Client-Side Image Compression | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Backend Test Runner**: Node.js built-in test runner (`node --test test/*.test.js`)
- **Frontend Build Verification**: `npm run admin:build` (`vite build --config admin-v2/vite.config.js`)
- **Test Locations**:
  - `test/tgk_wysiwyg_publish.test.js`
  - `test/tgk_calendar_cron.test.js`
  - `test/tgk_text_adaptation.test.js`
  - `test/model_matrix_routing.test.js`
  - `test/channel_access_check.test.js`
  - `test/image_compressor.test.js`
  - `test/admin_build_smoke.test.js`

## Coverage Thresholds
- Tier 1: >= 5 tests per feature (happy paths, isolation)
- Tier 2: >= 5 tests per feature (boundary/error cases, edge inputs)
- Tier 3: Pairwise cross-feature interactions
- Tier 4: Real-world realistic application workflows
- Tier 5: Adversarial edge cases and stress tests
