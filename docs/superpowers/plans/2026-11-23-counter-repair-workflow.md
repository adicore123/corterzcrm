# Counter Repair Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide store details for private customers, enable inline repair status and work updates, and use a configurable pickup address in completion messages.

**Architecture:** Extend the existing schemas and settings collection, reuse the current inline status visual pattern with a repair-specific editor, and generate completion copy from customer type plus system settings. Existing records remain readable through the legacy private-customer normalization.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, React Hook Form, Node test runner

**Spec:** `docs/superpowers/specs/2026-11-23-counter-repair-workflow-design.md`

## Global Constraints

- Default pickup address is exactly `לישנסקי 27, ראשון לציון`.
- Status and work text are saved atomically.
- WhatsApp messages are prepared for review and are never sent automatically.
- Existing repair descriptions and customer links must remain intact.

## Review Focus

- Legacy customer with `store: "פרטי"` is treated as private and does not show a store label.
- Switching an edited customer from store to private clears the stored store name.
- Cancelling the inline work editor does not change status or work.
- Returning a repair to `התקבל` preserves existing work text.
- Updating the pickup address preserves the delete-password hash and vice versa.

---

### Task 1: Customer fields follow customer type

**Files:**
- Modify: `src/components/records/customer-form.tsx`
- Modify: `src/components/records/form-parts.tsx`
- Modify: `src/components/record-cells.tsx`
- Modify: `src/lib/validation/models.ts`
- Test: `tests/customer-ready.test.ts`

**Interfaces:**
- Produces: normalized private customers and conditional `CustomerFields` rendering.

- [ ] Add failing schema tests for clearing a private customer's store value and preserving a store customer's name.
- [ ] Run `npx tsx --test tests/customer-ready.test.ts` and verify the new assertions fail.
- [ ] Make customer forms watch `customerType`, conditionally render the store field, and submit an empty store for private customers.
- [ ] Update list/card presentation so private customers never display the legacy `פרטי` store value.
- [ ] Run the focused test and verify it passes.

### Task 2: Configurable pickup address and professional completion message

**Files:**
- Modify: `src/lib/validation/models.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/app/api/[...segments]/route.ts`
- Modify: `src/app/(crm)/settings/page.tsx`
- Modify: `src/app/(crm)/settings/settings-controls.tsx`
- Modify: `src/components/records/detail.tsx`
- Modify: `src/lib/whatsapp-card.ts`
- Test: `tests/customer-ready.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PICKUP_ADDRESS`, `updateBusinessSettings(pickupAddress, actor)`, and `repairReadyMessage(customer, model, pickupAddress)`.

- [ ] Add failing tests for the exact private-customer message and the default address.
- [ ] Run the focused test and verify it fails.
- [ ] Extend settings schema and implement an admin-only PATCH route that preserves all other settings.
- [ ] Add the address form to admin settings and pass the stored address to repair details.
- [ ] Generate the agreed professional message from the configured address.
- [ ] Run the focused test and verify it passes.

### Task 3: Inline repair status and work editor

**Files:**
- Create: `src/components/records/inline-repair-status.tsx`
- Modify: `src/components/record-cells.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/customer-ready.test.ts`
- Modify: `tests/e2e.mjs`

**Interfaces:**
- Produces: `repairStatusNeedsWork(status)` and `InlineRepairStatus({record, variant})`.

- [ ] Add failing tests that `בטיפול` and `הסתיים` require the work editor while `התקבל` saves immediately.
- [ ] Run the focused test and verify it fails.
- [ ] Implement the desktop selector, mobile buttons, work textarea, save and cancel actions, and atomic PUT payload.
- [ ] Attach the component to repair table rows and mobile cards.
- [ ] Add an end-to-end scenario for opening, cancelling, then saving the work editor.
- [ ] Run focused tests, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

### Task 4: Production verification

**Files:**
- Modify only if verification finds a defect.

**Interfaces:**
- Consumes: all prior task outputs.

- [ ] Verify private and store customer forms at desktop and mobile widths.
- [ ] Verify inline repair status and work editing from both table and mobile card entry points.
- [ ] Verify the completion-message link contains the configured address.
- [ ] Review the final diff, commit only task files, push `land`, and wait for the production deployment to become ready.
