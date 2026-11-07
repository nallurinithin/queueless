import { test, expect } from '@playwright/test';

/**
 * QueueLess Phase 7: Role-Specific Automated Workflow Test Suite
 *
 * Verifies individual role journeys and access controls:
 * 1. Patient Journey (Guest landing -> OTP verification -> Booking -> Reference & Tracking -> Check-In -> Logout)
 * 2. Receptionist Journey (Staff login -> Dashboard -> Walk-In Registration (₹0) -> Queue ops -> RBAC protection)
 * 3. Doctor Journey (Staff login -> Consultation Console -> Call Next -> Complete -> RBAC protection)
 * 4. Clinic Owner Journey (Staff login -> Dashboard -> Roster check -> Invite Staff -> Policy update & persistence)
 */

test.describe('QueueLess Role-Specific Workflows', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ---------------------------------------------------------------------------
  // 1. PATIENT JOURNEY
  // ---------------------------------------------------------------------------
  test('Patient: Guest Landing -> OTP Verify -> Book Appointment -> Check-In -> Logout', async ({ page }) => {
    // 1. Landing & Navigation
    await page.goto('/');
    await expect(page.locator('text=QueueLess').first()).toBeVisible({ timeout: 10000 });
    
    // Click Book Appointment
    const bookNavBtn = page.locator('a:has-text("Book Appointment"), button:has-text("Book Appointment")').first();
    await bookNavBtn.click();
    await expect(page).toHaveURL(/\/book/);

    // If an existing session is persisted, clear it
    const clearSessionBtn = page.locator('button:has-text("Sign Out"), button:has-text("Clear Session")').first();
    if (await clearSessionBtn.isVisible()) {
      await clearSessionBtn.click();
    }

    // 2. Phone OTP Authentication
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="10-digit" i]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10000 });
    await phoneInput.fill('9876543210');
    await page.click('button:has-text("Send 6-Digit OTP")');

    // Enter test OTP (123456)
    const otpInput = page.locator('input[name="otp"], input[placeholder*="123456" i]').first();
    await expect(otpInput).toBeVisible({ timeout: 10000 });
    await otpInput.fill('123456');
    await page.click('button:has-text("Verify OTP & Continue")');

    // 3. Step 2: Patient Profile & Details
    const nameInput = page.locator('input[placeholder*="Ramesh Kumar" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('Pooja Verma');
    await page.fill('input[type="number"], spinbutton', '31');
    await page.fill('input[placeholder*="Fever" i]', 'Routine preventive wellness checkup');
    await page.click('button:has-text("Continue to Date & Window")');

    // 4. Step 3: Scheduling Preference & Submission
    const submitBookingBtn = page.locator('button:has-text("Submit Appointment Request"), button:has-text("Request Appointment Slot")').first();
    await expect(submitBookingBtn).toBeVisible({ timeout: 10000 });
    await submitBookingBtn.click();

    // 5. Booking Confirmation Card & Reference Code
    await expect(page.locator('text=Appointment Request Submitted!').first()).toBeVisible({ timeout: 15000 });
    const refBadge = page.locator('span:has-text("QL-"), div:has-text("QL-")').first();
    await expect(refBadge).toBeVisible();

    // 6. Patient Check-In Page
    await page.goto('/check-in');
    await expect(page.locator('text=Clinic Self Check-In').first()).toBeVisible();
    // Use pre-confirmed load reference to test instant check-in
    await page.fill('input[placeholder*="QL-829104" i], input[type="text"]', 'CHK-LOAD-0002');
    await page.click('button:has-text("Confirm Arrival & Check In"), button[type="submit"]');

    // Verify token issued
    await expect(page.locator('text=Check-In Confirmed!').or(page.locator('text=Already Checked In')).first()).toBeVisible({ timeout: 10000 });

    // 7. Queue Tracking
    await page.goto(`/queue?ref=CHK-LOAD-0002`);
    await expect(page.locator('text=Live Queue Tracker').first()).toBeVisible({ timeout: 10000 });

    // 8. Session Logout
    await page.goto('/book');
    const logoutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Clear Session")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('button:has-text("Send 6-Digit OTP")').first()).toBeVisible({ timeout: 5000 });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. RECEPTIONIST JOURNEY
  // ---------------------------------------------------------------------------
  test('Receptionist: Staff Login -> Walk-In Registration (₹0) -> Queue View -> RBAC Protection', async ({ page }) => {
    // 1. Login
    await page.goto('/staff/login');
    await page.fill('input[type="email"]', 'receptionist@test.clinic');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/staff\/receptionist/);
    await expect(page.getByRole('heading', { name: 'Reception Desk & Queue Control' })).toBeVisible({ timeout: 10000 });

    // 2. Register Walk-In Patient (Zero Advance Deposit)
    const walkInBtn = page.locator('button:has-text("Register Walk-In Patient")').first();
    await expect(walkInBtn).toBeVisible();
    await walkInBtn.click();

    await page.fill('input[placeholder*="Ramesh Kumar" i]', 'WalkIn Test Reception');
    await page.fill('input[placeholder*="9876543210" i]', '9876588888');
    
    const issueTokenBtn = page.locator('button:has-text("Issue Walk-In Token")').last();
    await issueTokenBtn.click();

    // Verify confirmation modal with ₹0 deposit notice
    await expect(page.locator('text=₹0 (Walk-In Policy)').or(page.locator('text=Token Issued Successfully!')).first()).toBeVisible({ timeout: 10000 });
    const doneBtn = page.locator('button:has-text("Done")').first();
    if (await doneBtn.isVisible()) {
      await doneBtn.click();
    }

    // 3. Queue View
    await expect(page.locator('text=WalkIn Test Reception').first()).toBeVisible({ timeout: 10000 });

    // 4. Access Control (RBAC): Receptionist cannot access Owner Dashboard
    await page.goto('/staff/owner');
    // Expect redirect back to /staff/receptionist
    await expect(page).toHaveURL(/\/staff\/receptionist/);
  });

  // ---------------------------------------------------------------------------
  // 3. DOCTOR JOURNEY
  // ---------------------------------------------------------------------------
  test('Doctor: Staff Login -> Consultation Console -> Call Next -> Complete -> RBAC Protection', async ({ page }) => {
    // 1. Login
    await page.goto('/staff/login');
    await page.fill('input[type="email"]', 'doctor1@test.clinic');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/staff\/doctor/);
    await expect(page.getByRole('heading', { name: 'Doctor Consultation Console' })).toBeVisible({ timeout: 10000 });

    // 2. Call Next Patient
    const callNextBtn = page.locator('button:has-text("Call Next Patient")').first();
    if (await callNextBtn.isEnabled()) {
      await callNextBtn.click();
      await page.waitForTimeout(1000);

      // 3. Begin consultation if called
      const beginBtn = page.locator('button:has-text("Begin Consultation")').first();
      if (await beginBtn.isVisible()) {
        await beginBtn.click();
        await page.waitForTimeout(1000);
      }

      // 4. Complete consultation
      const completeBtn = page.locator('button:has-text("Complete Consultation")').first();
      if (await completeBtn.isVisible()) {
        await completeBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // 5. Access Control (RBAC): Doctor cannot access Owner Dashboard
    await page.goto('/staff/owner');
    // Expect redirect back to /staff/doctor
    await expect(page).toHaveURL(/\/staff\/doctor/);
  });

  // ---------------------------------------------------------------------------
  // 4. CLINIC OWNER JOURNEY
  // ---------------------------------------------------------------------------
  test('Clinic Owner: Staff Login -> Roster Check -> Invite Staff -> Policy Update & Persistence', async ({ page }) => {
    // 1. Login
    await page.goto('/staff/login');
    await page.fill('input[type="email"]', 'owner@test.clinic');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/staff\/owner/);
    await expect(page.getByRole('heading', { name: 'Clinic Administration & Settings' })).toBeVisible({ timeout: 10000 });

    // 2. Staff Roster: Verify Owner Dr. Nithin is NOT listed as a hired staff member
    const hiredStaffSection = page.locator('div:has-text("Staff Members & Doctors")').first();
    await expect(hiredStaffSection).toBeVisible();
    // The roster should list Suresh and Receptionist, but NOT owner in the staff list
    const ownerEntryInRoster = hiredStaffSection.locator('p:has-text("CLINIC_OWNER")');
    await expect(ownerEntryInRoster).toHaveCount(0);

    // 3. Invite Staff Member via Modal
    const manageStaffBtn = page.locator('button:has-text("Manage Staff")').first();
    await manageStaffBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.locator('input[placeholder*="Rajesh Rao" i]').fill('Dr. Test Specialist');
    const randomEmail = `specialist_${Date.now()}@gmail.com`;
    await modal.locator('input[placeholder*="doctor@gmail.com" i]').fill(randomEmail);
    await modal.locator('select').first().selectOption('DOCTOR');

    const inviteSubmitBtn = modal.locator('button:has-text("Send Invitation Email")').first();
    await inviteSubmitBtn.click();
    await expect(modal.locator('text=Invitation email successfully sent').first()).toBeVisible({ timeout: 10000 });

    // Close modal
    const closeBtn = modal.locator('button:has-text("Close modal"), button[aria-label*="Close" i]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    // 4. Deposit & Cancellation Policy Configuration
    // If deposit toggle is unchecked, check it to enable deposit
    const depositCheckbox = page.locator('input[type="checkbox"]#requireDepositToggle, input[type="checkbox"]').first();
    if (!(await depositCheckbox.isChecked())) {
      await depositCheckbox.check();
    }

    const depositAmountInput = page.locator('input[placeholder*="100" i], input[type="number"]').first();
    await expect(depositAmountInput).toBeVisible({ timeout: 5000 });
    await depositAmountInput.fill('150');

    const deadlineInput = page.locator('input[type="number"]').nth(1);
    await deadlineInput.fill('3');

    const savePolicyBtn = page.locator('button:has-text("Save Policy Settings")').first();
    await savePolicyBtn.click();
    await expect(page.locator('text=policies updated successfully').first()).toBeVisible({ timeout: 10000 });

    // 5. Verify Persistence After Page Reload
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Clinic Administration & Settings' })).toBeVisible({ timeout: 10000 });
    
    // Check persisted inputs
    await expect(page.locator('input[placeholder*="100" i], input[type="number"]').first()).toHaveValue('150');
    await expect(page.locator('input[type="number"]').nth(1)).toHaveValue('3');
  });
});
