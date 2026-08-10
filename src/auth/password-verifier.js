"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const SCRYPT_PREFIX = "scrypt";
const MAX_SCRYPT_N = 1 << 16;
const MAX_SCRYPT_R = 16;
const MAX_SCRYPT_P = 4;

function parseScryptHash(storedHash) {
  if (typeof storedHash !== "string") {
    return null;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return null;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  let expected;
  try {
    expected = Buffer.from(parts[5], "base64url");
  } catch (error) {
    return null;
  }

  if (!Number.isSafeInteger(N) || N < 2 || (N & (N - 1)) !== 0 || N > MAX_SCRYPT_N
    || !Number.isSafeInteger(r) || r < 1 || r > MAX_SCRYPT_R
    || !Number.isSafeInteger(p) || p < 1 || p > MAX_SCRYPT_P
    || !salt || expected.length < 16 || expected.length > 128) {
    return null;
  }

  return { N, r, p, salt, expected };
}

function verifyScrypt(candidatePassword, parsed) {
  const maxmem = Math.max(32 * 1024 * 1024, 128 * parsed.N * parsed.r + 1024 * 1024);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(candidatePassword),
      parsed.salt,
      parsed.expected.length,
      { N: parsed.N, r: parsed.r, p: parsed.p, maxmem },
      (error, actual) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          actual.length === parsed.expected.length
          && crypto.timingSafeEqual(actual, parsed.expected)
        );
      }
    );
  });
}

async function verifyPassword(candidatePassword, storedHash) {
  const parsed = parseScryptHash(storedHash);
  if (parsed) {
    return verifyScrypt(candidatePassword, parsed);
  }
  if (typeof storedHash === "string" && /^\$2[aby]\$/.test(storedHash)) {
    return bcrypt.compare(String(candidatePassword), storedHash);
  }
  return false;
}

module.exports = { parseScryptHash, verifyPassword };
