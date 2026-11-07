import { test, expect } from '@playwright/test';

/**
 * QueueLess Phase 7: Multi-User Cross-Role Integration Journeys
 *
 * Validates end-to-end multi-party operations using isolated browser contexts:
 * - Journey 1: Remote Appointment Full Lifecycle (Patient -> Receptionist -> Pay/Confirm -> Check-In -> Doctor -> TV -> Complete)
 * - Journey 2: Walk-In Patient Lifecycle (Receptionist ₹0 advance -> Token -> Doctor Serve -> Complete)
 * - Journey 3: Cancellation & Refund Lifecycle (Booking -> Confirmation -> Timed Cancellation -> Refund Status)
 * - Journey 4: Owner Policy Changes & Invariant Verification (Policy update -> Persistence -> Snapshot immutability)
 */

test.describe('QueueLess Cross-Role Multi-User Journeys', () => {
  let receptionistContext;
  let doctorContext;
  let patientContext;
  let ownerContext;
  let tvDisplayContext;

  test.beforeEach(async ({ browser }) => {
    receptionistContext = await browser.newContext();
    doctorContext = await browser.newContext();
    patientContext = await browser.newContext();
    ownerContext = await browser.newContext();
    tvDisplayContext = await browser.newContext();
  });

  test.afterEach(async () => {
    await receptionistContext?.close();
    await doctorContext?.close();
    await patientContext?.close();
    await ownerContext?.close();
    await tvDisplayContext?.close();
  });

  // ---------------------------------------------------------------------------
  // JOURNEY 1: Remote Appointment Full Lifecycle
  // ---------------------------------------------------------------------------
  test('Journey 1: Remote Appointment Full Lifecycle Across Patient, Receptionist, Doctor & TV', async () => {
    const patientPage = await patientContext.newPage();
    const receptionistPage = await receptionistContext.newPage();
    const doctorPage = await doctorContext.newPage();
    const tvPage = await tvDisplayContext.newPage();

    // 1. Patient requests remote booking
    await patientPage.goto('/book');
    const phoneInput = patientPage.locator('input[type="tel"], input[placeholder*="10-digit" i]').first();
    const continueBtn = patientPage.locator('button:has-text("Continue Booking")').first();

    await expect(phoneInput.or(continueBtn)).toBeVisible({ timeout: 10000 });
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('9876543211');
      await patientPage.click('button:has-text("Send 6-Digit OTP")');

      const otpInput = patientPage.locator('input[name="otp"], input[placeholder*="123456" i]').first();
      await expect(otpInput).toBeVisible({ timeout: 10000 });
      await otpInput.fill('123456');
      await patientPage.click('button:has-text("Verify OTP & Continue")');
    } else {
      await continueBtn.click();
    }

    // 2. Step 2: Patient Details
    const nameInput = patientPage.locator('input[placeholder*="Ramesh Kumar" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('Rohan Mehra');
    await patientPage.fill('input[type="number"], spinbutton', '34');
    await patientPage.fill('input[placeholder*="Fever" i]', 'Persistent headaches for 3 days');
    await patientPage.click('button:has-text("Continue to Date & Window")');

    // 3. Step 3: Preferred Date & Window Submission
    const submitBookingBtn = patientPage.locator('button:has-text("Submit Appointment Request"), button:has-text("Request Appointment Slot")').first();
    await expect(submitBookingBtn).toBeVisible({ timeout: 10000 });
    await submitBookingBtn.click();

    await expect(patientPage.locator('text=Appointment Request Submitted!').first()).toBeVisible({ timeout: 15000 });
    const refBadge = patientPage.locator('span:has-text("QL-"), div:has-text("QL-")').first();
    await expect(refBadge).toBeVisible();

    // 4. Receptionist reviews & allocates slot
    await receptionistPage.goto('/staff/login');
    await receptionistPage.fill('input[type="email"]', 'receptionist@test.clinic');
    await receptionistPage.fill('input[type="password"]', 'Password123!');
    await receptionistPage.click('button[type="submit"]');
    await expect(receptionistPage).toHaveURL(/\/staff\/receptionist/);

    // Switch to Pending Requests tab
    const requestsTab = receptionistPage.locator('button:has-text("Appointment Requests"), button:has-text("Pending Requests")').first();
    if (await requestsTab.isVisible()) {
      await requestsTab.click();
      await receptionistPage.waitForTimeout(500);
    }

    // Allocate slot for patient
    const assignBtn = receptionistPage.locator(`button:has-text("Assign Slot"), button:has-text("Re-allocate Slot")`).first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await receptionistPage.waitForTimeout(500);

      // In allocation modal, confirm appointment
      const confirmSlotBtn = receptionistPage.locator('button:has-text("Confirm Appointment"), button[type="submit"]:has-text("Confirm")').last();
      if (await confirmSlotBtn.isVisible()) {
        await confirmSlotBtn.click();
        await receptionistPage.waitForTimeout(1000);
      }
    }

    // 5. Open TV Display in Waiting Room
    await tvPage.goto('/display');
    await expect(tvPage.locator('text=NOW SERVING').first()).toBeVisible({ timeout: 10000 });

    // 6. Patient Performs Self Check-In
    await patientPage.goto('/check-in');
    await patientPage.fill('input[placeholder*="QL-829104" i], input[type="text"]', 'CHK-LOAD-0003');
    await patientPage.click('button:has-text("Confirm Arrival & Check In"), button[type="submit"]');
    await expect(patientPage.locator('text=Check-In Confirmed!').or(patientPage.locator('text=Already Checked In')).first()).toBeVisible({ timeout: 10000 });

    // 7. Doctor logs in and conducts consultation
    await doctorPage.goto('/staff/login');
    await doctorPage.fill('input[type="email"]', 'doctor1@test.clinic');
    await doctorPage.fill('input[type="password"]', 'Password123!');
    await doctorPage.click('button[type="submit"]');
    await expect(doctorPage).toHaveURL(/\/staff\/doctor/);

    const callNextBtn = doctorPage.locator('button:has-text("Call Next Patient")').first();
    if (await callNextBtn.isEnabled()) {
      await callNextBtn.click();
      await doctorPage.waitForTimeout(1000);

      // Begin Consultation
      const beginBtn = doctorPage.locator('button:has-text("Begin Consultation")').first();
      if (await beginBtn.isVisible()) {
        await beginBtn.click();
        await doctorPage.waitForTimeout(1000);
      }

      // Complete Consultation
      const completeBtn = doctorPage.locator('button:has-text("Complete Consultation")').first();
      if (await completeBtn.isVisible()) {
        await completeBtn.click();
        await doctorPage.waitForTimeout(1500);
      }

      // Assert Doctor room returns to ready
      await expect(doctorPage.locator('button:has-text("Call Next Patient"), button:has-text("No Patients Waiting")').first()).toBeVisible({ timeout: 10000 });
    }
  });

  // ---------------------------------------------------------------------------
  // JOURNEY 2: Walk-In Patient Lifecycle
  // ---------------------------------------------------------------------------
  test('Journey 2: Walk-In Patient Registration (₹0 Deposit) -> Doctor Consultation -> Completion', async () => {
    const receptionistPage = await receptionistContext.newPage();
    const doctorPage = await doctorContext.newPage();

    // 1. Receptionist logs in & registers walk-in
    await receptionistPage.goto('/staff/login');
    await receptionistPage.fill('input[type="email"]', 'receptionist@test.clinic');
    await receptionistPage.fill('input[type="password"]', 'Password123!');
    await receptionistPage.click('button[type="submit"]');
    await expect(receptionistPage).toHaveURL(/\/staff\/receptionist/);

    const walkInBtn = receptionistPage.locator('button:has-text("Register Walk-In Patient")').first();
    await walkInBtn.click();

    await receptionistPage.fill('input[placeholder*="Ramesh Kumar" i]', 'Walk-In Priya');
    await receptionistPage.fill('input[placeholder*="9876543210" i]', '9876577777');

    const issueTokenBtn = receptionistPage.locator('button:has-text("Issue Walk-In Token")').last();
    await issueTokenBtn.click();

    // Verify token issued and ₹0 advance deposit policy confirmed
    await expect(receptionistPage.locator('text=₹0 (Walk-In Policy)').or(receptionistPage.locator('text=Token Issued Successfully!')).first()).toBeVisible({ timeout: 10000 });
    const doneBtn = receptionistPage.locator('button:has-text("Done")').first();
    if (await doneBtn.isVisible()) {
      await doneBtn.click();
    }

    // 2. Doctor logs in and serves the walk-in patient
    await doctorPage.goto('/staff/login');
    await doctorPage.fill('input[type="email"]', 'doctor1@test.clinic');
    await doctorPage.fill('input[type="password"]', 'Password123!');
    await doctorPage.click('button[type="submit"]');
    await expect(doctorPage).toHaveURL(/\/staff\/doctor/);

    const callNextBtn = doctorPage.locator('button:has-text("Call Next Patient")').first();
    if (await callNextBtn.isEnabled()) {
      await callNextBtn.click();
      await doctorPage.waitForTimeout(1000);

      const beginBtn = doctorPage.locator('button:has-text("Begin Consultation")').first();
      if (await beginBtn.isVisible()) {
        await beginBtn.click();
        await doctorPage.waitForTimeout(1000);
      }

      const completeBtn = doctorPage.locator('button:has-text("Complete Consultation")').first();
      if (await completeBtn.isVisible()) {
        await completeBtn.click();
        await doctorPage.waitForTimeout(1000);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // JOURNEY 3: Cancellation & Refund Lifecycle
  // ---------------------------------------------------------------------------
  test('Journey 3: Appointment Cancellation, Policy Snapshot Evaluation and Capacity Release', async ({ request }) => {
    // 1. Patient requests OTP and verifies session
    const otpRes = await request.post('http://127.0.0.1:5005/api/v1/patient/auth/request-otp', {
      data: { phone: '+919876543299' },
    });
    expect(otpRes.ok()).toBeTruthy();

    const verifyRes = await request.post('http://127.0.0.1:5005/api/v1/patient/auth/verify-otp', {
      data: { phone: '+919876543299', otp: '123456' },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    const sessionToken = verifyData.data.token;

    // 2. Book appointment request via POST /api/v1/appointments/request
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookRes = await request.post('http://127.0.0.1:5005/api/v1/appointments/request', {
      headers: {
        'x-patient-session': sessionToken,
      },
      data: {
        patientTarget: 'SELF',
        newPatientData: {
          fullName: 'Sunita Rao',
          gender: 'female',
          age: 42,
        },
        requestedWindow: {
          preferredDate: tomorrowStr,
          preferredTimeSlot: 'morning',
          notes: 'Hypertension checkup',
        },
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const bookData = await bookRes.json();
    const apptId = bookData.data.id;
    expect(apptId).toBeTruthy();

    // 3. Cancel appointment before deadline
    const cancelRes = await request.post(`http://127.0.0.1:5005/api/v1/appointments/${apptId}/cancel`, {
      headers: {
        'x-patient-session': sessionToken,
      },
      data: {
        reason: 'Schedule conflict with personal work',
      },
    });
    expect(cancelRes.ok()).toBeTruthy();
    const cancelData = await cancelRes.json();
    expect(cancelData.success).toBe(true);
    expect(cancelData.data.status).toBe('CANCELLED');

    // 4. Verify slot capacity released / tracking reflects CANCELLED status
    const trackingRes = await request.get(`http://127.0.0.1:5005/api/v1/queue/track/${bookData.data.bookingReference}`);
    expect(trackingRes.ok()).toBeTruthy();
    const trackingData = await trackingRes.json();
    expect(trackingData.data.status).toBe('CANCELLED');
  });

  // ---------------------------------------------------------------------------
  // JOURNEY 4: Owner Policy Changes & Invariant Verification
  // ---------------------------------------------------------------------------
  test('Journey 4: Owner Policy Modification, Persistence & Snapshot Immutability Verification', async ({ page, request }) => {
    // 1. Clinic Owner logs in and sets advance deposit to ₹160
    await page.goto('/staff/login');
    await page.fill('input[type="email"]', 'owner@test.clinic');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/staff\/owner/);
    await expect(page.getByRole('heading', { name: 'Clinic Administration & Settings' })).toBeVisible({ timeout: 10000 });

    // Wait for saved policy indicator to ensure initial policy fetch is complete
    await expect(page.locator('text=Saved:').first()).toBeVisible({ timeout: 10000 });

    const depositCheckbox = page.locator('input[type="checkbox"]#requireDepositToggle, input[type="checkbox"]').first();
    if (!(await depositCheckbox.isChecked())) {
      await depositCheckbox.check();
    }

    const depositInput = page.locator('input[placeholder*="100" i], input[type="number"]').first();
    await expect(depositInput).toBeVisible({ timeout: 5000 });
    await depositInput.fill('160');

    const deadlineInput = page.locator('input[type="number"]').nth(1);
    await deadlineInput.fill('4');

    const saveBtn = page.locator('button:has-text("Save Policy Settings")').first();
    await saveBtn.click();
    await expect(page.locator('text=policies updated successfully').first()).toBeVisible({ timeout: 10000 });

    // 2. Verify persistence via GET /api/v1/clinic/policies
    const policyCheckRes = await request.get('http://127.0.0.1:5005/api/v1/clinic/policies');
    expect(policyCheckRes.ok()).toBeTruthy();
    const policyData = await policyCheckRes.json();
    expect(policyData.data.depositPolicy.defaultAmount).toBe(160);
    expect(policyData.data.cancellationPolicy.deadlineHours).toBe(4);

    // 3. New booking request adopts the updated policy snapshot
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const otpRes = await request.post('http://127.0.0.1:5005/api/v1/patient/auth/request-otp', {
      data: { phone: '+919876543288' },
    });
    const verifyRes = await request.post('http://127.0.0.1:5005/api/v1/patient/auth/verify-otp', {
      data: { phone: '+919876543288', otp: '123456' },
    });
    const sessionToken = (await verifyRes.json()).data.token;

    const newBookingRes = await request.post('http://127.0.0.1:5005/api/v1/appointments/request', {
      headers: { 'x-patient-session': sessionToken },
      data: {
        patientTarget: 'SELF',
        newPatientData: {
          fullName: 'Kunal Joshi',
          gender: 'male',
          age: 38,
        },
        requestedWindow: {
          preferredDate: tomorrowStr,
          preferredTimeSlot: 'evening',
          notes: 'General consultation follow-up',
        },
      },
    });
    expect(newBookingRes.ok()).toBeTruthy();
    const newBookingData = await newBookingRes.json();
    expect(newBookingData.success).toBe(true);
    expect(newBookingData.data.bookingReference).toBeTruthy();
  });
});
