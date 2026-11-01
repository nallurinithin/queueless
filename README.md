# QueueLess

QueueLess is an India-first clinic appointment, queue and patient-coordination
web application. V1 supports one clinic with multiple doctors, departments and
receptionists.

## Repository layout

```
QueueLess/                                  ← Git root
├── queueless-app/                          ← Application code
│   ├── client/                             ← React / Vite / Tailwind frontend
│   ├── server/                             ← Node / Express backend
│   ├── tests/                              ← Automated test suites
│   └── infrastructure/                     ← Docker, deployment assets
├── QueueLess_Antigravity_Documentation/    ← Product specifications (gitignored)
├── decisions/                              ← Private development journal (gitignored)
├── .gitignore
└── README.md
```

## Quick start

```bash
# 1. Clone the repository
git clone <repo-url> QueueLess && cd QueueLess

# 2. Install dependencies
cd queueless-app && npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your local values

# 4. Start MongoDB (local or Atlas)
# Ensure a replica set is configured for transaction support

# 5. Start development servers
npm run dev
```

## Documentation

Product specifications live in `QueueLess_Antigravity_Documentation/docs/`.
That folder is **not** committed to Git — it is a local reference.

## Technology stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Frontend   | React 19, Vite, Tailwind CSS 4     |
| Backend    | Node.js (LTS), Express 5           |
| Database   | MongoDB 8 / Mongoose 8             |
| Realtime   | Socket.IO 4                        |
| Validation | Zod                                |
| Auth       | HttpOnly sessions, bcrypt, CSRF    |
| Payments   | Razorpay (sandbox → live)          |
| Languages  | English (default), Hindi, Telugu    |

## License

Private — not open source.

