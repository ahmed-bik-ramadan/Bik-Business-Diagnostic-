# Platform verification baseline

Both commands ran from the repository root at `8b59b0e` on branch `v19-release`, before the Mission 9B edits. The checkout used Node.js 24.22.3, pnpm 10.34.9 and the frozen lockfile. No application build preceded the tests.

| Command | Result | Exit code |
| --- | --- | --- |
| `pnpm --filter @workspace/bik-platform run typecheck` | PASS | 0 |
| `pnpm --filter @workspace/bik-platform run test` | FAIL | 1 |

## Verification scripts

`test:reference` passed. `test:additions` stopped at `verify_self_hosted_fonts.ts`. The five scripts after it ran individually with `pnpm --filter @workspace/bik-platform exec tsx scripts/<filename>`. Across both runs, 44 of 45 scripts passed.

Script paths are relative to `artifacts/bik-platform/scripts/`.

### `test:reference`

| Script | Result | Run |
| --- | --- | --- |
| `verify_system.ts` | PASS | Suite |
| `verify_reflective_question_isolation.ts` | PASS | Suite |
| `verify_question_answer_validation.ts` | PASS | Suite |
| `verify_welcome_contract.ts` | PASS | Suite |
| `verify_diagnostic_depth_copy.ts` | PASS | Suite |
| `verify_phase3b.ts` | PASS | Suite |
| `verify_phase4b.ts` | PASS | Suite |
| `verify_phase6_handoff.ts` | PASS | Suite |
| `verify_acceptance_phase6.ts` | PASS | Suite |
| `verify_fallback_safety.ts` | PASS | Suite |
| `verify_launch_contract.ts` | PASS | Suite |

### `test:additions`

| Script | Result | Run |
| --- | --- | --- |
| `verify_package_extensions.ts` | PASS | Suite |
| `verify_value_model.ts` | PASS | Suite |
| `verify_knowledge_layer.ts` | PASS | Suite |
| `verify_customer_persistence.ts` | PASS | Suite |
| `verify_phone_normalization.ts` | PASS | Suite |
| `verify_implementation_additions.ts` | PASS | Suite |
| `verify_whatsapp_contract.ts` | PASS | Suite |
| `verify_owner_message.ts` | PASS | Suite |
| `verify_scoring_integrity.ts` | PASS | Suite |
| `verify_subsector_gating.ts` | PASS | Suite |
| `verify_offers.ts` | PASS | Suite |
| `verify_chat.ts` | PASS | Suite |
| `verify_u30_flow.ts` | PASS | Suite |
| `verify_client_flow_fixes.ts` | PASS | Suite |
| `verify_consultant_page.ts` | PASS | Suite |
| `verify_transfer_flow.ts` | PASS | Suite |
| `verify_deep_diagnostics.ts` | PASS | Suite |
| `verify_codex_defect_fixes.ts` | PASS | Suite |
| `verify_codex_round2_fixes.ts` | PASS | Suite |
| `verify_codex_round3_fixes.ts` | PASS | Suite |
| `verify_round4_self_audit.ts` | PASS | Suite |
| `verify_phase1_diagnostics.ts` | PASS | Suite |
| `verify_phase3a_report.ts` | PASS | Suite |
| `verify_nodb_v1_flow.ts` | PASS | Suite |
| `verify_round5_codex_fixes.ts` | PASS | Suite |
| `verify_mission1_fixes.ts` | PASS | Suite |
| `verify_review_pages.ts` | PASS | Suite |
| `verify_fix_master.ts` | PASS | Suite |
| `verify_self_hosted_fonts.ts` | FAIL | Suite |
| `verify_start_cards.ts` | PASS | Individual |
| `verify_cost_of_problem.ts` | PASS | Individual |
| `verify_copy_deck.ts` | PASS | Individual |
| `verify_review_round2.ts` | PASS | Individual |
| `verify_mission12_launch_fixes.ts` | PASS | Individual |

## Exact failure output

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: build the application before testing self-hosted fonts
    at <anonymous> (/workspace/work/mission-9b-check/artifacts/bik-platform/scripts/verify_self_hosted_fonts.ts:6:8)
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.22.3
 ELIFECYCLE  Command failed with exit code 1.
/workspace/work/mission-9b-check/artifacts/bik-platform:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @workspace/bik-platform@0.0.0 test: `pnpm run test:reference && pnpm run test:additions`
Exit status 1
```
