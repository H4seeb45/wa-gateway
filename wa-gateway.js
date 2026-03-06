/**
 * ZAFEEN ENTERPRISE - WhatsApp Automation Gateway for Next.js
 * Integration: Multi-Tenant Singleton Pattern for Persistent Sessions
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');


// Store multiple school instances in a Map
// Key: schoolId, Value: { client, qrCode, isReady, queue, isProcessing, stats }
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
        try {
            if (fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) {
                fs.unlinkSync(file);
                console.log(`[Zafeen Lyceum] UNLOCKED: ${file}`);
            }
        } catch (e) {
            // Log only if it's not a "file not found" error
            if (e.code !== 'ENOENT') {
                console.error(`[Zafeen Lyceum] Lock clear failed for ${file}:`, e.message);
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
        isReady: false,
        queue: [],
        isProcessing: false,
        stats: { sent: 0, failed: 0 }
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
        console.log(`[Zafeen Lyce_um] ${schoolId} authenticated.`);
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
 * Queue Processor
 */
async function processQueue(schoolId) {
    const school = schools.get(schoolId);
    if (!school || school.isProcessing || school.queue.length === 0) return;

    school.isProcessing = true;
    console.log(`[Queue] Starting processing for ${schoolId}. Queue size: ${school.queue.length}`);

    let batchCount = 0;
    let megaBatchCount = 0;
    const TOTAL_BATCHES_BEFORE_MEGA = Math.floor(Math.random() * 3) + 3; // 3 to 5 batches

    while (school.queue.length > 0) {
        // Safety: If school was deleted from Map (disconnected), stop processing
        if (!schools.has(schoolId)) break;

        const { phoneNumber, message } = school.queue.shift();

        try {
            // Human Simulation: Brief "Typing..." status
            const chat = await school.client.getChatById(phoneNumber);
            await chat.sendStateTyping();
            
            // Random "typing duration" (3 to 6 seconds)
            const typingDuration = Math.floor(Math.random() * 3000) + 3000;
            await new Promise(r => setTimeout(r, typingDuration));

            // Send message
            await school.client.sendMessage(phoneNumber, message);
            school.stats.sent++;
            
            console.log(`[Queue] Sent to ${phoneNumber}. Total sent: ${school.stats.sent}`);
            
            // Random delay between messages (8 to 25 seconds for safety)
            const delay = Math.floor(Math.random() * 17000) + 8000;
            
            // Batching Logic
            batchCount++;
            if (batchCount >= (Math.floor(Math.random() * 11) + 15)) { // Batch of 15-25
                batchCount = 0;
                megaBatchCount++;

                if (megaBatchCount >= TOTAL_BATCHES_BEFORE_MEGA) {
                    // MEGA BREAK: 5 to 10 minutes
                    const megaBreakTime = Math.floor(Math.random() * 300000) + 300000;
                    console.log(`[Queue] MEGA BREAK reached (${megaBatchCount} batches done). Resting for ${megaBreakTime/60000} mins...`);
                    await new Promise(r => setTimeout(r, megaBreakTime));
                    megaBatchCount = 0;
                } else {
                    // Normal Batch Break: 1 to 4 minutes
                    const breakTime = Math.floor(Math.random() * 180000) + 60000;
                    console.log(`[Queue] Batch limit reached. Taking a random break for ${breakTime/1000}s...`);
                    await new Promise(r => setTimeout(r, breakTime));
                }
            } else if (school.queue.length > 0) {
                await new Promise(r => setTimeout(r, delay));
            }

        } catch (err) {
            console.error(`[Queue Error] Failed for ${phoneNumber}:`, err.message);
            school.stats.failed++;
        }
    }

    school.isProcessing = false;
    console.log(`[Queue] Finished processing for ${schoolId}.`);
}

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

    // Add to queue
    school.queue.push({ 
        phoneNumber: formattedNumber, 
        message 
    });
    
    // Start processing if not already doing so (async)
    processQueue(schoolId);

    return { success: true, status: 'queued', queueLength: school.queue.length };
}

/**
 * Generic Message Sender for Broadcasts
 */
async function sendBroadcastMessage(schoolId, phoneNumber, messageText) {
    const school = schools.get(schoolId);

    if (!school || !school.isReady) {
        throw new Error(`WhatsApp for ${schoolId} is not ready or linked.`);
    }

    const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
    
    // Add to queue
    school.queue.push({ 
        phoneNumber: formattedNumber, 
        message: messageText 
    });
    
    // Start processing if not already doing so (async)
    processQueue(schoolId);

    return { success: true, status: 'queued', queueLength: school.queue.length };
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
        qrCode: school.qrCode,
        queueLength: school.queue.length,
        stats: school.stats
    };
};

module.exports = { 
    initWhatsApp, 
    sendFeeAlert, 
    sendBroadcastMessage,
    getStatus 
};
