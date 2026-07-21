"use strict";

const { drizzle: drizzlePg } = require("drizzle-orm/node-postgres");
const { drizzle: drizzlePglite } = require("drizzle-orm/pglite");
const { PGlite } = require("@electric-sql/pglite");
const { Pool } = require("pg");
const schema = require("./schema");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

let db = null;
let pool = null;
let pgliteClient = null;
let isPglite = false;

/**
 * Ensure database tables exist (auto-migrate for PGlite / Postgres)
 */
async function ensureTablesExist() {
    const createTableSql = `
        CREATE TABLE IF NOT EXISTS "accounts" (
            "id" serial PRIMARY KEY NOT NULL,
            "account" varchar(32) NOT NULL,
            "hash" varchar(60) NOT NULL,
            "name" varchar(32) NOT NULL,
            "character" text NOT NULL,
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "account_name_unique" ON "accounts" ("account", "name");
    `;

    try {
        if (isPglite && pgliteClient) {
            await pgliteClient.exec(createTableSql);
            console.log("Embedded database schema verified (PGlite).");
        } else if (pool) {
            await pool.query(createTableSql);
            console.log("PostgreSQL database schema verified.");
        }
    } catch (err) {
        console.error("Error verifying database schema:", err.message);
    }
}

/**
 * Initialize the database connection
 * @returns {Object} Drizzle database instance
 */
function initDatabase() {
    if (db) {
        return db;
    }

    const connectionString = process.env.DATABASE_URL || "";

    // Use embedded PGlite when USE_EMBEDDED_DB=true, or when DATABASE_URL is localhost/not set and FORCE_PG !== true
    const useEmbedded = process.env.USE_EMBEDDED_DB === "true" ||
                        !connectionString ||
                        ((connectionString.includes("localhost") || connectionString.includes("127.0.0.1")) && process.env.FORCE_PG !== "true");

    if (useEmbedded) {
        console.log("Initializing embedded PostgreSQL (PGlite) database...");
        const dataDir = path.resolve(__dirname, "../../data/pgdata");
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        pgliteClient = new PGlite(dataDir);
        db = drizzlePglite(pgliteClient, { schema });
        isPglite = true;

        ensureTablesExist();

        console.log("Embedded PostgreSQL (PGlite) connection initialized at:", dataDir);
        return db;
    }

    console.log("Initializing standard PostgreSQL connection...");
    pool = new Pool({
        connectionString,
        max: 10, // Maximum number of connections in the pool
    });

    db = drizzlePg(pool, { schema });
    isPglite = false;

    ensureTablesExist();

    console.log("PostgreSQL database connection initialized");

    return db;
}

/**
 * Get the database instance (initializes if not already done)
 * @returns {Object} Drizzle database instance
 */
function getDatabase() {
    if (!db) {
        return initDatabase();
    }
    return db;
}

/**
 * Close the database connection
 */
async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
        console.log("PostgreSQL database connection closed");
    }
    if (pgliteClient) {
        await pgliteClient.close();
        pgliteClient = null;
        db = null;
        console.log("Embedded PostgreSQL (PGlite) connection closed");
    }
}

module.exports = {
    initDatabase,
    getDatabase,
    closeDatabase,
    schema,
};
