import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, ".secret");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getOrCreateSessionSecret(): string {
  const fromEnv = process.env["SESSION_SECRET"];
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    const value = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (value.length >= 16) return value;
  }
  const value = randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_FILE, value, { mode: 0o600 });
  return value;
}

function loadUsers(): StoredUser[] {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function findUserByUsername(username: string): StoredUser | null {
  const users = loadUsers();
  const normalized = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === normalized) ?? null;
}

export function findUserById(id: string): StoredUser | null {
  const users = loadUsers();
  return users.find((u) => u.id === id) ?? null;
}

export function createUser(username: string, password: string): StoredUser {
  const users = loadUsers();
  const trimmed = username.trim();
  const exists = users.some(
    (u) => u.username.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) {
    throw new Error("Username already taken");
  }
  const user: StoredUser = {
    id: randomBytes(8).toString("hex"),
    username: trimmed,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}
