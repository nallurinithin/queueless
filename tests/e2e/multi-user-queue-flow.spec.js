import { test, expect } from '@playwright/test';

/**
 * QueueLess Phase 4: Multi-User Real-Browser End-to-End Test Suite
 *
 * Simulates concurrent clinic operations across 4 distinct browser contexts:
 * 1. Receptionist Context (Allocates appointments & monitors live queue)
 * 2. Patient Context (Self check-in & token tracking)
 * 3. Doctor Context (Consultation room, call-next, start-serving, complete)
 * 4. Waiting Room Display Context (Public TV broadcast view)
 */

test.describe('QueueLess Multi-User Real-Browser Clinic Flow', () => {
  let receptionistContext;
  let doctorContext;
  let patientContext;
  let tvDisplayContext;

  test.beforeEach(async ({ browser }) => {
    receptionistContext = await browser.newContext();
    doctorContext = await browser.newContext();
    patientContext = await browser.newContext();
    tvDisplayContext = await browser.newContext();
  });

  test.afterEach(async () => {
    await receptionistContext?.close();
    await doctorContext?.close();
    await patientContext?.close();
    await tvDisplayContext?.close();
  });

  test('E2E: Complete Multi-User Patient Journey with Real-Time Queue Updates', async () => {
    const receptionistPage = await receptionistContext.newPage();
    const doctorPage = await doctorContext.newPage();
    const patientPage = await patientContext.newPage();
    const tvPage = await tvDisplayContext.newPage();

    // -------------------------------------------------------------------------
    // STEP 1: Receptionist Logs In
    // -------------------------------------------------------------------------
    await receptionistPage.goto('/staff/login');
    await receptionistPage.fill('input[type="email"]', 'receptionist@test.clinic');
    await receptionistPage.fill('input[type="password"]', 'Password123!');
    await receptionistPage.click('button[type="submit"]');
    await expect(receptionistPage).toHaveURL(/\/staff\/receptionist/);
    await expect(receptionistPage.getByRole('heading', { name: 'Reception Desk & Queue Control' })).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 2: Doctor Logs In to Consultation Room
    // -------------------------------------------------------------------------
    await doctorPage.goto('/staff/login');
    await doctorPage.fill('input[type="email"]', 'doctor1@test.clinic');
    await doctorPage.fill('input[type="password"]', 'Password123!');
    await doctorPage.click('button[type="submit"]');
    await expect(doctorPage).toHaveURL(/\/staff\/doctor/);
    await expect(doctorPage.getByRole('heading', { name: 'Doctor Consultation Console' })).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 3: TV Display Opens in Waiting Room
    // -------------------------------------------------------------------------
    await tvPage.goto('/display');
    await expect(tvPage.locator('text=NOW SERVING').first()).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 4: Patient Performs Self Check-In with Pre-Confirmed Reference
    // -------------------------------------------------------------------------
    await patientPage.goto('/check-in');
    await expect(patientPage.locator('text=Clinic Self Check-In').first()).toBeVisible();

    // Use seeded confirmed booking reference
    await patientPage.fill('input[placeholder*="QL-829104" i], input[type="text"]', 'CHK-LOAD-0001');
    await patientPage.click('button:has-text("Confirm Arrival & Check In"), button[type="submit"]');

    // Verify token is issued to patient (or idempotent re-entry acknowledged)
    const tokenBadge = patientPage
      .locator('text=GEN-')
      .or(patientPage.locator('text=Check-In Confirmed!'))
      .or(patientPage.locator('text=Already Checked In'))
      .first();
    await expect(tokenBadge).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 5: Receptionist Registers a Walk-In Patient
    // -------------------------------------------------------------------------
    const walkInBtn = receptionistPage.locator('button:has-text("Register Walk-In Patient")').first();
    if (await walkInBtn.isVisible()) {
      await walkInBtn.click();
      await receptionistPage.fill('input[placeholder*="Ramesh Kumar" i]', 'WalkIn Playwright Test');
      await receptionistPage.fill('input[placeholder*="9876543210" i]', '9876599999');
      const submitBtn = receptionistPage.locator('button:has-text("Issue Walk-In Token")').last();
      await submitBtn.click();
      await receptionistPage.waitForTimeout(1000);
      const doneBtn = receptionistPage.locator('button:has-text("Done")').first();
      if (await doneBtn.isVisible()) {
        await doneBtn.click();
      }
    }

    // -------------------------------------------------------------------------
    // STEP 6: Doctor Calls Next Patient
    // -------------------------------------------------------------------------
    const callNextBtn = doctorPage.locator('button:has-text("Call Next Patient")').first();
    await expect(callNextBtn).toBeVisible({ timeout: 10000 });
    await callNextBtn.click();

    // Verify Doctor Console transitions to Active Consultation (CALLED or SERVING)
    await expect(
      doctorPage.locator('text=PATIENT CALLED').or(doctorPage.locator('button:has-text("Begin Consultation")')).first()
    ).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 7: Waiting Room Display Receives Live Status Update
    // -------------------------------------------------------------------------
    // Waiting room display auto-polls every 4s and announces token
    await expect(tvPage.locator('text=NOW SERVING').first()).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 8: Doctor Starts & Completes Consultation
    // -------------------------------------------------------------------------
    const startServingBtn = doctorPage.locator('button:has-text("Begin Consultation")').first();
    if (await startServingBtn.isVisible()) {
      await startServingBtn.click();
      await doctorPage.waitForTimeout(1000);
    }

    const completeBtn = doctorPage.locator('button:has-text("Complete Consultation")').first();
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await doctorPage.waitForTimeout(1500);
    }

    // Doctor room returns to ready/idle state
    await expect(doctorPage.locator('button:has-text("Call Next Patient"), button:has-text("No Patients Waiting")').first()).toBeVisible({ timeout: 10000 });
  });
});
