import bcrypt from 'bcrypt';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database.js';
import { Clinic, StaffUser, STAFF_ROLES, STAFF_STATUS, Department, AuditLog } from '../models/index.js';
import { logger } from '../shared/logger.js';

/**
 * Helper to ask a question with regular visible input
 */
function askQuestion(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (ans) => resolve(ans.trim()));
  });
}

/**
 * Helper to ask a password question with masked (*) input in terminal
 */
function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const stdin = process.stdin;
    process.stdout.write(query);
    let password = '';

    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      const onData = (chunk) => {
        for (const char of chunk) {
          if (char === '\r' || char === '\n' || char === '\u0004') {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            rl.close();
            process.stdout.write('\n');
            return resolve(password);
          } else if (char === '\u0003') {
            // Ctrl+C
            process.exit(1);
          } else if (char === '\b' || char === '\x7f') {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            password += char;
            process.stdout.write('*');
          }
        }
      };

      stdin.on('data', onData);
    } else {
      // Non-interactive fallback
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

/**
 * One-time Clinic Owner Bootstrap CLI
 */
export async function bootstrapOwner({
  ownerName,
  ownerEmail,
  ownerPassword,
  ownerPhone = '+919876500001',
  clinicName = 'Aarogyam Community Clinic',
  clinicSlug = 'aarogyam-clinic',
} = {}) {
  // Check if an owner already exists in the database
  const existingOwner = await StaffUser.findOne({ role: STAFF_ROLES.CLINIC_OWNER });
  if (existingOwner) {
    logger.warn('Clinic Owner already initialized. Refusing duplicate bootstrap.', {
      existingOwnerEmail: existingOwner.email,
    });
    return {
      success: false,
      alreadyInitialized: true,
      message: 'Clinic Owner already initialized. Refusing duplicate bootstrap.',
      ownerId: existingOwner._id.toString(),
      existingOwnerEmail: existingOwner.email,
    };
  }

  // Validate Owner Name
  if (!ownerName || ownerName.trim().length < 2) {
    throw new Error('Owner name is required (minimum 2 characters).');
  }

  // Validate Owner Email - In test mode allow test domain, in real use strictly enforce @gmail.com
  const normalizedEmail = (ownerEmail || '').toLowerCase().trim();
  const isTest = process.env.NODE_ENV === 'test';
  const emailRegex = isTest
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    : /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

  if (!emailRegex.test(normalizedEmail)) {
    throw new Error('Owner email is required and must end with @gmail.com (e.g. nithintony361@gmail.com).');
  }

  // Validate Owner Password
  if (!ownerPassword || ownerPassword.length < 8) {
    throw new Error('Owner password must be at least 8 characters long.');
  }

  // Find or create clinic
  let clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) {
    clinic = await Clinic.create({
      name: clinicName,
      slug: clinicSlug,
      timezone: 'Asia/Kolkata',
      address: {
        street: '12 Gandhi Road, Near Clock Tower',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500001',
        country: 'IN',
      },
      contact: {
        phone: ownerPhone,
        email: normalizedEmail,
      },
      operatingHours: [
        { dayOfWeek: 1, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 2, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 3, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 4, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 5, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 6, isClosed: false, shifts: [{ startTime: '09:00', endTime: '14:00' }] },
        { dayOfWeek: 0, isClosed: true, shifts: [] }, // Sunday closed
      ],
      settings: {
        defaultConsultationDurationMins: 15,
        slotHoldDurationSecs: 300,
        defaultDepositAmount: 100,
      },
      depositPolicy: {
        enabled: true,
        defaultAmount: 100,
        walkInRequiresDeposit: false,
      },
      cancellationPolicy: {
        deadlineHours: 2,
        refundPercentageBeforeDeadline: 100,
        refundPercentageAfterDeadline: 0,
        clinicCancellationRefundPercentage: 100,
        refundPercentage: 100,
      },
      localesEnabled: ['en', 'hi', 'te'],
      isActive: true,
    });
  }

  // Create default departments
  const defaultDepts = [
    { name: 'General Medicine', code: 'GEN' },
    { name: 'Pediatrics', code: 'PED' },
    { name: 'Orthopedics', code: 'ORT' },
  ];

  const createdDepts = [];
  for (const dept of defaultDepts) {
    let d = await Department.findOne({ clinicId: clinic._id, name: dept.name });
    if (!d) {
      d = await Department.create({
        clinicId: clinic._id,
        name: dept.name,
        code: dept.code,
        active: true,
      });
    }
    createdDepts.push(d._id);
  }

  // Hash password securely with bcrypt
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(ownerPassword, saltRounds);

  // Create Owner StaffUser record
  const owner = await StaffUser.create({
    clinicId: clinic._id,
    name: ownerName.trim(),
    email: normalizedEmail,
    phone: ownerPhone,
    passwordHash,
    role: STAFF_ROLES.CLINIC_OWNER,
    status: STAFF_STATUS.ACTIVE,
    departmentIds: createdDepts,
  });

  // Create immutable audit entry
  await AuditLog.create({
    clinicId: clinic._id,
    actorId: owner._id,
    actorRole: STAFF_ROLES.CLINIC_OWNER,
    actorEmailOrPhone: owner.email,
    action: 'CLINIC_BOOTSTRAPPED',
    entityType: 'StaffUser',
    entityId: owner._id.toString(),
    details: {
      clinicId: clinic._id.toString(),
      clinicName: clinic.name,
      ownerEmail: owner.email,
      ownerName: owner.name,
    },
  });

  logger.info('Clinic Owner bootstrapped successfully into database.', {
    clinicId: clinic._id.toString(),
    clinicName: clinic.name,
    ownerEmail: owner.email,
    role: owner.role,
  });

  return {
    success: true,
    alreadyInitialized: false,
    clinicId: clinic._id.toString(),
    clinicName: clinic.name,
    ownerId: owner._id.toString(),
    ownerName: owner.name,
    ownerEmail: owner.email,
  };
}

