/**
 * ZAFEEN ENTERPRISE - WhatsApp Automation Gateway for Next.js
 * Integration: Multi-Tenant Singleton Pattern for Persistent Sessions
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');


// Store multiple school instances in a Map
// Key: schoolId, Value: { client, qrCode, isReady }
const schools = new Map();

/**
 * Initializes a unique WhatsApp Client for a specific school
 * @param {string} schoolId - Unique ID for the school from your database
 */
const initWhatsApp = (schoolId) => {
    if (!schoolId) throw new Error("School ID is required for initialization.");

    // Return existing instance if already initialized
    if (schools.has(schoolId)) {
        return schools.get(schoolId).client;
    }
    
    console.log(`[Zafeen Lyceum] Initializing WhatsApp: ${schoolId}`);
    
    // 1. CLEAR STALE LOCKS (Fixes "Profile in use" error)
    const sessionDir = path.join("/data/.wwebjs_auth", `session-${schoolId}`);
    const lockFiles = [
        path.join(sessionDir, 'SingletonLock'),
        path.join(sessionDir, 'Default', 'SingletonLock'),
        path.join(sessionDir, 'SingletonCookie'),
        path.join(sessionDir, 'SingletonSocket')
    ];

    lockFiles.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
                console.log(`[Zafeen Lyceum] Cleared stale lock: ${file}`);
            } catch (e) {
                console.error(`[Zafeen Lyceum] Could not clear lock ${file}:`, e.message);
            }
        }
    });

    console.log(`[Zafeen Lyceum] Pupeteer Path from env: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);

    const client = new Client({
        authStrategy: new LocalAuth({ 
            clientId: schoolId,
            dataPath: "/data/.wwebjs_auth"
        }),
        puppeteer: {
            headless: 'shell',
            // Fallback to Puppeteer's internal path if local, use env var on Railway
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    // Initialize the state object in the map
    schools.set(schoolId, {
        client: client,
        qrCode: null,
        isReady: false
    });

    client.on('qr', (qr) => {
        const school = schools.get(schoolId);
        if (school) {
            school.qrCode = qr;
            school.isReady = false;
        }
        console.log(`[Zafeen Lyceum] New QR for ${schoolId}. Awaiting scan...`);
    });

    client.on('ready', () => {
        const school = schools.get(schoolId);
        if (school) {
            school.qrCode = null;
            school.isReady = true;
        }
        console.log(`[Zafeen Lyceum] ${schoolId} is now ONLINE.`);
    });

    client.on('authenticated', () => {
        console.log(`[Zafeen Lyceum] ${schoolId} authenticated.`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`[Zafeen Lyceum] Auth failure for ${schoolId}:`, msg);
        schools.delete(schoolId);
    });

    client.on('disconnected', (reason) => {
        console.log(`[Zafeen Lyceum] ${schoolId} disconnected: ${reason}`);
        schools.delete(schoolId);
    });

    client.initialize();
    return client;
};

/**
 * Sending Functionality for Multi-Tenant
 */
async function sendFeeAlert(schoolId, phoneNumber, studentName, amount, dueDate) {
    const school = schools.get(schoolId);

    if (!school || !school.isReady) {
        throw new Error(`WhatsApp for ${schoolId} is not ready or linked.`);
    }

    const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
    
    const message = `*FEE ALERT: ${studentName}*\n\n` +
                    `Dear Parent, this is a reminder regarding the school fee for the current month.\n\n` +
                    `*Amount:* PKR ${amount}\n` +
                    `*Due Date:* ${dueDate}\n\n` +
                    `Fee Voucher is available on the parent portal.\n\n` +
                    `Please ignore if already paid. Thank you.\n` +
                    `_Sent via Zafeen Lyceum_`;

    try {
        // Random human-like delay (3 to 8 seconds)
        const delay = Math.floor(Math.random() * 5000) + 3000;
        await new Promise(resolve => setTimeout(resolve, delay));

        await school.client.sendMessage(formattedNumber, message);
        return { success: true };
    } catch (err) {
        console.error(`[Error] ${schoolId} failed sending to ${studentName}:`, err);
        return { success: false, error: err.message };
    }
}

/**
 * Getter for current status of a specific school
 */
const getStatus = (schoolId) => {
    const school = schools.get(schoolId);
    if (!school) return { exists: false, isReady: false, qrCode: null };
    
    return {
        exists: true,
        isReady: school.isReady,
        qrCode: school.qrCode
    };
};

module.exports = { 
    initWhatsApp, 
    sendFeeAlert, 
    getStatus 
};