// CLI Interactive Runner
if (process.argv[1]?.endsWith('bootstrap-owner.js')) {
  (async () => {
    try {
      await connectDB();

      // Check if CLI flags or env vars were supplied
      let ownerName = process.env.BOOTSTRAP_OWNER_NAME;
      let ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL;
      let ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD;
      let clinicName = process.env.BOOTSTRAP_CLINIC_NAME || 'Aarogyam Community Clinic';

      // Parse CLI arguments if passed (e.g. --name "Dr. Nithin" --email "nithintony361@gmail.com")
      const args = process.argv.slice(2);
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && args[i + 1]) ownerName = args[++i];
        if (args[i] === '--email' && args[i + 1]) ownerEmail = args[++i];
        if (args[i] === '--password' && args[i + 1]) ownerPassword = args[++i];
        if (args[i] === '--clinic' && args[i + 1]) clinicName = args[++i];
      }

      // If missing and interactive, prompt the user in the terminal
      if (!ownerName || !ownerEmail || !ownerPassword) {
        console.log('\n=============================================================');
        console.log('       QueueLess — One-Time Clinic Owner Bootstrap CLI        ');
        console.log('=============================================================');
        console.log('Please enter the initial Clinic Owner account details.\n');

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        if (!ownerName) {
          ownerName = await askQuestion(rl, '1. Enter Owner Full Name (e.g. Dr. Nithin): ');
        }

        if (!ownerEmail) {
          ownerEmail = await askQuestion(rl, '2. Enter Owner Email (must end with @gmail.com): ');
        }
        rl.close();

        // Email validation
        const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
        if (!gmailRegex.test(ownerEmail)) {
          console.error('\n✗ Error: Owner email must end with @gmail.com (e.g. nithintony361@gmail.com).\n');
          await disconnectDB();
          process.exit(1);
        }

        // Password Prompt (Masked)
        if (!ownerPassword) {
          ownerPassword = await askHidden('3. Enter Owner Password (minimum 8 characters): ');
          if (ownerPassword.length < 8) {
            console.error('\n✗ Error: Password must be at least 8 characters long.\n');
            await disconnectDB();
            process.exit(1);
          }

          const confirmPassword = await askHidden('4. Confirm Owner Password: ');
          if (ownerPassword !== confirmPassword) {
            console.error('\n✗ Error: Passwords do not match.\n');
            await disconnectDB();
            process.exit(1);
          }
        }
      }

      const result = await bootstrapOwner({
        ownerName,
        ownerEmail,
        ownerPassword,
        clinicName,
      });

      console.log('\n=============================================================');
      console.log('  ✓ CLINIC OWNER BOOTSTRAPPED SUCCESSFULLY INTO ATLAS!       ');
      console.log('=============================================================');
      console.log(`  Clinic Name : ${result.clinicName}`);
      console.log(`  Owner Name  : ${result.ownerName}`);
      console.log(`  Owner Email : ${result.ownerEmail}`);
      console.log(`  Role        : CLINIC_OWNER`);
      console.log(`  Status      : ACTIVE`);
      console.log('=============================================================\n');

      await disconnectDB();
      process.exit(0);
    } catch (err) {
      console.error('\n✗ Bootstrap failed with error:', err.message, '\n');
      await disconnectDB().catch(() => {});
      process.exit(1);
    }
  })();
}
